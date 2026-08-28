const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a path param looks like a UUID before it ever reaches a
 * Supabase query — Postgres throws a raw "invalid input syntax for type
 * uuid" error on a malformed id, and letting that propagate uncaught was
 * leaking the DB error message straight into a 500 response (PRD §24/§29:
 * no error response may expose internal identifiers/SQL details). Callers
 * treat a failed check as "not found," matching what a well-formed but
 * nonexistent id already does.
 */
export function isValidUuid(value: string): boolean {
	return UUID_RE.test(value);
}

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

/**
 * Validates a raw monthly-data cell submission against its metric's
 * `value_type` (PRD §20). Text-typed metrics (all manually-entered ones)
 * are permissive on purpose — a CSM will usually type a number, but the
 * field must not reject non-numeric input, so only a length cap applies.
 * Numeric/percent metrics (HubSpot-sourced) are read-only in the UI, but
 * validated here too as defense-in-depth.
 */
export function parseMonthlyCellValue(
	raw: string,
	valueType: "integer" | "percent" | "text",
	min: number | null,
	max: number | null,
): { ok: true; value: number | null; valueText: string | null } | { ok: false; error: string } {
	const trimmed = raw.trim();

	if (valueType === "text") {
		if (trimmed.length > 500) return { ok: false, error: "Value must be 500 characters or fewer." };
		return { ok: true, value: null, valueText: trimmed === "" ? null : trimmed };
	}

	if (trimmed === "") return { ok: true, value: null, valueText: null };

	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) return { ok: false, error: "Value must be a number." };
	if (min !== null && parsed < min) return { ok: false, error: `Value must be at least ${min}.` };
	if (max !== null && parsed > max) return { ok: false, error: `Value must be at most ${max}.` };
	return { ok: true, value: parsed, valueText: null };
}
