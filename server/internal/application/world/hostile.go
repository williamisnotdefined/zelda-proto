package world

import (
	"github.com/williamisnotdefined/zelda-proto/server/internal/application/spatial"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
)

type bossTarget struct {
	id         string
	x          float64
	y          float64
	radius     float64
	state      func() boss.State
	hp         func() int
	takeDamage func(int)
}

func (t bossTarget) dead() bool { return t.state() == boss.StateDead }

func dragonBossTarget(d *boss.DragonLord) bossTarget {
	return bossTarget{
		id: d.ID, x: d.X, y: d.Y, radius: d.ContactRadius(),
		state: func() boss.State { return d.State },
		hp:    func() int { return d.HP },
		takeDamage: func(amount int) {
			d.TakeDamage(amount)
		},
	}
}

func gelehkBossTarget(g *boss.Gelehk) bossTarget {
	return bossTarget{
		id: g.ID, x: g.X, y: g.Y, radius: g.ContactRadius(),
		state: func() boss.State { return g.State },
		hp:    func() int { return g.HP },
		takeDamage: func(amount int) {
			g.TakeDamage(amount)
		},
	}
}

func vanessaBossTarget(v *boss.VanessaTheRuthless) bossTarget {
	return bossTarget{
		id: v.ID, x: v.X, y: v.Y, radius: v.ContactRadius(),
		state: func() boss.State { return v.State },
		hp:    func() int { return v.HP },
		takeDamage: func(amount int) {
			v.TakeDamage(amount)
		},
	}
}

func (w *World) bossTargetByID(id string) (bossTarget, bool) {
	if d := w.dragons[id]; d != nil {
		return dragonBossTarget(d), true
	}
	if g := w.gelehks[id]; g != nil {
		return gelehkBossTarget(g), true
	}
	if v := w.vanessas[id]; v != nil {
		return vanessaBossTarget(v), true
	}
	return bossTarget{}, false
}

func (w *World) forEachBossTargetInRadius(x, y, radius float64, callback func(bossTarget)) {
	w.bossIndex.ForEachInRadius(x, y, radius, func(id spatial.EntityID) {
		target, ok := w.bossTargetByID(id)
		if !ok {
			return
		}
		callback(target)
	})
}
