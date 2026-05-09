package world

import (
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
)

func (w *World) seedInitialPortals() {
	if w.def == nil || w.cfg.IDs == nil {
		return
	}
	for _, ip := range w.def.InitialPortals {
		id := w.cfg.IDs.NewID("portal")
		w.portals[id] = &portal.Portal{
			ID: id, X: ip.X, Y: ip.Y, Kind: ip.Kind,
			ToInstance: ip.ToInstance, TargetX: ip.TargetX, TargetY: ip.TargetY,
			ActiveAt: time.Time{}, // immediately active
		}
		w.portalIndex.Upsert(id, ip.X, ip.Y)
	}
}

// SpawnPortal adds a portal.
func (w *World) SpawnPortal(p *portal.Portal) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.portals[p.ID] = p
	w.portalIndex.Upsert(p.ID, p.X, p.Y)
}

// handleBossDeathPortals creates a forward portal at the corpse of any
// allowed-kind dead boss (mirrors PortalSystem.handleBossDeathPortals).
func (w *World) handleBossDeathPortals() {
	if w.def == nil || w.def.BossDeathPortal == nil {
		return
	}
	cfg := w.def.BossDeathPortal
	allowed := map[boss.Kind]struct{}{}
	for _, k := range cfg.SourceBossKinds {
		allowed[k] = struct{}{}
	}

	// Forget handled bosses that no longer exist or are alive again.
	for id := range w.handledBossDeath {
		dState := boss.StateDead
		exists := false
		if d, ok := w.dragons[id]; ok {
			dState, exists = d.State, true
		} else if g, ok := w.gelehks[id]; ok {
			dState, exists = g.State, true
		} else if v, ok := w.vanessas[id]; ok {
			dState, exists = v.State, true
		}
		if !exists || dState != boss.StateDead {
			delete(w.handledBossDeath, id)
		}
	}

	// Drop stale boss-death portals whose source is no longer dead.
	for pid, pt := range w.portals {
		if pt.Kind != cfg.Kind || pt.SourceBossID == "" {
			continue
		}
		alive := false
		kind := boss.Kind("")
		if d, ok := w.dragons[pt.SourceBossID]; ok {
			alive = d.State != boss.StateDead
			kind = d.Kind()
		} else if g, ok := w.gelehks[pt.SourceBossID]; ok {
			alive = g.State != boss.StateDead
			kind = boss.KindGelehk
		} else if v, ok := w.vanessas[pt.SourceBossID]; ok {
			alive = v.State != boss.StateDead
			kind = v.Kind()
		} else {
			delete(w.portals, pid)
			w.portalIndex.Remove(pid)
			continue
		}
		if alive {
			delete(w.portals, pid)
			w.portalIndex.Remove(pid)
			continue
		}
		if len(allowed) > 0 {
			if _, ok := allowed[kind]; !ok {
				delete(w.portals, pid)
				w.portalIndex.Remove(pid)
			}
		}
	}

	spawnFor := func(id string, x, y float64, kind boss.Kind) {
		if _, handled := w.handledBossDeath[id]; handled {
			return
		}
		if len(allowed) > 0 {
			if _, ok := allowed[kind]; !ok {
				return
			}
		}
		w.handledBossDeath[id] = struct{}{}
		pid := w.cfg.IDs.NewID("portal")
		activeAt := w.now.Add(time.Duration(cfg.ActivationDelayMS) * time.Millisecond)
		exp := w.now.Add(time.Duration(cfg.DurationMS) * time.Millisecond)
		pt := &portal.Portal{
			ID: pid, X: x, Y: y, Kind: cfg.Kind,
			SourceBossID: id,
			ToInstance:   cfg.ToInstance,
			TargetX:      cfg.TargetX, TargetY: cfg.TargetY,
			ActiveAt: activeAt, ExpiresAt: &exp,
		}
		w.portals[pid] = pt
		w.portalIndex.Upsert(pid, x, y)
	}
	for id, d := range w.dragons {
		if d.State != boss.StateDead {
			continue
		}
		spawnFor(id, d.X, d.Y, d.Kind())
	}
	for id, g := range w.gelehks {
		if g.State != boss.StateDead {
			continue
		}
		spawnFor(id, g.X, g.Y, boss.KindGelehk)
	}
	for id, v := range w.vanessas {
		if v.State != boss.StateDead {
			continue
		}
		spawnFor(id, v.X, v.Y, v.Kind())
	}
}

// ConsumeTransferRequests drains and returns any queued portal transfers.
func (w *World) ConsumeTransferRequests() []portal.TransferRequest {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := w.transferRequests
	w.transferRequests = nil
	return out
}

func (w *World) tickPortals() {
	// Boss-death portal spawning (mirrors PortalSystem.handleBossDeathPortals).
	w.handleBossDeathPortals()

	nextOverlaps := make(map[string]map[string]struct{}, len(w.portalOverlapsByPlayer))
	transferredPlayerIDs := make(map[string]struct{})

	for id, pt := range w.portals {
		if pt.ExpiresAt != nil && !w.now.Before(*pt.ExpiresAt) {
			delete(w.portals, id)
			w.portalIndex.Remove(id)
			continue
		}
		if !pt.Active(w.now) {
			continue
		}
		for _, p := range w.players {
			if p.State == player.StateDead {
				continue
			}
			if physics.DistanceSquared(p.X, p.Y, pt.X, pt.Y) > portal.PortalRadius*portal.PortalRadius {
				continue
			}
			overlaps := nextOverlaps[p.ID]
			if overlaps == nil {
				overlaps = make(map[string]struct{})
				nextOverlaps[p.ID] = overlaps
			}
			overlaps[id] = struct{}{}
			if prev := w.portalOverlapsByPlayer[p.ID]; prev != nil {
				if _, alreadyOverlapping := prev[id]; alreadyOverlapping {
					continue
				}
			}
			if p.PhaseTransferCooldown > 0 {
				continue
			}
			if _, alreadyTransferred := transferredPlayerIDs[p.ID]; alreadyTransferred {
				continue
			}
			p.MarkPhaseTransferCooldown(portal.TransferCooldown)
			w.transferRequests = append(w.transferRequests, portal.TransferRequest{
				PlayerID:   p.ID,
				ToInstance: pt.ToInstance,
				TargetX:    pt.TargetX,
				TargetY:    pt.TargetY,
			})
			transferredPlayerIDs[p.ID] = struct{}{}
		}
	}
	w.portalOverlapsByPlayer = nextOverlaps
}
