/** Default trailing window size for Monthly Data / Paid Ads tables (PRD §10/§28). */
export const DEFAULT_MONTH_WINDOW = 12;

/** First-of-month YYYY-MM-DD for a given Date, in UTC to avoid timezone drift. */
function firstOfMonth(year: number, monthIndex: number): string {
	const m = String(monthIndex + 1).padStart(2, "0");
	return `${year}-${m}-01`;
}

/**
 * Trailing N-month window ending at the current calendar month, oldest
 * first (PRD §10/§28 — default 12 months, "load earlier months" to go
 * further back).
 */
export function trailingMonths(count: number, endingBefore?: string): string[] {
	const end = endingBefore ? new Date(`${endingBefore}T00:00:00Z`) : new Date();
	const months: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
		months.push(firstOfMonth(d.getUTCFullYear(), d.getUTCMonth()));
	}
	return months;
}

export function monthLabel(month: string): string {
	const d = new Date(`${month}T00:00:00Z`);
	return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }).toUpperCase();
}
