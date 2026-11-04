import { describe, expect, it } from "vitest";
import { evaluateAmadRule, parseAmadAmount } from "./amadStatusRule";

const NOV = "2026-11-01";

function v(month: string, text: string | null) {
	return { month, value: null, valueText: text };
}

describe("parseAmadAmount", () => {
	it("reads plain numbers from manual text", () => {
		expect(parseAmadAmount(null, " 12 ")).toBe(12);
		expect(parseAmadAmount(null, "1,204")).toBe(1204);
		expect(parseAmadAmount(null, "2.5")).toBe(2.5);
	});

	it("ignores blanks and non-numbers", () => {
		expect(parseAmadAmount(null, null)).toBeNull();
		expect(parseAmadAmount(null, "")).toBeNull();
		expect(parseAmadAmount(null, "n/a")).toBeNull();
		expect(parseAmadAmount(null, "5?")).toBeNull();
	});
});

describe("evaluateAmadRule", () => {
	it("flags Watch when each of the last 3 months drops", () => {
		const r = evaluateAmadRule({ values: [v("2026-08-01", "5"), v("2026-09-01", "3"), v("2026-10-01", "2")], baseline: null, currentMonth: NOV });
		expect(r.outcome).toBe("watch");
	});

	it("does not flag a flat-then-drop as a downward trend", () => {
		const r = evaluateAmadRule({ values: [v("2026-08-01", "5"), v("2026-09-01", "5"), v("2026-10-01", "2")], baseline: null, currentMonth: NOV });
		expect(r.outcome).toBeNull();
	});

	it("flags Needs attention when the 3-month average is below the baseline", () => {
		const r = evaluateAmadRule({ values: [v("2026-08-01", "2"), v("2026-09-01", "4"), v("2026-10-01", "3")], baseline: 4, currentMonth: NOV });
		expect(r.outcome).toBe("needs_attention");
		expect(r.average).toBe(3);
	});

	it("does not flag an average equal to the baseline", () => {
		const r = evaluateAmadRule({ values: [v("2026-08-01", "2"), v("2026-09-01", "4"), v("2026-10-01", "3")], baseline: 3, currentMonth: NOV });
		expect(r.outcome).toBeNull();
	});

	it("prefers Needs attention when both rules apply", () => {
		const r = evaluateAmadRule({ values: [v("2026-08-01", "3"), v("2026-09-01", "2"), v("2026-10-01", "1")], baseline: 5, currentMonth: NOV });
		expect(r.outcome).toBe("needs_attention");
	});

	it("skips blank and non-numeric months and uses the last 3 with data", () => {
		const r = evaluateAmadRule({
			values: [v("2026-06-01", "1"), v("2026-07-01", "9"), v("2026-08-01", "6"), v("2026-09-01", ""), v("2026-10-01", "n/a"), v("2026-05-01", "20")],
			baseline: null,
			currentMonth: NOV,
		});
		expect(r.window.map((w) => w.month)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
		expect(r.outcome).toBeNull();
	});

	it("ignores the in-progress month", () => {
		const r = evaluateAmadRule({
			values: [v("2026-08-01", "5"), v("2026-09-01", "3"), v("2026-10-01", "2"), v("2026-11-01", "10")],
			baseline: null,
			currentMonth: NOV,
		});
		expect(r.outcome).toBe("watch");
	});

	it("decides nothing with fewer than 3 months of data", () => {
		const r = evaluateAmadRule({ values: [v("2026-09-01", "3"), v("2026-10-01", "2")], baseline: 10, currentMonth: NOV });
		expect(r).toMatchObject({ outcome: null, signature: null });
	});

	it("changes the signature when a value or the baseline changes", () => {
		const base = [v("2026-08-01", "5"), v("2026-09-01", "3"), v("2026-10-01", "2")];
		const a = evaluateAmadRule({ values: base, baseline: 1, currentMonth: NOV }).signature;
		const b = evaluateAmadRule({ values: base, baseline: 2, currentMonth: NOV }).signature;
		const c = evaluateAmadRule({ values: [...base.slice(0, 2), v("2026-10-01", "1")], baseline: 1, currentMonth: NOV }).signature;
		expect(new Set([a, b, c]).size).toBe(3);
	});
});
