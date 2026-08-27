import { html } from "hono/html";
import type { Change } from "../data/types";

/** `change.changeDate` is stored as ISO (YYYY-MM-DD); displayed as MM/DD/YYYY per user preference. */
function formatDate(iso: string): string {
	const [year, month, day] = iso.split("-");
	return `${month}/${day}/${year}`;
}

/**
 * Compact single-row layout per the client-page design reference: date —
 * description — author, all on one line. Edit/Delete are real controls
 * (kept for PRD §13 CRUD requirements) but only surface on hover/focus so
 * the default view stays as clean as the reference.
 */
function renderChangeItem(clientId: string, change: Change) {
	return html`<div x-data="{ editing: false, confirming: false }" class="group border-b border-row-rule py-2.5 last:border-b-0">
		<div x-show="!editing" class="flex items-baseline gap-3">
			<span class="w-20 shrink-0 font-mono text-[12px] text-muted">${formatDate(change.changeDate)}</span>
			<p class="min-w-0 flex-1 truncate text-[13.5px] text-ink" title="${change.description}">${change.description}</p>
			<span class="shrink-0 text-[12px] text-muted">${change.createdBy}</span>
			<span class="hidden shrink-0 items-center gap-2 text-[11px] group-hover:flex group-focus-within:flex">
				<button type="button" x-on:click="editing = true" class="font-medium text-link hover:underline">Edit</button>
				<button type="button" x-show="!confirming" x-on:click="confirming = true" class="font-medium text-needs-attention-text hover:underline">
					Delete
				</button>
				<span x-show="confirming" x-cloak class="flex items-center gap-1.5 whitespace-nowrap">
					<button
						type="button"
						hx-delete="/api/clients/${clientId}/changes/${change.id}"
						hx-target="#changes-section"
						hx-swap="outerHTML"
						class="font-medium text-needs-attention-text hover:underline"
					>
						Confirm
					</button>
					<button type="button" x-on:click="confirming = false" class="font-medium text-muted hover:underline">Cancel</button>
				</span>
			</span>
		</div>
		<form
			x-show="editing"
			hx-patch="/api/clients/${clientId}/changes/${change.id}"
			hx-target="#changes-section"
			hx-swap="outerHTML"
			class="flex flex-col gap-2 py-1"
		>
			<input
				type="date"
				name="changeDate"
				value="${change.changeDate}"
				required
				class="w-fit rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<textarea
				name="description"
				rows="2"
				required
				class="w-full rounded-md border border-card-border px-2 py-1.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			>
${change.description}</textarea
			>
			<div class="flex items-center gap-3">
				<button type="submit" class="text-[11.5px] font-medium text-link hover:underline">Save</button>
				<button type="button" x-on:click="editing = false" class="text-[11.5px] font-medium text-muted hover:underline">Cancel</button>
			</div>
		</form>
	</div>`;
}

export function renderChangesSection(clientId: string, changes: Change[], error?: string) {
	const today = new Date().toISOString().slice(0, 10);
	return html`<section id="changes-section" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">List of changes</h2>

		<details class="mt-3">
			<summary class="cursor-pointer text-[12.5px] font-medium text-link hover:underline">Log a change</summary>
			<form
				hx-post="/api/clients/${clientId}/changes"
				hx-target="#changes-section"
				hx-swap="outerHTML"
				class="mt-2 flex flex-col gap-2"
			>
				${error ? html`<p class="text-[12.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
				<input
					type="date"
					name="changeDate"
					value="${today}"
					required
					class="w-fit rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				/>
				<textarea
					name="description"
					rows="2"
					required
					placeholder="What changed?"
					class="w-full rounded-md border border-card-border px-2 py-1.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
				></textarea>
				<button
					type="submit"
					class="self-start rounded-md bg-selected-filter px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
				>
					Log change
				</button>
			</form>
		</details>

		<div class="mt-3">
			${
				changes.length > 0
					? changes.map((change) => renderChangeItem(clientId, change))
					: html`<p class="text-[13px] text-muted">No changes logged yet.</p>`
			}
		</div>
	</section>`;
}
