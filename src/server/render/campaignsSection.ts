import { html } from "hono/html";
import type { MonthlyMetric } from "../data/types";

/**
 * Campaigns-only pieces around the shared grid (renderMonthlyDataTable):
 * the show/hide switch, the editable campaign name in each row's label
 * cell, the "+ Add campaign" button, and the slim card shown while the
 * table is switched off.
 */

export function renderCampaignsToggle(clientId: string, enabled: boolean, monthCount: number) {
	return html`<label class="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-muted">
		<input
			type="checkbox"
			name="checked"
			value="true"
			${enabled ? "checked" : ""}
			hx-patch="/api/clients/${clientId}/campaigns/enabled"
			hx-vals='{"months":"${String(monthCount)}"}'
			hx-trigger="change"
			hx-target="#campaigns-section"
			hx-swap="outerHTML"
			class="peer sr-only"
			aria-label="Show Campaigns table"
		/>
		<span
			class="relative h-4 w-7 rounded-full bg-track transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-surface after:shadow after:transition-transform peer-checked:bg-selected-filter peer-checked:after:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-selected-filter"
			aria-hidden="true"
		></span>
		${enabled ? "On" : "Off"}
	</label>`;
}

/** The card shown while a client's Campaigns table is switched off. */
export function renderCampaignsOff(clientId: string, monthCount: number) {
	return html`<section id="campaigns-section" class="rounded-2xl border border-card-border bg-surface px-5 py-4 shadow-sm">
		<div class="flex items-center gap-3">
			<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">Campaigns</h2>
			${renderCampaignsToggle(clientId, false, monthCount)}
		</div>
	</section>`;
}

/** Row-label cell content: click the name to rename it; × deletes the campaign (with a confirmation). */
export function renderCampaignName(clientId: string, campaign: MonthlyMetric, monthCount: number) {
	return html`<span class="campaign-name flex items-center justify-between gap-2" x-data="{ editing: false }">
		<button
			type="button"
			x-show="!editing"
			x-on:click="editing = true; $nextTick(() => $refs.name.focus())"
			class="max-w-[220px] truncate text-left hover:underline ${campaign.label ? "" : "italic text-muted"}"
			title="Click to rename"
		>
			${campaign.label || "Untitled campaign"}
		</button>
		<input
			x-show="editing"
			x-cloak
			x-ref="name"
			x-on:blur="editing = false"
			x-on:keydown.escape="editing = false; $el.value = $el.defaultValue"
			type="text"
			name="name"
			value="${campaign.label}"
			maxlength="200"
			placeholder="Campaign name"
			hx-patch="/api/clients/${clientId}/campaigns/${campaign.id}/name"
			hx-trigger="change, keyup[key=='Enter']"
			hx-target="closest .campaign-name"
			hx-swap="outerHTML"
			class="w-[220px] rounded border border-card-border px-2 py-0.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
		/>
		<button
			type="button"
			hx-delete="/api/clients/${clientId}/campaigns/${campaign.id}"
			hx-vals='{"months":"${String(monthCount)}"}'
			hx-confirm="Delete ${campaign.label ? `“${campaign.label}”` : "this campaign"} and all its monthly values?"
			hx-target="#campaigns-section"
			hx-swap="outerHTML"
			class="text-[13px] leading-none text-muted hover:text-needs-attention-text"
			aria-label="Delete campaign ${campaign.label}"
			title="Delete campaign"
		>
			×
		</button>
	</span>`;
}

export function renderAddCampaignButton(clientId: string, monthCount: number) {
	return html`<div class="mt-3">
		<button
			type="button"
			hx-post="/api/clients/${clientId}/campaigns"
			hx-vals='{"months":"${String(monthCount)}"}'
			hx-target="#campaigns-section"
			hx-swap="outerHTML"
			class="font-mono text-[11px] font-medium text-link hover:underline"
		>
			+ Add campaign
		</button>
	</div>`;
}
