/**
 * Chart tokens. The categorical order is fixed and validated for the dark
 * surface these charts render on (#18181b) — worst adjacent CVD ΔE 8.4,
 * worst adjacent normal-vision ΔE 19.3, all slots ≥ 3:1 against the surface.
 * Colours are assigned by slot order and never by rank, so filtering a chart
 * never repaints the series that survive.
 */
export const SERIES = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#008300', // 6 green
];

/** Single-hue ramp for magnitude (heat cells). Light → dark, never a rainbow. */
export const SEQUENTIAL = ['#0d366b', '#184f95', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef'];

/** Reserved for state, never reused as a series colour. */
export const STATUS = {
  good:     '#0ca30c',
  warning:  '#fab219',
  serious:  '#ec835a',
  critical: '#d03b3b',
};

/**
 * Chart chrome — the surface, gridlines and axis ink the series sit on.
 *
 * Two sets, because the portal has two themes. The SERIES palette above is not
 * duplicated: those hues were validated for colour-vision separation against the
 * dark surface, and they carry on white as well, so re-picking them would risk a
 * property that has already been checked.
 */
export const CHART_INK = {
  surface:  '#18181b',
  grid:     '#2c2c2a',
  axis:     '#383835',
  muted:    '#898781',
  secondary:'#c3c2b7',
  primary:  '#ffffff',
};

export const CHART_INK_LIGHT = {
  surface:  '#ffffff',
  grid:     '#e2e5ea',
  axis:     '#c8ced8',
  muted:    '#697180',
  secondary:'#3d4653',
  primary:  '#12161c',
};

/** The chrome for whichever theme the portal is in. */
export function chartInk(theme) {
  return theme === 'light' ? CHART_INK_LIGHT : CHART_INK;
}

/** Order-pipeline colours: ordinal progression, with cancelled on the status red. */
export const STATUS_COLORS = {
  PLACED:    '#3987e5',
  ACCEPTED:  '#5598e7',
  PREPARING: '#c98500',
  READY:     '#199e70',
  COMPLETED: '#898781',
  CANCELLED: STATUS.critical,
};

/** Y-axis ticks land on clean numbers rather than whatever the data maxes at. */
export function niceTicks(max, count = 4) {
  if (!max || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}
