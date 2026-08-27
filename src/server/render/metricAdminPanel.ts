import { html } from "hono/html";
import type { MonthlyMetric } from "../data/types";

export type MetricCatalogType = "monthly" | "paid_ads";

const CATALOG_CONFIG: Record<MetricCatalogType, { sectionId: string; endpoint: string; title: string; tableLabel: string }> = {
	monthly: {
		sectionId: "monthly-metric-admin-section",
		endpoint: "/api/admin/monthly-metrics",
		title: "Monthly Data Metrics",
		tableLabel: "Performance table",
	},
	paid_ads: {
		sectionId: "paid-ads-metric-admin-section",
		endpoint: "/api/admin/paid-ads-metrics",
		title: "Paid Ads Metrics",
		tableLabel: "Paid Ads table",
	},
};

/**
 * Small admin UI for a metric catalog (PRD §20 decision: adding a metric
 * is an in-app action, not a database-only/developer task) — reused for
 * both Monthly Data (Phase 4) and Paid Ads (Phase 5) catalogs, since they're
 * the same shape (PRD §11). List + add only for MVP — no edit/delete,
 * matching the narrow scope tasks.md called for.
 */
export function renderMetricAdminPanel(catalog: MetricCatalogType, metrics: MonthlyMetric[], error?: string) {
	const config = CATALOG_CONFIG[catalog];
	return html`<section id="${config.sectionId}" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">${config.title}</h2>
		<p class="mt-1 text-[12.5px] text-muted">New metrics appear in every client's ${config.tableLabel} automatically — no code changes needed.</p>

		<form
			hx-post="${config.endpoint}"
			hx-target="#${config.sectionId}"
			hx-swap="outerHTML"
			class="mt-3 flex flex-wrap items-end gap-2"
		>
			${error ? html`<p class="w-full text-[12.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
			<div class="flex flex-col gap-1">
				<label for="${catalog}-metric-key" class="text-[11px] uppercase tracking-[0.06em] text-label">Key</label>
				<input
					id="${catalog}-metric-key"
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
				<label for="${catalog}-metric-label" class="text-[11px] uppercase tracking-[0.06em] text-label">Label</label>
				<input
					id="${catalog}-metric-label"
					type="text"
					name="label"
					required
					placeholder="e.g. Lead Score"
					class="rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="${catalog}-metric-type" class="text-[11px] uppercase tracking-[0.06em] text-label">Type</label>
				<select
					id="${catalog}-metric-type"
					name="valueType"
					class="rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				>
					<option value="text" selected>Text (flexible)</option>
					<option value="integer">Integer</option>
					<option value="percent">Percent</option>
				</select>
			</div>
			${
				catalog === "monthly"
					? html`<div class="flex flex-col gap-1">
							<label for="${catalog}-metric-group" class="text-[11px] uppercase tracking-[0.06em] text-label">Section (optional)</label>
							<input
								id="${catalog}-metric-group"
								type="text"
								name="groupLabel"
								placeholder="e.g. Top of Funnel"
								class="rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
							/>
						</div>`
					: ""
			}
			<button type="submit" class="rounded-md bg-selected-filter px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
				Add metric
			</button>
		</form>

		<div class="mt-4 divide-y divide-row-rule border-t border-row-rule">
			${metrics.map(
				(m) => html`<div class="flex items-center justify-between py-2 text-[13px]">
					<span class="text-ink">${m.label}${m.groupLabel ? html`<span class="ml-2 text-[11px] text-muted">(${m.groupLabel})</span>` : ""}</span>
					<span class="flex items-center gap-2 font-mono text-[11px] text-muted">
						<span>${m.valueType}</span>
						<span class="rounded-full bg-zebra-row px-2 py-0.5">${m.source}</span>
					</span>
				</div>`,
			)}
		</div>
	</section>`;
}
