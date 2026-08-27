import { html } from "hono/html";
import type { ClientRow } from "../data/types";

function formatGoLive(date: string | null): string {
	if (!date) return "—";
	return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatSpend(value: number | null): string {
	if (value === null) return "—";
	return `$${value.toLocaleString("en-US")}`;
}

/**
 * Two small manually-entered chips shown atop the Paid Ads table (PRD §11):
 * go-live date and ad spend/mo. Both are plain client fields, not derived
 * from any metric or external source (confirmed 2026-08-29). Each chip
 * edits independently but both save through the same endpoint, so each
 * edit form carries the *other* field's current value in a hidden input
 * to avoid clobbering it.
 */
export function renderPaidAdsSettings(client: ClientRow, error?: string) {
	const goLiveRaw = client.paidAdsGoLiveDate ?? "";
	const spendRaw = client.adSpendPerMonth === null ? "" : String(client.adSpendPerMonth);

	return html`<div id="paid-ads-settings" class="flex flex-wrap items-center gap-2">
		${error ? html`<p class="w-full text-[11.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
		<div x-data="{ editing: false }" class="rounded-full bg-zebra-row px-2.5 py-1 text-[11px]">
			<button type="button" x-show="!editing" x-on:click="editing = true" class="flex items-center gap-1 text-muted hover:text-ink">
				<span class="uppercase tracking-[0.04em]">Go-live</span>
				<span class="font-mono text-ink">${formatGoLive(client.paidAdsGoLiveDate)}</span>
			</button>
			<form
				x-show="editing"
				x-cloak
				hx-patch="/api/clients/${client.id}/paid-ads-settings"
				hx-target="#paid-ads-settings"
				hx-swap="outerHTML"
				class="flex items-center gap-1"
			>
				<input type="hidden" name="adSpendPerMonth" value="${spendRaw}" />
				<input
					type="date"
					name="goLiveDate"
					value="${goLiveRaw}"
					class="rounded border border-card-border px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
				<button type="submit" class="font-medium text-link hover:underline">Save</button>
				<button type="button" x-on:click="editing = false" class="font-medium text-muted hover:underline">Cancel</button>
			</form>
		</div>

		<div x-data="{ editing: false }" class="rounded-full bg-zebra-row px-2.5 py-1 text-[11px]">
			<button type="button" x-show="!editing" x-on:click="editing = true" class="flex items-center gap-1 text-muted hover:text-ink">
				<span class="uppercase tracking-[0.04em]">Ad spend</span>
				<span class="font-mono text-ink">${formatSpend(client.adSpendPerMonth)} / mo</span>
			</button>
			<form
				x-show="editing"
				x-cloak
				hx-patch="/api/clients/${client.id}/paid-ads-settings"
				hx-target="#paid-ads-settings"
				hx-swap="outerHTML"
				class="flex items-center gap-1"
			>
				<input type="hidden" name="goLiveDate" value="${goLiveRaw}" />
				<input
					type="text"
					inputmode="decimal"
					name="adSpendPerMonth"
					value="${spendRaw}"
					placeholder="e.g. 2400"
					class="w-20 rounded border border-card-border px-1.5 py-0.5 text-right font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
				<button type="submit" class="font-medium text-link hover:underline">Save</button>
				<button type="button" x-on:click="editing = false" class="font-medium text-muted hover:underline">Cancel</button>
			</form>
		</div>
	</div>`;
}
