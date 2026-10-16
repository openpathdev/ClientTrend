import { html } from "hono/html";
import type { CommentSection } from "../data/types";
import type { PastePlan, PlannedCell } from "../pasteImport";
import { monthLabel } from "../months";
import { truncate } from "./format";

/**
 * Confirmation popover for a spreadsheet paste into the Performance / Paid
 * Ads grid (see pasteImport.ts). Rendered into the page-level
 * `#cx-paste-preview` container (Layout.astro), which the paste handler
 * positions next to the clicked cell. Saving re-sends the pasted text; the
 * server re-plans it rather than trusting anything shown here.
 */

const CELL_STYLES: Record<PlannedCell["status"], string> = {
	new: "border-healthy-line bg-healthy-tint text-healthy-text",
	changed: "border-watch-line bg-watch-tint text-watch-text",
	unchanged: "border-row-rule bg-surface text-ink",
	skipped: "border-dashed border-row-rule bg-zebra-row text-muted",
};

function renderCell(cell: PlannedCell) {
	const title =
		cell.status === "changed"
			? `Was ${cell.oldText ?? ""}`
			: cell.status === "skipped"
				? (cell.reason ?? "Skipped")
				: cell.status === "unchanged"
					? "Already this value"
					: "New value";
	const shown = cell.status === "skipped" ? cell.raw.trim() || "—" : (cell.valueText ?? String(cell.value ?? ""));
	return html`<div class="min-w-[64px] rounded border px-1.5 py-1 text-right ${CELL_STYLES[cell.status]}" title="${title}">
		<div class="font-mono text-[9.5px] uppercase tracking-[0.05em] opacity-70">${monthLabel(cell.month)}</div>
		${cell.status === "changed" ? html`<div class="font-mono text-[10.5px] line-through opacity-60">${truncate(cell.oldText ?? "", 14)}</div>` : ""}
		<div class="font-mono text-[12.5px]">${truncate(shown, 14)}</div>
	</div>`;
}

function closeScript() {
	return "document.getElementById('cx-paste-preview').classList.add('hidden')";
}

export function renderPastePreview(params: {
	clientId: string;
	section: CommentSection;
	sectionPath: string;
	plan: PastePlan;
	text: string;
	metricId: string;
	month: string;
	monthCount: number;
}) {
	const { clientId, section, sectionPath, plan, text, metricId, month, monthCount } = params;
	const { counts } = plan;
	const writeCount = counts.new + counts.changed;
	const firstLabel = plan.rows[0]?.metric?.label ?? "";
	const range = plan.firstMonth === plan.lastMonth ? monthLabel(plan.firstMonth) : `${monthLabel(plan.firstMonth)} – ${monthLabel(plan.lastMonth)}`;
	const heading =
		plan.rows.length === 1
			? html`Paste into <strong>${firstLabel}</strong>, ${range}`
			: html`Paste ${String(plan.rows.length)} rows starting at <strong>${firstLabel}</strong>, ${range}`;

	return html`<div class="flex items-start justify-between gap-3">
			<p class="text-[13px] text-ink">${heading}</p>
			<button type="button" onclick="${closeScript()}" class="text-[14px] leading-none text-muted hover:text-ink" aria-label="Cancel paste">×</button>
		</div>
		<p class="mt-1 font-mono text-[11px] text-muted">
			<span class="text-healthy-text">${String(counts.new)} new</span> ·
			<span class="text-watch-text">${String(counts.changed)} changed</span> · ${String(counts.unchanged)} unchanged ·
			${String(counts.skipped)} skipped
		</p>
		<div class="mt-2 max-h-72 space-y-2 overflow-auto">
			${plan.rows.map(
				(row, i) => html`<div>
					${plan.rows.length > 1
						? html`<p class="mb-1 text-[11px] text-muted">Row ${String(i + 1)} → ${row.metric ? html`<span class="text-ink">${row.metric.label}</span>` : "nowhere (no more rows below)"}</p>`
						: ""}
					<div class="flex flex-wrap gap-1">${row.cells.map(renderCell)}</div>
				</div>`,
			)}
		</div>
		<p class="mt-2 text-[11px] text-muted">Blank and "-" cells are skipped and never clear an existing value. Hover a cell for details.</p>
		<form
			class="mt-3 flex items-center justify-end gap-2"
			hx-post="/api/clients/${clientId}/${sectionPath}/paste/commit"
			hx-target="#${section}-section"
			hx-swap="outerHTML"
			hx-on::after-request="${closeScript()}"
		>
			<textarea name="text" class="hidden">${"\n" + text}</textarea>
			<input type="hidden" name="metricId" value="${metricId}" />
			<input type="hidden" name="month" value="${month}" />
			<input type="hidden" name="months" value="${String(monthCount)}" />
			<button type="button" onclick="${closeScript()}" class="rounded px-3 py-1 text-[12px] text-muted hover:text-ink">Cancel</button>
			<button
				type="submit"
				${writeCount === 0 ? "disabled" : ""}
				class="rounded bg-ink px-3 py-1 text-[12px] font-medium text-surface disabled:cursor-not-allowed disabled:opacity-40"
			>
				${writeCount === 0 ? "Nothing to save" : `Save ${String(writeCount)} value${writeCount === 1 ? "" : "s"}`}
			</button>
		</form>`;
}

export function renderPasteError(message: string) {
	return html`<div class="flex items-start justify-between gap-3">
		<p class="text-[13px] text-needs-attention-text" role="alert">${message}</p>
		<button type="button" onclick="${closeScript()}" class="text-[14px] leading-none text-muted hover:text-ink" aria-label="Close">×</button>
	</div>`;
}

/** Banner at the top of a section after a paste is saved or undone; `undoUrl` adds the Undo button. */
export function renderPasteNotice(params: { message: string; tone: "healthy" | "watch"; undoUrl?: string; section: CommentSection; monthCount: number }) {
	const { message, tone, undoUrl, section, monthCount } = params;
	const toneClass = tone === "healthy" ? "border-healthy-line bg-healthy-tint text-healthy-text" : "border-watch-line bg-watch-tint text-watch-text";
	return html`<div x-data="{ shown: true }" x-show="shown" class="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12.5px] ${toneClass}" role="status">
		<span>${message}</span>
		<span class="flex items-center gap-3">
			${undoUrl
				? html`<button
						type="button"
						hx-post="${undoUrl}"
						hx-vals='{"months":"${String(monthCount)}"}'
						hx-target="#${section}-section"
						hx-swap="outerHTML"
						class="font-medium underline"
					>
						Undo
					</button>`
				: ""}
			<button type="button" x-on:click="shown = false" class="leading-none opacity-70 hover:opacity-100" aria-label="Dismiss">×</button>
		</span>
	</div>`;
}
