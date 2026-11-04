/**
 * Automatic client status from the manually entered AM/AD total — the
 * "Center feedback AM/AD" Performance row (2026-11-04 user request).
 *
 * Looks at the 3 most recent *completed* months that have a numeric value
 * (blank months are skipped, the in-progress month is ignored):
 * - average of those 3 below the client's AM/AD baseline → "Needs attention"
 * - otherwise, each month lower than the one before    → "Watch"
 * - otherwise → no change (the current status is left as it is)
 * Needs attention wins when both apply. With fewer than 3 values there is
 * nothing to decide; without a baseline only the trend rule can fire.
 */

/** monthly_metrics.key of the manually entered AM/AD total the rule reads. */
export const AMAD_RULE_METRIC_KEY = "center_feedback_am_ad";

/** statuses.name values the rule sets. Matched case-insensitively. */
export const AMAD_RULE_STATUS_NAMES = { watch: "Watch", needsAttention: "Needs attention" } as const;

export type AmadRuleOutcome = "needs_attention" | "watch" | null;

export type AmadRuleResult = {
	outcome: AmadRuleOutcome;
	/**
	 * Fingerprint of everything the outcome depends on (the 3 months used,
	 * their values and the baseline). The status is only (re)applied when
	 * this differs from the last one applied, so a CSM's manual status
	 * choice sticks until the AM/AD data or baseline actually changes.
	 * Null when there aren't 3 months to evaluate.
	 */
	signature: string | null;
	/** The 3 values used, oldest first — for messages/debugging. */
	window: { month: string; amount: number }[];
	average: number | null;
};

/** Manual cells are free text; only plain numbers count ("1,204" ok; "n/a", "5?" don't). */
export function parseAmadAmount(value: number | null, valueText: string | null): number | null {
	if (value !== null && Number.isFinite(value)) return value;
	const text = (valueText ?? "").replace(/,/g, "").trim();
	if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
	return Number(text);
}

export function evaluateAmadRule(input: {
	values: { month: string; value: number | null; valueText: string | null }[];
	baseline: number | null;
	/** First of the current (in-progress) month, YYYY-MM-01 — this month and later are ignored. */
	currentMonth: string;
}): AmadRuleResult {
	const window = input.values
		.filter((v) => v.month < input.currentMonth)
		.map((v) => ({ month: v.month, amount: parseAmadAmount(v.value, v.valueText) }))
		.filter((v): v is { month: string; amount: number } => v.amount !== null)
		.sort((a, b) => (a.month < b.month ? 1 : -1))
		.slice(0, 3)
		.reverse();

	if (window.length < 3) return { outcome: null, signature: null, window, average: null };

	const average = window.reduce((sum, v) => sum + v.amount, 0) / window.length;
	const belowBaseline = input.baseline !== null && average < input.baseline;
	const fallingEachMonth = window[1].amount < window[0].amount && window[2].amount < window[1].amount;
	const outcome: AmadRuleOutcome = belowBaseline ? "needs_attention" : fallingEachMonth ? "watch" : null;
	const signature = `${window.map((v) => `${v.month}=${String(v.amount)}`).join(",")}|baseline=${input.baseline === null ? "" : String(input.baseline)}`;

	return { outcome, signature, window, average };
}
