/**
 * A rectangle
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the intersection of the given rectangles.
 */
export function intersect(a: Rectangle, b: Rectangle): Rectangle | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);

  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const width = x2 - x1;
  const height = y2 - y1;

  if (width <= 0 || height <= 0) {
    return null; // no overlap
  }

  return { x: x1, y: y1, width, height };
}
