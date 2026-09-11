import { html, raw } from "hono/html";
import type { ClientRow, Status } from "../data/types";
import { INTEGRATION_FLAGS, INTEGRATION_FLAG_LABELS } from "../data/types";
import { renderStatusAvatar } from "./statusAvatar";
import { renderStatusDropdown } from "./statusDropdown";
import { displayWebsite, formatMonthlySpend, formatPlain, websiteHref } from "./format";
import { iconPaths } from "../../components/icons/icon-names";

/**
 * Ad Spend widget duplicated from the Paid Ads detail-page chip
 * (`renderPaidAdsSettings`), scoped to just this one field (no go-live date)
 * and editable directly from the Overview card. Saves through the same
 * `PATCH /api/clients/:id/paid-ads-settings` endpoint as the detail page —
 * `view: "card"` (same `{ target, view }` convention the status dropdown
 * already uses) tells the route to swap the whole card back in instead of
 * the detail page's two-chip widget, and the current go-live date still
 * rides along as a hidden field so this save never clobbers it (same
 * "carry the other field's value" pattern `renderPaidAdsSettings` already
 * uses between its own two chips). `error` must only ever reach a response
 * via `renderClientCard`'s own `adSpendError` param, never returned as this
 * function's output directly — the card's form targets `#client-card-...`
 * (the whole card) with an outerHTML swap, so a bare validation-error
 * response scoped to just this widget's own id would replace the entire
 * card with just this small fragment.
 */
function renderCardAdSpend(client: ClientRow, error?: string) {
	const spendRaw = client.adSpendPerMonth === null ? "" : String(client.adSpendPerMonth);
	const goLiveRaw = client.paidAdsGoLiveDate ?? "";

	return html`<div id="card-ad-spend-${client.id}" x-data="{ editing: false }" class="pointer-events-auto text-right">
		${error ? html`<p class="mb-1 text-[10.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
		<button type="button" x-show="!editing" x-on:click="editing = true" class="text-right hover:opacity-80">
			<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Ad Spend</div>
			<div class="mt-1 font-mono text-[14px] text-ink">${formatMonthlySpend(client.adSpendPerMonth)}</div>
		</button>
		<form
			x-show="editing"
			x-cloak
			hx-patch="/api/clients/${client.id}/paid-ads-settings"
			hx-vals='{"view":"card"}'
			hx-target="#client-card-${client.id}"
			hx-swap="outerHTML"
			class="flex items-center justify-end gap-1"
		>
			<input type="hidden" name="goLiveDate" value="${goLiveRaw}" />
			<input
				type="text"
				inputmode="decimal"
				name="adSpendPerMonth"
				value="${spendRaw}"
				aria-label="Ad spend per month"
				placeholder="e.g. 2400"
				class="w-16 rounded border border-card-border px-1.5 py-0.5 text-right font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<button type="submit" class="text-[11px] font-medium text-link hover:underline">Save</button>
			<button type="button" x-on:click="editing = false" class="text-[11px] font-medium text-muted hover:underline">Cancel</button>
		</form>
	</div>`;
}

/** One "which external systems is this center on" checkbox (PRD §5/§8) — independently toggled, saves immediately, re-renders the whole card. */
function renderIntegrationCheckbox(client: ClientRow, flag: (typeof INTEGRATION_FLAGS)[number]) {
	return html`<label class="pointer-events-auto flex items-center gap-1.5 text-[11px] text-muted">
		<input
			type="checkbox"
			name="checked"
			value="true"
			${client.integrationFlags[flag] ? "checked" : ""}
			hx-patch="/api/clients/${client.id}/integration-flags"
			hx-vals='{"flag":"${flag}"}'
			hx-trigger="change"
			hx-target="#client-card-${client.id}"
			hx-swap="outerHTML"
			aria-label="${INTEGRATION_FLAG_LABELS[flag]}"
			class="h-3.5 w-3.5 rounded border-card-border text-selected-filter focus:outline-none focus:ring-2 focus:ring-selected-filter"
		/>
		${INTEGRATION_FLAG_LABELS[flag]}
	</label>`;
}

/**
 * One client card (PRD §5/§8). The whole card is a clickable "stretched
 * link" to /clients/:id — a real full-size <a> sits underneath at z-0,
 * pointer-events-none on the content wrapper lets clicks fall through to
 * it everywhere except the avatar (status control) and the website link,
 * which re-enable pointer-events so they stay independently clickable
 * without nesting interactive elements inside an <a> (PRD §10/§26).
 */
export function renderClientCard(client: ClientRow, statuses: Status[], adSpendError?: string) {
	const href = `/clients/${client.id}`;
	const site = websiteHref(client.website);

	return html`<div
		id="client-card-${client.id}"
		data-client-card
		class="group relative rounded-2xl border border-card-border bg-surface p-5 shadow-sm transition hover:shadow-md"
	>
		<a href="${href}" class="absolute inset-0 z-0 rounded-2xl" aria-label="View ${client.name}"></a>

		<div class="relative z-20 pointer-events-none flex items-start gap-3">
			<div class="pointer-events-auto relative" x-data="{ open: false }">
				<button
					type="button"
					x-on:click="open = !open"
					x-bind:aria-expanded="open.toString()"
					aria-haspopup="true"
					class="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>
					${renderStatusAvatar(client.status)}
				</button>
				${renderStatusDropdown(client.id, statuses, client.status.id, {
					target: `#client-card-${client.id}`,
					view: "card",
				})}
			</div>
			<div class="min-w-0 pt-1">
				<h3 class="truncate font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink">${client.name}</h3>
				${
					site
						? html`<a
								href="${site}"
								target="_blank"
								rel="noopener noreferrer"
								class="pointer-events-auto font-mono text-[11.5px] text-link hover:underline"
							 >${displayWebsite(client.website)}</a>`
						: html`<span class="font-mono text-[11.5px] text-muted">${displayWebsite(client.website)}</span>`
				}
			</div>
		</div>

		<div class="relative z-10 pointer-events-none mt-4 flex items-start justify-between">
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">State</div>
				<div class="mt-1 font-mono text-[14px] text-ink">${formatPlain(client.stateCode)}</div>
			</div>
			${renderCardAdSpend(client, adSpendError)}
		</div>

		<div class="relative z-10 pointer-events-none mt-3 flex items-center gap-4">
			${INTEGRATION_FLAGS.map((flag) => renderIntegrationCheckbox(client, flag))}
		</div>

		<div class="relative z-10 pointer-events-none mt-4 flex items-center gap-2 border-t border-row-rule pt-3 text-[13px] text-muted">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">${raw(
				iconPaths.user,
			)}</svg>
			${client.csm ? client.csm.name : "Unassigned"}
		</div>
	</div>`;
}
