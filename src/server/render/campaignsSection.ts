import { html } from "hono/html";
import type { CampaignGroup } from "../data/campaigns";
import { renderEditableTitle } from "./editableTitle";

/**
 * Campaigns-only pieces around the shared grid (renderMonthlyDataTable):
 * the show/hide switch, each campaign's editable title and delete button,
 * the "+ Add campaign" button, and the slim cards shown while Campaigns are
 * switched off or empty. Each campaign is its own table (a copy of the Paid
 * Ads rows); all of them live inside one `#campaigns-section` wrapper, which
 * every campaign-level change re-renders.
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

/** A campaign's editable title on its own — what the rename route returns. */
export function renderCampaignGroupTitleField(clientId: string, group: CampaignGroup, monthCount: number, error?: string) {
	return renderEditableTitle({
		value: group.name,
		fallback: "Untitled campaign",
		endpoint: `/api/clients/${clientId}/campaign-groups/${group.id}/name`,
		ariaLabel: "Campaign name",
		vals: { months: String(monthCount) },
		error,
	});
}

/** A campaign's heading: its editable title plus a × that deletes the campaign after a confirmation. */
export function renderCampaignGroupTitle(clientId: string, group: CampaignGroup, monthCount: number) {
	return html`<span class="flex items-center gap-2">
		${renderCampaignGroupTitleField(clientId, group, monthCount)}
		<button
			type="button"
			hx-delete="/api/clients/${clientId}/campaign-groups/${group.id}"
			hx-vals='{"months":"${String(monthCount)}"}'
			hx-confirm="Delete this campaign and all its monthly values?"
			hx-target="#campaigns-section"
			hx-swap="outerHTML"
			class="text-[15px] leading-none text-muted hover:text-needs-attention-text"
			aria-label="Delete campaign"
			title="Delete campaign"
		>
			×
		</button>
	</span>`;
}

export function renderAddCampaignGroupButton(clientId: string, monthCount: number) {
	return html`<button
		type="button"
		hx-post="/api/clients/${clientId}/campaign-groups"
		hx-vals='{"months":"${String(monthCount)}"}'
		hx-target="#campaigns-section"
		hx-swap="outerHTML"
		class="self-start font-mono text-[11px] font-medium text-link hover:underline"
	>
		+ Add campaign
	</button>`;
}

/** Shown while Campaigns are on but every campaign has been deleted. */
export function renderCampaignsEmpty(clientId: string, monthCount: number) {
	return html`<section class="rounded-2xl border border-card-border bg-surface px-5 py-4 shadow-sm">
		<div class="flex items-center gap-3">
			<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">Campaigns</h2>
			${renderCampaignsToggle(clientId, true, monthCount)}
		</div>
		<p class="mt-2 text-[13px] text-muted">No campaigns yet.</p>
	</section>`;
}
