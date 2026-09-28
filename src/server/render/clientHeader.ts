import { html, raw } from "hono/html";
import type { ClientRow, Status } from "../data/types";
import { renderStatusAvatar } from "./statusAvatar";
import { renderStatusDropdown } from "./statusDropdown";
import { displayWebsite, formatDateOnly, formatInteger, formatPlain, websiteHref } from "./format";
import { iconPaths } from "../../components/icons/icon-names";

/**
 * Client detail page header (PRD §9/§25), matching the client-page design
 * reference: status name inline next to the website (not just the icon),
 * CSM as a top-right chip, four stats below (Ad Spend/mo joins once Phase
 * 5 Paid Ads data exists — PRD §11). Name/Website/Population/Domain
 * Authority/CSM and the Clients / AM/AD goals are HubSpot-owned (read-only,
 * PRD §14/§15). Editable: Go-live Date and the Clients / AM/AD baselines
 * (manual fields), plus Status, reusing the same avatar+dropdown as the
 * Overview card (PRD §19), just re-targeted at this header via
 * `view: "header"` instead of `view: "card"`.
 */
/** "Last sync failed" indicator (PRD §14/§29) — sits right next to the HubSpot-owned fields it describes (name/website/population/domain authority/CSM all live in this same header), same spot the existing "synced" note already occupies. `hubspotSyncedAt` is the last sync *attempt* time regardless of outcome (both `applyHubspotSync` and `markHubspotSyncStatus` set it), so it's meaningful for the failure cases too, not just success. */
function renderHubspotSyncIndicator(client: ClientRow) {
	const lastAttempt = client.hubspotSyncedAt ? new Date(client.hubspotSyncedAt).toLocaleString() : "unknown time";

	if (client.hubspotSyncStatus === "error") {
		return html`<span class="font-medium text-needs-attention-text" title="Last sync attempt failed ${lastAttempt}">· sync failed</span>`;
	}
	if (client.hubspotSyncStatus === "unmatched") {
		return html`<span class="font-medium text-needs-attention-text" title="Company not found or archived in HubSpot as of ${lastAttempt}"
			>· not found in HubSpot</span
		>`;
	}
	if (client.hubspotSyncedAt) {
		return html`<span class="text-muted" title="Synced from HubSpot ${lastAttempt}">· synced</span>`;
	}
	return "";
}

/** Manually-entered Go-live Date chip under the CSM chip — click to edit, same inline-form pattern as the Paid Ads go-live chip. Distinct field from `paidAdsGoLiveDate`. */
function renderGoLiveDate(client: ClientRow) {
	return html`<div x-data="{ editing: false }" class="rounded-full bg-zebra-row px-3 py-1.5 text-[13px]">
		<button type="button" x-show="!editing" x-on:click="editing = true" class="flex items-center gap-1.5 text-muted hover:text-ink">
			<span class="text-[11px] uppercase tracking-[0.04em]">Go-live Date</span>
			<span class="font-mono text-ink">${formatDateOnly(client.goLiveDate)}</span>
		</button>
		<form
			x-show="editing"
			x-cloak
			hx-patch="/api/clients/${client.id}/go-live-date"
			hx-target="#client-header"
			hx-swap="outerHTML"
			class="flex items-center gap-1.5"
		>
			<input
				type="date"
				name="goLiveDate"
				value="${client.goLiveDate ?? ""}"
				aria-label="Go-live date"
				class="rounded border border-card-border px-1.5 py-0.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<button type="submit" class="font-medium text-link hover:underline">Save</button>
			<button type="button" x-on:click="editing = false" class="font-medium text-muted hover:underline">Cancel</button>
		</form>
	</div>`;
}

/**
 * One "Baseline → Goal" cell in the header's second stats row. Baseline is
 * manual and click-to-edit; Goal is HubSpot-owned and read-only. Both
 * baselines save through the same endpoint, so the form carries the other
 * baseline's current value in a hidden input to avoid clobbering it.
 */
function renderBaselineGoal(
	client: ClientRow,
	opts: { label: string; field: string; baseline: number | null; goal: number | null; otherField: string; otherValue: number | null },
) {
	return html`<div>
		<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">${opts.label}</div>
		<div class="mt-1 flex items-center gap-2 font-mono text-[14px]" x-data="{ editing: false }">
			<button type="button" x-show="!editing" x-on:click="editing = true" class="flex items-center gap-1.5 text-muted hover:text-ink">
				<span class="font-sans text-[11px] uppercase tracking-[0.04em]">Baseline</span>
				<span class="text-ink">${formatInteger(opts.baseline)}</span>
			</button>
			<form
				x-show="editing"
				x-cloak
				hx-patch="/api/clients/${client.id}/baselines"
				hx-target="#client-header"
				hx-swap="outerHTML"
				class="flex items-center gap-1.5 text-[12px]"
			>
				<input type="hidden" name="${opts.otherField}" value="${opts.otherValue ?? ""}" />
				<input
					type="number"
					min="0"
					step="1"
					name="${opts.field}"
					value="${opts.baseline ?? ""}"
					aria-label="${opts.label} baseline"
					class="w-20 rounded border border-card-border px-1.5 py-0.5 text-right focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
				<button type="submit" class="font-sans font-medium text-link hover:underline">Save</button>
				<button type="button" x-on:click="editing = false" class="font-sans font-medium text-muted hover:underline">Cancel</button>
			</form>
			<span class="text-muted" aria-hidden="true">→</span>
			<span class="flex items-center gap-1.5" title="From HubSpot">
				<span class="font-sans text-[11px] uppercase tracking-[0.04em] text-muted">Goal</span>
				<span class="text-ink">${formatInteger(opts.goal)}</span>
			</span>
		</div>
	</div>`;
}

export function renderClientHeader(client: ClientRow, statuses: Status[]) {
	const site = websiteHref(client.website);

	return html`<div id="client-header" class="rounded-2xl border border-card-border bg-surface p-6 shadow-sm">
		<div class="flex items-start justify-between gap-4">
			<div class="flex items-start gap-4">
				<div class="relative" x-data="{ open: false }">
					<button
						type="button"
						x-on:click="open = !open"
						x-bind:aria-expanded="open.toString()"
						aria-haspopup="true"
						class="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
					>
						${renderStatusAvatar(client.status)}
					</button>
					${renderStatusDropdown(client.id, statuses, client.status.id, { target: "#client-header", view: "header" })}
				</div>

				<div class="min-w-0">
					<h1 class="font-sans text-[26px] font-semibold tracking-[-0.02em] text-ink">${client.name}</h1>
					<div class="mt-0.5 flex items-center gap-1.5 font-mono text-[13px]">
						${
							site
								? html`<a href="${site}" target="_blank" rel="noopener noreferrer" class="text-link hover:underline"
									 >${displayWebsite(client.website)}</a>`
								: html`<span class="text-muted">${displayWebsite(client.website)}</span>`
						}
						<span class="text-muted">·</span>
						<span class="text-muted">${client.status.name}</span>
						${renderHubspotSyncIndicator(client)}
						${
							client.hubspotCompanyId
								? html`<span class="text-muted">·</span>
									<span x-data="{ confirming: false }">
										<button
											type="button"
											x-show="!confirming"
											x-on:click="confirming = true"
											class="text-muted hover:underline"
										>
											unlink
										</button>
										<span x-show="confirming" x-cloak class="whitespace-nowrap">
											<button
												type="button"
												hx-post="/api/clients/${client.id}/hubspot-unlink"
												hx-target="#client-header"
												hx-swap="outerHTML"
												class="font-medium text-needs-attention-text hover:underline"
											>
												Confirm unlink
											</button>
											<button type="button" x-on:click="confirming = false" class="ml-1 text-muted hover:underline">Cancel</button>
										</span>
									</span>`
								: ""
						}
					</div>
				</div>
			</div>

			<div class="flex shrink-0 flex-col items-end gap-2">
				<span class="inline-flex items-center gap-1.5 rounded-full bg-zebra-row px-3 py-1.5 text-[13px] text-ink">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"
						>${raw(iconPaths.user)}</svg
					>
					${client.csm ? client.csm.name : html`<span class="font-bold text-needs-attention-text">Update CSM in Hubspot</span>`}
				</span>
				${renderGoLiveDate(client)}
			</div>
		</div>

		<div class="mt-5 grid grid-cols-2 gap-4 border-t border-row-rule pt-4 sm:grid-cols-4">
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">State</div>
				<div class="mt-1 font-mono text-[14px] text-ink">${formatPlain(client.stateCode)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Population</div>
				<div class="mt-1 font-mono text-[14px] text-ink">${formatInteger(client.population)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Domain Authority</div>
				<div class="mt-1 font-mono text-[14px] text-ink">${formatInteger(client.domainAuthority)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Legal Status</div>
				<div class="mt-1 font-mono text-[14px] text-ink">${formatPlain(client.legalStatus)}</div>
			</div>
		</div>

		<div class="mt-4 grid grid-cols-1 gap-4 border-t border-row-rule pt-4 sm:grid-cols-2">
			${renderBaselineGoal(client, {
				label: "Clients",
				field: "baselineClients",
				baseline: client.baselineClients,
				goal: client.newClientGoal,
				otherField: "baselineAmad",
				otherValue: client.baselineAmad,
			})}
			${renderBaselineGoal(client, {
				label: "AM/AD",
				field: "baselineAmad",
				baseline: client.baselineAmad,
				goal: client.amadGoal,
				otherField: "baselineClients",
				otherValue: client.baselineClients,
			})}
		</div>
	</div>`;
}
