/** Width of the tint band under the line; points are inset by half of it so the band isn't clipped. */
export const SPARKLINE_BAND = 14;

/** Point coordinates for `values` inside a width × height box, higher values nearer the top. */
export function sparklinePoints(values: number[], width: number, height: number) {
  const inset = SPARKLINE_BAND / 2;
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const step = (width - inset * 2) / Math.max(values.length - 1, 1);
  return values.map((v, i) => ({
    x: inset + i * step,
    // A flat series sits in the middle rather than on an edge.
    y: span === 0 ? height / 2 : inset + (1 - (v - min) / span) * (height - inset * 2),
  }));
}
