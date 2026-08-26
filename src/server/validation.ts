/** Well-formed absolute http(s) URL only — rejects javascript:/data: schemes (PRD §13, §24). */
export function isValidLinkUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

export function validateLength(value: string, min: number, max: number): boolean {
	const len = value.trim().length;
	return len >= min && len <= max;
}
