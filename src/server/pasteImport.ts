import type { MonthlyMetric, MonthlyDataValue } from "./data/types";
import { cellKey } from "./cellKey";
import { addMonths } from "./months";
import { parseMonthlyCellValue } from "./validation";

/**
 * Pasting a block of spreadsheet cells into the Performance / Paid Ads
 * grids (2026-10-16): a CSM copies one metric's values across several
 * months in Excel/Google Sheets — values only, no labels or month headers —
 * clicks that metric's cell for the first month, and pastes. Columns fill
 * consecutive months to the right; extra pasted rows fill the next manual
 * metric rows down. Pure (no I/O) so the preview and the commit route plan
 * the exact same cells, and so it's unit-testable.
 */

/** Generous for a value-only paste (a full 17×36 block is ~3KB); stops a stray huge clipboard reaching the DB. */
export const PASTE_MAX_CHARS = 50_000;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export function isValidMonth(month: string): boolean {
	return MONTH_RE.test(month);
}

/**
 * Tab-separated clipboard text → rows of cells. Excel and Google Sheets
 * both copy a selection as TSV, quoting a cell (with `""` for a literal
 * quote) only when it contains a tab, newline or quote. One trailing line
 * break (Excel always adds one) is dropped so it doesn't become an empty
 * extra row.
 */
export function parseClipboardTable(text: string): string[][] {
	const input = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let i = 0;
	let atCellStart = true;

	while (i < input.length) {
		const ch = input[i];
		if (atCellStart && ch === '"') {
			// Quoted cell: runs to the next quote that isn't doubled.
			i++;
			while (i < input.length) {
				if (input[i] === '"') {
					if (input[i + 1] === '"') {
						cell += '"';
						i += 2;
						continue;
					}
					i++;
					break;
				}
				cell += input[i++];
			}
			atCellStart = false;
			continue;
		}
		if (ch === "\t") {
			row.push(cell);
			cell = "";
			atCellStart = true;
		} else if (ch === "\n") {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
			atCellStart = true;
		} else {
			cell += ch;
			atCellStart = false;
		}
		i++;
	}
	row.push(cell);
	rows.push(row);
	return rows;
}

/** Spreadsheet placeholders for "no value" — skipped, never written, so they can't clear an existing value. */
const BLANK_MARKERS = new Set(["", "-", "–", "—"]);

export type PlannedCellStatus = "new" | "changed" | "unchanged" | "skipped";

export type PlannedCell = {
	month: string;
	raw: string;
	status: PlannedCellStatus;
	/** Why a cell is skipped (shown in the preview). */
	reason?: string;
	/** What the cell shows today, for "changed" (old → new). */
	oldText: string | null;
	value: number | null;
	valueText: string | null;
};

export type PlannedRow = {
	/** null when the paste has more rows than there are manual metrics below the clicked one. */
	metric: MonthlyMetric | null;
	cells: PlannedCell[];
};

export type PastePlan = {
	rows: PlannedRow[];
	counts: Record<PlannedCellStatus, number>;
	firstMonth: string;
	lastMonth: string;
};

/** How a stored cell reads on screen — text cells show value_text, numeric ones their value. */
export function displayText(v: Pick<MonthlyDataValue, "value" | "valueText"> | undefined): string | null {
	if (!v) return null;
	if (v.valueText !== null && v.valueText !== "") return v.valueText;
	return v.value === null ? null : String(v.value);
}

/** Months a paste starting at `startMonth` with `columnCount` columns covers. */
export function pasteMonthRange(startMonth: string, columnCount: number): { firstMonth: string; lastMonth: string } {
	return { firstMonth: startMonth, lastMonth: addMonths(startMonth, Math.max(columnCount, 1) - 1) };
}

export function planPaste(params: {
	grid: string[][];
	startMetricId: string;
	startMonth: string;
	/** The section's active catalog, in display (sort_order) order. */
	metrics: MonthlyMetric[];
	/** Existing values covering at least the pasted month range. */
	existing: MonthlyDataValue[];
	/** Current calendar month (YYYY-MM-01); later months are skipped. */
	currentMonth: string;
}): PastePlan {
	const { grid, startMetricId, startMonth, metrics, existing, currentMonth } = params;
	const startIndex = metrics.findIndex((m) => m.id === startMetricId);
	// Rows fill the clicked metric, then the next manual metrics down —
	// HubSpot rows are synced automatically, so they're stepped over.
	const startMetric = metrics[startIndex];
	const targets = !startMetric || startMetric.source === "hubspot" ? [] : metrics.slice(startIndex).filter((m) => m.source !== "hubspot");
	const existingByKey = new Map(existing.map((v) => [cellKey(v.metricId, v.month), v]));
	const counts: Record<PlannedCellStatus, number> = { new: 0, changed: 0, unchanged: 0, skipped: 0 };
	const columnCount = Math.max(...grid.map((r) => r.length));

	const rows = grid.map((sourceRow, rowIndex): PlannedRow => {
		const metric = targets[rowIndex] ?? null;
		const cells = sourceRow.map((raw, colIndex): PlannedCell => {
			const month = addMonths(startMonth, colIndex);
			const oldText = metric ? displayText(existingByKey.get(cellKey(metric.id, month))) : null;
			const skip = (reason: string): PlannedCell => ({ month, raw, status: "skipped", reason, oldText, value: null, valueText: null });
			const trimmed = raw.trim();

			if (!metric) return skip("No more rows below to fill");
			if (month > currentMonth) return skip("Future month");
			if (BLANK_MARKERS.has(trimmed)) return skip("Blank");
			const parsed = parseMonthlyCellValue(trimmed, metric.valueType, metric.minValue, metric.maxValue);
			if (!parsed.ok) return skip(parsed.error);

			const newText = displayText(parsed);
			const status: PlannedCellStatus = oldText === null ? "new" : oldText === newText ? "unchanged" : "changed";
			return { month, raw, status, oldText, value: parsed.value, valueText: parsed.valueText };
		});
		for (const cell of cells) counts[cell.status]++;
		return { metric, cells };
	});

	return { rows, counts, ...pasteMonthRange(startMonth, columnCount) };
}

/** The cells a commit actually writes. */
export function cellsToWrite(plan: PastePlan): { metric: MonthlyMetric; cell: PlannedCell }[] {
	return plan.rows.flatMap((row) =>
		row.metric ? row.cells.filter((c) => c.status === "new" || c.status === "changed").map((cell) => ({ metric: row.metric!, cell })) : [],
	);
}
