package world

import (
	"hash/fnv"
	"math"
	"sort"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
)

const (
	bodyCollisionIterations = 4
	normalBodyMass          = 1.0
	bossBodyMass            = 4.0
)

type dynamicBody struct {
	kind      string
	id        string
	x         *float64
	y         *float64
	radius    float64
	mass      float64
	onCollide func()
}

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
		for i := 0; i < len(bodies); i++ {
			for j := i + 1; j < len(bodies); j++ {
				if resolveDynamicBodyPair(&bodies[i], &bodies[j]) {
					moved = true
				}
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
		})
	}
	return bodies
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
