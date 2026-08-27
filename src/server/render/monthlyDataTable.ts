import { html, raw } from "hono/html";
import type { MonthlyMetric, MonthlyDataValue, CommentSection, Status, Comment } from "../data/types";
import { formatInteger, formatPercent, truncate } from "./format";
import { monthLabel } from "../months";
import { cellKey, domCellKey } from "../cellKey";

const COMMENT_ICON_PATH =
	'<path d="M20 2H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2h3v4.434l7.740-4.434H20c1.103 0 2-.897 2-2V4c0-1.103-.897-2-2-2zM4 16V4h16l.001 12H4z"/>';

function highlightEndpoint(clientId: string, section: CommentSection, metricId: string, month: string): string {
	const base = section === "monthly_data" ? "monthly-data" : "paid-ads";
	return `/api/clients/${clientId}/${base}/${metricId}/${month}/highlight`;
}

function formatReadOnlyValue(metric: MonthlyMetric, dataValue: MonthlyDataValue | undefined): string {
	if (metric.valueType === "percent") return formatPercent(dataValue?.value ?? null);
	return formatInteger(dataValue?.value ?? null);
}

function renderMonthHeader(month: string) {
	return html`<th
		scope="col"
		class="whitespace-nowrap border-b border-section-rule bg-table-header px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.05em] text-label"
	>
		${monthLabel(month)}
	</th>`;
}

/**
 * Section header row (e.g. "Top of Funnel") — a distinct row inserted
 * whenever `group_label` changes between consecutive metrics, ordered by
 * sort_order (PRD §20). Only the sticky metric column carries the label;
 * the month cells are blank filler with a matching background, so the
 * label stays visible regardless of horizontal scroll position, same as
 * the "Metric" header column itself — a full colspan banner would scroll
 * out of view since the table defaults to scrolled-right (newest month).
 */
function renderGroupHeaderRow(groupLabel: string, monthCount: number) {
	return html`<tr>
		<th
			scope="colgroup"
			class="sticky left-0 z-10 whitespace-nowrap border-r border-row-rule bg-table-header px-3 py-1.5 text-left font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-label"
		>
			${groupLabel}
		</th>
		${Array.from({ length: monthCount }, () => html`<td class="bg-table-header"></td>`)}
	</tr>`;
}

/**
 * The badge/trigger button plus its hover-preview tooltip, wrapped in one
 * `display:contents` element (not inlined) because comment mutations
 * re-render this whole unit out-of-band via `hx-swap-oob`, so both the
 * comment-count badge AND the hover-preview text update immediately without
 * a page reload — the tooltip's content is only known at render time
 * (it needs the actual comment bodies), so it must travel with the badge
 * instead of living in the never-swapped `renderCellMarker` wrapper, or a
 * comment added post-page-load would show the updated badge but never the
 * updated hover text. This wrapper must NOT own the popover's open/close
 * state itself (that lives one level up, in `renderCellMarker`) — otherwise
 * OOB-replacing it mid-use would reset an open popover back to closed.
 * Communication happens via a window-scoped custom event, the same pattern
 * already used for the Overview page's status dropdown.
 */
export function renderCellMarkerButton(
	clientId: string,
	section: CommentSection,
	metric: MonthlyMetric,
	month: string,
	cellComments: Comment[],
	oob: boolean,
) {
	const domKey = domCellKey(metric.id, month);
	const panelId = `comment-panel-${section}-${domKey}`;
	const eventName = `toggle-cell-popover-${section}-${domKey}`;
	const hasComments = cellComments.length > 0;

	return html`<span id="cell-marker-trigger-${section}-${domKey}" ${oob ? html`hx-swap-oob="true"` : ""} class="contents">
		${
			hasComments
				? html`<div
						class="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-72 rounded-md border border-card-border bg-surface p-2 text-left text-[11.5px] normal-case tracking-normal text-ink shadow-lg group-hover:block"
					>
						${cellComments
							.slice(0, 3)
							.map((c) => html`<p class="mb-1.5 whitespace-pre-wrap last:mb-0">${truncate(c.body, 400)}</p>`)}
						${cellComments.length > 3 ? html`<p class="text-muted">+${String(cellComments.length - 3)} more…</p>` : ""}
					</div>`
				: ""
		}
		<button
			type="button"
			x-on:click="$dispatch('${eventName}')"
			hx-get="/api/clients/${clientId}/comments?section=${section}&metricId=${metric.id}&month=${month}"
			hx-target="#${panelId}"
			hx-swap="innerHTML"
			class="flex h-3 w-3 items-center justify-center rounded-full ${hasComments ? "text-link" : "text-muted opacity-0 focus:opacity-100 group-hover:opacity-100"}"
			aria-label="${hasComments ? `${String(cellComments.length)} comment${cellComments.length === 1 ? "" : "s"}, ` : ""}click to set a highlight or add a comment"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"
				>${raw(COMMENT_ICON_PATH)}</svg
			>
		</button>
	</span>`;
}

/**
 * The single per-cell marker + combined popover (PRD §12, redesigned
 * 2026-08-31): one small corner trigger per cell, not two separate
 * controls. It doubles as the comment-flag indicator (visible whenever the
 * cell has ≥1 comment, otherwise a subtle hover-revealed affordance) and
 * opens one popover containing both the highlight color picker and the
 * comment thread. Hovering shows a lightweight preview of the most recent
 * comments without any network round trip — the data is already
 * bulk-fetched with the page (see listCommentsForRange in comments.ts).
 */
function renderCellMarker(
	clientId: string,
	section: CommentSection,
	metric: MonthlyMetric,
	month: string,
	status: Status | null,
	statuses: Status[],
	cellComments: Comment[],
) {
	const domKey = domCellKey(metric.id, month);
	const panelId = `comment-panel-${section}-${domKey}`;
	const eventName = `toggle-cell-popover-${section}-${domKey}`;
	const endpoint = highlightEndpoint(clientId, section, metric.id, month);

	return html`<div
		class="absolute right-0.5 top-0.5 z-10"
		x-data="{ open: false }"
		x-on:${eventName}.window="open = !open"
	>
		${renderCellMarkerButton(clientId, section, metric, month, cellComments, false)}
		<div
			x-show="open"
			x-cloak
			x-transition
			x-on:click.outside="open = false"
			class="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-card-border bg-surface p-3 text-left normal-case tracking-normal shadow-lg"
		>
			<div class="flex items-center gap-1.5 border-b border-row-rule pb-2">
				<span class="mr-0.5 text-[11px] text-muted">Highlight:</span>
				${statuses.map(
					(s) => html`<button
						type="button"
						hx-patch="${endpoint}"
						hx-vals='{"statusId":"${s.id}"}'
						hx-target="closest td"
						hx-swap="outerHTML"
						title="${s.name}"
						aria-label="Highlight ${s.name}"
						class="h-4 w-4 rounded-full border ${status?.id === s.id ? "ring-2 ring-offset-1 ring-selected-filter" : "border-card-border"}"
						style="background-color:${s.colorLine}"
					></button>`,
				)}
				<button
					type="button"
					hx-patch="${endpoint}"
					hx-vals='{"statusId":""}'
					hx-target="closest td"
					hx-swap="outerHTML"
					title="Clear highlight"
					aria-label="Clear highlight"
					class="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-card-border text-[9px] leading-none text-muted"
				>
					×
				</button>
			</div>
			<div id="${panelId}" class="mt-2 text-[12px] text-muted">Loading…</div>
		</div>
	</div>`;
}

export function renderMetricCell(
	clientId: string,
	section: CommentSection,
	metric: MonthlyMetric,
	month: string,
	dataValue: MonthlyDataValue | undefined,
	bgClass: string,
	status: Status | null,
	statuses: Status[],
	cellComments: Comment[],
) {
	const highlightStyle = status ? `background-color:${status.colorTint}` : "";

	if (metric.source === "hubspot") {
		return html`<td
			class="group relative whitespace-nowrap px-3 py-2 text-right font-mono text-[13px] text-ink ${bgClass}"
			style="${highlightStyle}"
		>
			${renderCellMarker(clientId, section, metric, month, status, statuses, cellComments)}
			${formatReadOnlyValue(metric, dataValue)}
		</td>`;
	}

	const rawValue = dataValue?.valueText ?? "";
	return html`<td
		class="group relative whitespace-nowrap p-1 text-right ${bgClass}"
		style="${highlightStyle}"
		x-data="{ editing: false }"
	>
		${renderCellMarker(clientId, section, metric, month, status, statuses, cellComments)}
		<button
			type="button"
			x-show="!editing"
			x-on:click="editing = true"
			class="w-full min-w-[72px] rounded px-2 py-1 text-right font-mono text-[13px] text-ink hover:bg-zebra-row"
		>
			${rawValue === "" ? "—" : rawValue}
		</button>
		<input
			x-show="editing"
			x-cloak
			x-on:blur="editing = false"
			x-on:keydown.escape="editing = false; $el.value = '${rawValue}'"
			type="text"
			name="value"
			value="${rawValue}"
			maxlength="500"
			hx-put="/api/clients/${clientId}/monthly-data/${metric.id}/${month}"
			hx-trigger="change, keyup[key=='Enter']"
			hx-target="closest td"
			hx-swap="outerHTML"
			class="w-full min-w-[72px] rounded border border-card-border px-2 py-1 text-right font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
		/>
	</td>`;
}

/**
 * Pivoted metric×month table (PRD §10/§20): sticky first column, scrollable
 * months. Manual (text-typed) cells edit in place via an Alpine show/hide
 * toggle + a single HTMX PUT on change/Enter — no separate "load edit form"
 * round trip, same simplification used for Notes/Changes/Links in Phase 3.
 * HubSpot-sourced cells are always read-only for their value, but every
 * cell (including HubSpot ones) carries the same highlight+comment marker
 * (PRD §12, redesigned 2026-08-31 — per-cell, not per-month).
 */
export function renderMonthlyDataTable(params: {
	clientId: string;
	section: CommentSection;
	title: string;
	metrics: MonthlyMetric[];
	months: string[];
	values: MonthlyDataValue[];
	statuses: Status[];
	comments: Map<string, Comment[]>;
	/** Extra content next to the title — used by Paid Ads for the GO-LIVE/AD SPEND chips (PRD §11); Monthly Data leaves this unset. */
	headerExtra?: ReturnType<typeof html>;
}) {
	const { clientId, section, title, metrics, months, values, statuses, comments, headerExtra } = params;
	const byKey = new Map(values.map((v) => [cellKey(v.metricId, v.month), v]));
	const statusesById = new Map(statuses.map((s) => [s.id, s]));

	return html`<section id="${section}-section" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">${title}</h2>
				${headerExtra ?? ""}
			</div>
			<span class="font-mono text-[11px] text-muted">Last ${String(months.length)} months</span>
		</div>

		<div class="mt-3 overflow-x-auto rounded-lg border border-section-rule" x-data x-init="$el.scrollLeft = $el.scrollWidth">
			<table class="w-full border-collapse">
				<thead>
					<tr>
						<th
							scope="col"
							class="sticky left-0 z-20 whitespace-nowrap border-b border-r border-section-rule bg-table-header px-3 py-2 text-left font-sans text-[10.5px] uppercase tracking-[0.08em] text-label"
						>
							Metric
						</th>
						${months.map((month) => renderMonthHeader(month))}
					</tr>
				</thead>
				<tbody>
					${(() => {
						const rows: ReturnType<typeof html>[] = [];
						let previousGroup: string | null = null;
						metrics.forEach((metric, i) => {
							if (metric.groupLabel && metric.groupLabel !== previousGroup) {
								rows.push(renderGroupHeaderRow(metric.groupLabel, months.length));
							}
							previousGroup = metric.groupLabel;

							const bgClass = i % 2 === 0 ? "bg-surface" : "bg-zebra-row";
							rows.push(html`<tr>
								<th
									scope="row"
									class="sticky left-0 z-10 whitespace-nowrap border-r border-row-rule px-3 py-2 text-left font-sans text-[13px] font-normal text-ink ${bgClass}"
								>
									${metric.label}
								</th>
								${months.map((month) => {
									const dataValue = byKey.get(cellKey(metric.id, month));
									const status = dataValue?.statusId ? (statusesById.get(dataValue.statusId) ?? null) : null;
									const cellComments = comments.get(cellKey(metric.id, month)) ?? [];
									return renderMetricCell(clientId, section, metric, month, dataValue, bgClass, status, statuses, cellComments);
								})}
							</tr>`);
						});
						return rows;
					})()}
				</tbody>
			</table>
		</div>
	</section>`;
}
