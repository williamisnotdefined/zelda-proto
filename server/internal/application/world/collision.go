package world

import (
	"hash/fnv"
	"math"
	"sort"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
)

const (
	bodyCollisionIterations = 4
	normalBodyMass          = 1.0
	bossBodyMass            = 4.0
	bodyCollisionCellSize   = 128
)

type dynamicBody struct {
	kind      string
	id        string
	x         *float64
	y         *float64
	radius    float64
	mass      float64
	ignore    bool
	onCollide func()
}

type bodyPair struct{ i, j int }

func (w *World) resolveBodyCollisionsLocked() {
	bodies := w.dynamicBodiesLocked()
	if len(bodies) < 2 {
		w.syncDynamicIndexesLocked()
		return
	}

	sort.Slice(bodies, func(i, j int) bool {
		if bodies[i].kind != bodies[j].kind {
			return bodies[i].kind < bodies[j].kind
		}
		return bodies[i].id < bodies[j].id
	})

	for iter := 0; iter < bodyCollisionIterations; iter++ {
		moved := false
		pairs := candidateBodyPairs(bodies)
		for _, pair := range pairs {
			if resolveDynamicBodyPair(&bodies[pair.i], &bodies[pair.j]) {
				moved = true
			}
		}
		if !moved {
			break
		}
	}

	w.syncDynamicIndexesLocked()
}

func (w *World) dynamicBodiesLocked() []dynamicBody {
	bodies := make([]dynamicBody, 0, len(w.players)+len(w.enemies)+len(w.dragons)+len(w.gelehks)+len(w.vanessas))
	for _, p := range w.players {
		if p.State == player.StateDead {
			continue
		}
		bodies = append(bodies, dynamicBody{
			kind:   "player",
			id:     p.ID,
			x:      &p.X,
			y:      &p.Y,
			radius: player.Width / 2,
			mass:   normalBodyMass,
			ignore: w.pullOverlapBodies[dynamicBodyKey("player", p.ID)] > 0,
		})
	}
	for _, e := range w.enemies {
		if e.State == enemy.StateDead {
			continue
		}
		bodies = append(bodies, dynamicBody{
			kind:   "enemy",
			id:     e.ID,
			x:      &e.X,
			y:      &e.Y,
			radius: e.CollisionRadius(),
			mass:   normalBodyMass,
			ignore: w.pullOverlapBodies[dynamicBodyKey("enemy", e.ID)] > 0,
		})
	}
	for _, d := range w.dragons {
		if d.State == boss.StateDead {
			continue
		}
		bodies = append(bodies, dynamicBody{
			kind:   "boss",
			id:     d.ID,
			x:      &d.X,
			y:      &d.Y,
			radius: d.ContactRadius(),
			mass:   bossBodyMass,
			ignore: w.pullOverlapBodies[dynamicBodyKey("boss", d.ID)] > 0,
		})
	}
	for _, g := range w.gelehks {
		if g.State == boss.StateDead {
			continue
		}
		bodies = append(bodies, dynamicBody{
			kind:   "boss",
			id:     g.ID,
			x:      &g.X,
			y:      &g.Y,
			radius: g.ContactRadius(),
			mass:   bossBodyMass,
			ignore: w.pullOverlapBodies[dynamicBodyKey("boss", g.ID)] > 0,
			onCollide: func(g *boss.Gelehk) func() {
				return func() { g.StopChargeOnCollision() }
			}(g),
		})
	}
	for _, v := range w.vanessas {
		if v.State == boss.StateDead {
			continue
		}
		bodies = append(bodies, dynamicBody{
			kind:   "boss",
			id:     v.ID,
			x:      &v.X,
			y:      &v.Y,
			radius: v.ContactRadius(),
			mass:   bossBodyMass,
			ignore: w.pullOverlapBodies[dynamicBodyKey("boss", v.ID)] > 0,
		})
	}
	return bodies
}

func candidateBodyPairs(bodies []dynamicBody) []bodyPair {
	if len(bodies) < 2 {
		return nil
	}
	maxRadius := 0.0
	for _, body := range bodies {
		if body.radius > maxRadius {
			maxRadius = body.radius
		}
	}
	buckets := make(map[int64][]int, len(bodies))
	for i, body := range bodies {
		cx, cy := bodyCollisionCell(*body.x), bodyCollisionCell(*body.y)
		key := bodyCollisionCellKey(cx, cy)
		buckets[key] = append(buckets[key], i)
	}
	pairs := make([]bodyPair, 0, len(bodies)*2)
	for i, body := range bodies {
		radius := body.radius + maxRadius
		radiusSq := radius * radius
		minX, maxX := bodyCollisionCell(*body.x-radius), bodyCollisionCell(*body.x+radius)
		minY, maxY := bodyCollisionCell(*body.y-radius), bodyCollisionCell(*body.y+radius)
		for cx := minX; cx <= maxX; cx++ {
			for cy := minY; cy <= maxY; cy++ {
				for _, j := range buckets[bodyCollisionCellKey(cx, cy)] {
					if j <= i {
						continue
					}
					other := bodies[j]
					dx := *other.x - *body.x
					dy := *other.y - *body.y
					if dx*dx+dy*dy > radiusSq {
						continue
					}
					pairs = append(pairs, bodyPair{i: i, j: j})
				}
			}
		}
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].i != pairs[j].i {
			return pairs[i].i < pairs[j].i
		}
		return pairs[i].j < pairs[j].j
	})
	return pairs
}

func bodyCollisionCell(value float64) int {
	return int(math.Floor(value / bodyCollisionCellSize))
}

func bodyCollisionCellKey(cx, cy int) int64 {
	return int64(cx)<<32 | int64(uint32(cy))
}

func dynamicBodyKey(kind, id string) string {
	return kind + ":" + id
}

func (w *World) syncDynamicIndexesLocked() {
	for id, p := range w.players {
		w.playerIndex.Upsert(id, p.X, p.Y)
	}
	for id, e := range w.enemies {
		w.enemyIndex.Upsert(id, e.X, e.Y)
	}
	for id, d := range w.dragons {
		w.bossIndex.Upsert(id, d.X, d.Y)
	}
	for id, g := range w.gelehks {
		w.bossIndex.Upsert(id, g.X, g.Y)
	}
	for id, v := range w.vanessas {
		w.bossIndex.Upsert(id, v.X, v.Y)
	}
}

func resolveDynamicBodyPair(a, b *dynamicBody) bool {
	if a.ignore && b.ignore {
		return false
	}

	dx := *b.x - *a.x
	dy := *b.y - *a.y
	minDist := a.radius + b.radius
	distSq := dx*dx + dy*dy
	if distSq >= minDist*minDist {
		return false
	}

	var nx, ny, overlap float64
	if distSq == 0 {
		nx, ny = separationNormal(a.id, b.id)
		overlap = minDist
	} else {
		dist := math.Sqrt(distSq)
		nx = dx / dist
		ny = dy / dist
		overlap = minDist - dist
	}

	if overlap <= 0 {
		return false
	}

	totalMass := a.mass + b.mass
	if totalMass <= 0 {
		totalMass = 2
	}
	pushA := overlap * (b.mass / totalMass)
	pushB := overlap * (a.mass / totalMass)

	*a.x -= nx * pushA
	*a.y -= ny * pushA
	*b.x += nx * pushB
	*b.y += ny * pushB

	if a.onCollide != nil {
		a.onCollide()
	}
	if b.onCollide != nil {
		b.onCollide()
	}
	return true
}

func separationNormal(aID, bID string) (float64, float64) {
	h := fnv.New32a()
	_, _ = h.Write([]byte(aID))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(bID))
	angle := float64(h.Sum32()%360) * math.Pi / 180
	return math.Cos(angle), math.Sin(angle)
}
