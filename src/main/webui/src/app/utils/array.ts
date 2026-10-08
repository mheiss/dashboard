/**
 * Creates a new array between start and stop.
 */
export const arrayRange = (start: number, stop: number, step = 1) => {
  return Array.from({ length: (stop - start) / step + 1 }, (value, index) => start + index * step);
};
