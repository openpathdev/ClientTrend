const EMPTY = "—";

export function formatInteger(value: number | null): string {
	if (value === null) return EMPTY;
	return value.toLocaleString("en-US");
}

export function formatPlain(value: string | number | null): string {
	if (value === null || value === "") return EMPTY;
	return String(value);
}

export function formatPercent(value: number | null): string {
	if (value === null) return EMPTY;
	return `${value}%`;
}

/** Ad spend/mo (PRD §11) — shared by the Paid Ads detail-page chip and its duplicate on the Overview card. */
export function formatMonthlySpend(value: number | null): string {
	if (value === null) return `${EMPTY} / mo`;
	return `$${value.toLocaleString("en-US")} / mo`;
}

/** A `YYYY-MM-DD` date column (e.g. go-live dates) rendered as "Sep 28, 2026" — parsed as UTC so it never shifts a day in the viewer's timezone. */
export function formatDateOnly(date: string | null): string {
	if (!date) return EMPTY;
	return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Display form of a website: strip protocol/www, keep the bare domain. */
export function displayWebsite(website: string | null): string {
	if (!website) return EMPTY;
	return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/** href form of a website: ensure it has a scheme so it's a valid absolute link. */
export function websiteHref(website: string | null): string | null {
	if (!website) return null;
	return /^https?:\/\//.test(website) ? website : `https://${website}`;
}
