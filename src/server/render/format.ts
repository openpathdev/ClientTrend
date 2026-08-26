const EMPTY = "—";

export function formatInteger(value: number | null): string {
	if (value === null) return EMPTY;
	return value.toLocaleString("en-US");
}

export function formatPlain(value: string | number | null): string {
	if (value === null || value === "") return EMPTY;
	return String(value);
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
