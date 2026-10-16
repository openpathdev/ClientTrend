import { describe, expect, it } from "vitest";
import type { MonthlyMetric, MonthlyDataValue } from "./data/types";
import { cellsToWrite, isValidMonth, parseClipboardTable, planPaste } from "./pasteImport";
import { addMonths } from "./months";

function metric(id: string, label: string, source: "manual" | "hubspot" = "manual"): MonthlyMetric {
	return { id, key: id, label, valueType: source === "hubspot" ? "integer" : "text", minValue: null, maxValue: null, source, groupLabel: null, sortOrder: 0, active: true };
}

function value(metricId: string, month: string, valueText: string): MonthlyDataValue {
	return { id: `${metricId}-${month}`, clientId: "c", metricId, month, value: null, valueText, statusId: null, updatedBy: "x", updatedAt: "" };
}

// Same order as the real Performance catalog around Walk-Ins.
const metrics = [
	metric("am_ad", "AM/AD", "hubspot"),
	metric("sti", "STI"),
	metric("walk_ins", "Walk-Ins (AV/AM/AD only)"),
	metric("phone_calls", "Phone Calls (AV/AM/AD only)"),
	metric("form_fills", "Form Fills"),
	metric("new_clients", "Center feedback new clients"),
	metric("visitors", "Unique Visitors", "hubspot"),
	metric("pregnancy_tests", "Pregnancy Tests"),
];

describe("parseClipboardTable", () => {
	it("splits a single copied row on tabs", () => {
		expect(parseClipboardTable("1\t\t0\t0")).toEqual([["1", "", "0", "0"]]);
	});

	it("drops Excel's trailing line break and handles CRLF rows", () => {
		expect(parseClipboardTable("1\t2\r\n3\t4\r\n")).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	it("unquotes cells containing tabs, newlines and doubled quotes", () => {
		expect(parseClipboardTable('"a\tb"\t"line1\nline2"\t"say ""hi"""')).toEqual([["a\tb", "line1\nline2", 'say "hi"']]);
	});
});

describe("isValidMonth", () => {
	it("accepts first-of-month only", () => {
		expect(isValidMonth("2025-12-01")).toBe(true);
		expect(isValidMonth("2025-12-15")).toBe(false);
		expect(isValidMonth("2025-13-01")).toBe(false);
		expect(isValidMonth("not-a-date")).toBe(false);
	});
});

describe("addMonths", () => {
	it("crosses year boundaries", () => {
		expect(addMonths("2025-12-01", 1)).toBe("2026-01-01");
		expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
	});
});

describe("planPaste", () => {
	// Walk-Ins row from the CSM spreadsheet, Dec 25 → Jul 26 (blank Jan).
	const walkIns = parseClipboardTable("1\t\t0\t0\t0\t1\t0\t0");

	it("fills consecutive months from the clicked cell", () => {
		const plan = planPaste({ grid: walkIns, startMetricId: "walk_ins", startMonth: "2025-12-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows).toHaveLength(1);
		expect(plan.rows[0].metric?.id).toBe("walk_ins");
		expect(plan.rows[0].cells.map((c) => c.month)).toEqual([
			"2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01",
		]);
		expect(plan.firstMonth).toBe("2025-12-01");
		expect(plan.lastMonth).toBe("2026-07-01");
	});

	it("skips blank and dash cells but keeps their month slot", () => {
		const plan = planPaste({ grid: parseClipboardTable("-\t\t3\t—"), startMetricId: "phone_calls", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		const cells = plan.rows[0].cells;
		expect(cells.map((c) => c.status)).toEqual(["skipped", "skipped", "new", "skipped"]);
		expect(cells[2]).toMatchObject({ month: "2026-03-01", valueText: "3" });
		expect(plan.counts).toEqual({ new: 1, changed: 0, unchanged: 0, skipped: 3 });
	});

	it("classifies new, changed and unchanged against existing values", () => {
		const existing = [value("walk_ins", "2025-12-01", "1"), value("walk_ins", "2026-02-01", "5")];
		const plan = planPaste({ grid: parseClipboardTable("1\t2\t0"), startMetricId: "walk_ins", startMonth: "2025-12-01", metrics, existing, currentMonth: "2026-10-01" });
		const cells = plan.rows[0].cells;
		expect(cells.map((c) => c.status)).toEqual(["unchanged", "new", "changed"]);
		expect(cells[2]).toMatchObject({ oldText: "5", valueText: "0" });
		expect(cellsToWrite(plan).map(({ cell }) => cell.month)).toEqual(["2026-01-01", "2026-02-01"]);
	});

	it("keeps text values exactly as typed", () => {
		const plan = planPaste({ grid: parseClipboardTable("4.50%\t12 US/5 PT"), startMetricId: "new_clients", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows[0].cells.map((c) => c.valueText)).toEqual(["4.50%", "12 US/5 PT"]);
	});

	it("skips months after the current one", () => {
		const plan = planPaste({ grid: parseClipboardTable("1\t2\t3"), startMetricId: "walk_ins", startMonth: "2026-09-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows[0].cells.map((c) => c.status)).toEqual(["new", "new", "skipped"]);
		expect(plan.rows[0].cells[2].reason).toBe("Future month");
	});

	it("fills extra rows into the next manual metrics, stepping over HubSpot rows", () => {
		const grid = parseClipboardTable("1\n2\n3\n4");
		const plan = planPaste({ grid, startMetricId: "form_fills", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows.map((r) => r.metric?.id ?? null)).toEqual(["form_fills", "new_clients", "pregnancy_tests", null]);
		expect(plan.rows[3].cells[0]).toMatchObject({ status: "skipped", reason: "No more rows below to fill" });
	});

	it("writes nothing for a HubSpot start row", () => {
		const plan = planPaste({ grid: parseClipboardTable("1\t2"), startMetricId: "visitors", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows[0].metric).toBeNull();
		expect(cellsToWrite(plan)).toEqual([]);
	});

	it("rejects values over the length limit", () => {
		const plan = planPaste({ grid: [["x".repeat(501)]], startMetricId: "walk_ins", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows[0].cells[0].status).toBe("skipped");
	});
});
