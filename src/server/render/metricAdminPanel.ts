import { html } from "hono/html";
import type { MonthlyMetric } from "../data/types";

/**
 * Small admin UI for the Monthly Data metric catalog (PRD §20 decision:
 * adding a metric is an in-app action, not a database-only/developer task).
 * List + add only for MVP — no edit/delete, matching the narrow scope
 * tasks.md called for.
 */
export function renderMetricAdminPanel(metrics: MonthlyMetric[], error?: string) {
	return html`<section id="metric-admin-section" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">Monthly Data Metrics</h2>
		<p class="mt-1 text-[12.5px] text-muted">
			New metrics appear in every client's Performance table automatically — no code changes needed.
		</p>

		<form hx-post="/api/admin/monthly-metrics" hx-target="#metric-admin-section" hx-swap="outerHTML" class="mt-3 flex flex-wrap items-end gap-2">
			${error ? html`<p class="w-full text-[12.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
			<div class="flex flex-col gap-1">
				<label for="metric-key" class="text-[11px] uppercase tracking-[0.06em] text-label">Key</label>
				<input
					id="metric-key"
					type="text"
					name="key"
					required
					placeholder="e.g. lead_score"
					pattern="[a-z0-9_]+"
					title="Lowercase letters, numbers, and underscores only"
					class="rounded-md border border-card-border px-2 py-1.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="metric-label" class="text-[11px] uppercase tracking-[0.06em] text-label">Label</label>
				<input
					id="metric-label"
					type="text"
					name="label"
					required
					placeholder="e.g. Lead Score"
					class="rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="metric-type" class="text-[11px] uppercase tracking-[0.06em] text-label">Type</label>
				<select
					id="metric-type"
					name="valueType"
					class="rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				>
					<option value="text" selected>Text (flexible)</option>
					<option value="integer">Integer</option>
					<option value="percent">Percent</option>
				</select>
			</div>
			<button type="submit" class="rounded-md bg-selected-filter px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
				Add metric
			</button>
		</form>

		<div class="mt-4 divide-y divide-row-rule border-t border-row-rule">
			${metrics.map(
				(m) => html`<div class="flex items-center justify-between py-2 text-[13px]">
					<span class="text-ink">${m.label}</span>
					<span class="flex items-center gap-2 font-mono text-[11px] text-muted">
						<span>${m.valueType}</span>
						<span class="rounded-full bg-zebra-row px-2 py-0.5">${m.source}</span>
					</span>
				</div>`,
			)}
		</div>
	</section>`;
}
