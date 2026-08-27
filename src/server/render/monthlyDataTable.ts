import { html, raw } from "hono/html";
import type { MonthlyMetric, MonthlyDataValue, CommentSection } from "../data/types";
import { formatInteger, formatPercent } from "./format";
import { monthLabel } from "../months";

const COMMENT_ICON_PATH =
	'<path d="M20 2H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2h3v4.434l7.740-4.434H20c1.103 0 2-.897 2-2V4c0-1.103-.897-2-2-2zM4 16V4h16l.001 12H4z"/>';

function valueKey(metricId: string, month: string): string {
	return `${metricId}:${month}`;
}

function formatReadOnlyValue(metric: MonthlyMetric, dataValue: MonthlyDataValue | undefined): string {
	if (metric.valueType === "percent") return formatPercent(dataValue?.value ?? null);
	return formatInteger(dataValue?.value ?? null);
}

/**
 * The comment badge button — its own function (not inlined into the month
 * header) because comment mutations re-render it out-of-band via
 * `hx-swap-oob`, so the header count updates immediately without a page
 * reload (PRD §12/§17). `oob` is set on every render except the table's
 * own initial one, where the id must appear exactly once.
 */
export function renderCommentIndicator(
	clientId: string,
	section: CommentSection,
	month: string,
	commentCount: number,
	oob: boolean,
) {
	const label = monthLabel(month);
	return html`<button
		type="button"
		id="comment-indicator-${month}"
		${oob ? html`hx-swap-oob="true"` : ""}
		x-data="{}"
		x-on:click="$dispatch('toggle-comment-panel-${month}')"
		hx-get="/api/clients/${clientId}/comments?section=${section}&month=${month}"
		hx-target="#comment-panel-${month}"
		hx-swap="innerHTML"
		class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] text-muted hover:bg-zebra-row"
		aria-label="${commentCount} comment${commentCount === 1 ? "" : "s"} on ${label}, click to view or add"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"
			>${raw(COMMENT_ICON_PATH)}</svg
		>
		${commentCount > 0 ? String(commentCount) : ""}
	</button>`;
}

function renderMonthHeader(clientId: string, section: CommentSection, month: string, commentCount: number) {
	const label = monthLabel(month);
	return html`<th
		scope="col"
		class="relative border-b border-section-rule bg-table-header px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.05em] text-label"
	>
		<div x-data="{ open: false }" x-on:toggle-comment-panel-${month}.window="open = !open" class="flex flex-col items-center gap-1">
			<span>${label}</span>
			${renderCommentIndicator(clientId, section, month, commentCount, false)}
			<div
				x-show="open"
				x-cloak
				x-transition
				x-on:click.outside="open = false"
				class="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-lg border border-card-border bg-surface p-3 text-left normal-case tracking-normal shadow-lg"
			>
				<div id="comment-panel-${month}" class="text-[12px] text-muted">Loading…</div>
			</div>
		</div>
	</th>`;
}

export function renderMetricCell(
	clientId: string,
	metric: MonthlyMetric,
	month: string,
	dataValue: MonthlyDataValue | undefined,
	bgClass: string,
) {
	if (metric.source === "hubspot") {
		return html`<td class="whitespace-nowrap px-3 py-2 text-right font-mono text-[13px] text-ink ${bgClass}">
			${formatReadOnlyValue(metric, dataValue)}
		</td>`;
	}

	const rawValue = dataValue?.valueText ?? "";
	return html`<td class="whitespace-nowrap p-1 text-right ${bgClass}" x-data="{ editing: false }">
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
 * HubSpot-sourced cells are always read-only. Comments are lazy-loaded per
 * month on first click of that month's indicator (PRD §12, §28) rather than
 * shipped with the initial page load.
 */
export function renderMonthlyDataTable(params: {
	clientId: string;
	section: CommentSection;
	title: string;
	metrics: MonthlyMetric[];
	months: string[];
	values: MonthlyDataValue[];
	commentCounts: Map<string, number>;
}) {
	const { clientId, section, title, metrics, months, values, commentCounts } = params;
	const byKey = new Map(values.map((v) => [valueKey(v.metricId, v.month), v]));

	return html`<section id="${section}-section" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<div class="flex items-center justify-between">
			<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">${title}</h2>
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
						${months.map((month) => renderMonthHeader(clientId, section, month, commentCounts.get(month) ?? 0))}
					</tr>
				</thead>
				<tbody>
					${metrics.map((metric, i) => {
						const bgClass = i % 2 === 0 ? "bg-surface" : "bg-zebra-row";
						return html`<tr>
							<th
								scope="row"
								class="sticky left-0 z-10 whitespace-nowrap border-r border-row-rule px-3 py-2 text-left font-sans text-[13px] font-normal text-ink ${bgClass}"
							>
								${metric.label}
							</th>
							${months.map((month) => renderMetricCell(clientId, metric, month, byKey.get(valueKey(metric.id, month)), bgClass))}
						</tr>`;
					})}
				</tbody>
			</table>
		</div>
	</section>`;
}
