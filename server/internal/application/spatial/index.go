package spatial

// Package spatial provides a uniform-grid spatial index for radius queries
// over moving point entities (players, enemies, bosses, hazards, drops).

import "math"

// EntityID is the abstract entity identifier stored in the index.
type EntityID = string

type record struct {
	x, y         float64
	cellX, cellY int
}

// Index is a uniform-grid spatial map. Cell size is fixed at construction.
// All operations are O(k) where k is the number of cells overlapped by the
// query and the entities they contain.
type Index struct {
	cellSize int
	cells    map[int64]map[EntityID]struct{}
	records  map[EntityID]record
}

// New constructs an empty index with the given cell size in pixels.
func New(cellSize int) *Index {
	if cellSize <= 0 {
		cellSize = 256
	}
	return &Index{
		cellSize: cellSize,
		cells:    make(map[int64]map[EntityID]struct{}),
		records:  make(map[EntityID]record),
	}
}

func (idx *Index) cellKey(cx, cy int) int64 {
	return int64(cx)<<32 | int64(uint32(cy))
}

func (idx *Index) coord(value float64) int {
	return int(math.Floor(value / float64(idx.cellSize)))
}

// Upsert inserts or moves entity to (x, y).
func (idx *Index) Upsert(id EntityID, x, y float64) {
	cx, cy := idx.coord(x), idx.coord(y)
	if prev, ok := idx.records[id]; ok {
		if prev.cellX == cx && prev.cellY == cy {
			prev.x, prev.y = x, y
			idx.records[id] = prev
			return
		}
		idx.removeFromCell(id, prev.cellX, prev.cellY)
	}
	idx.records[id] = record{x: x, y: y, cellX: cx, cellY: cy}
	idx.addToCell(id, cx, cy)
}

// Remove deletes entity from the index. Missing IDs are ignored.
func (idx *Index) Remove(id EntityID) {
	rec, ok := idx.records[id]
	if !ok {
		return
	}
	delete(idx.records, id)
	idx.removeFromCell(id, rec.cellX, rec.cellY)
}

// ForEachInRadius invokes callback once for each entity within the circular
// query (x, y, radius). Iteration order is unspecified.
func (idx *Index) ForEachInRadius(x, y, radius float64, callback func(EntityID)) {
	if radius <= 0 || callback == nil {
		return
	}
	minX, maxX := idx.coord(x-radius), idx.coord(x+radius)
	minY, maxY := idx.coord(y-radius), idx.coord(y+radius)
	radiusSq := radius * radius
	for cx := minX; cx <= maxX; cx++ {
		for cy := minY; cy <= maxY; cy++ {
			bucket, ok := idx.cells[idx.cellKey(cx, cy)]
			if !ok {
				continue
			}
			for id := range bucket {
				rec := idx.records[id]
				dx := rec.x - x
				dy := rec.y - y
				if dx*dx+dy*dy <= radiusSq {
					callback(id)
				}
			}
		}
	}
}

// QueryRadius returns the IDs of all entities within radius.
func (idx *Index) QueryRadius(x, y, radius float64) []EntityID {
	var out []EntityID
	idx.ForEachInRadius(x, y, radius, func(id EntityID) { out = append(out, id) })
	return out
}

// FindNearest returns the closest entity within radius matching predicate, or
// the empty string if none.
func (idx *Index) FindNearest(x, y, radius float64, predicate func(EntityID) bool) EntityID {
	var best EntityID
	bestSq := radius * radius
	idx.ForEachInRadius(x, y, radius, func(id EntityID) {
		if predicate != nil && !predicate(id) {
			return
		}
		rec := idx.records[id]
		dx := rec.x - x
		dy := rec.y - y
		dsq := dx*dx + dy*dy
		if dsq <= bestSq {
			bestSq = dsq
			best = id
		}
	})
	return best
}

// Clear removes every entity from the index.
func (idx *Index) Clear() {
	idx.cells = make(map[int64]map[EntityID]struct{})
	idx.records = make(map[EntityID]record)
}

// Len returns the number of indexed entities.
func (idx *Index) Len() int { return len(idx.records) }

func (idx *Index) addToCell(id EntityID, cx, cy int) {
	key := idx.cellKey(cx, cy)
	bucket, ok := idx.cells[key]
	if !ok {
		bucket = make(map[EntityID]struct{})
		idx.cells[key] = bucket
	}
	bucket[id] = struct{}{}
}

func (idx *Index) removeFromCell(id EntityID, cx, cy int) {
	key := idx.cellKey(cx, cy)
	bucket, ok := idx.cells[key]
	if !ok {
		return
	}
	delete(bucket, id)
	if len(bucket) == 0 {
		delete(idx.cells, key)
	}
}
