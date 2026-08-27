/** Stable lookup key for a single (metric, month) cell — used to index both values and comments per cell. */
export function cellKey(metricId: string, month: string): string {
	return `${metricId}:${month}`;
}

/**
 * DOM-id/CSS-selector-safe variant of cellKey. Colons are reserved in CSS
 * selector syntax (parsed as the start of a pseudo-class), so an element id
 * or `hx-target="#..."` built with a raw `:` breaks `querySelector` at
 * runtime with no visible error to the user beyond a stuck "Loading…" —
 * always use this for anything that ends up as an HTML id, never `cellKey`.
 */
export function domCellKey(metricId: string, month: string): string {
	return `${metricId}-${month}`;
}
