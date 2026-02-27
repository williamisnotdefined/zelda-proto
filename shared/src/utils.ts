export function seededRandom(cx: number, cy: number, index: number): number {
  let h = (cx * 374761393 + cy * 668265263 + index * 1013904223) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = (h ^ (h >> 16)) | 0;
  return (h >>> 0) / 4294967296;
}
