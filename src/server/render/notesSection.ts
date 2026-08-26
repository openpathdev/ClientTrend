import { html } from "hono/html";
import type { ClientRow } from "../data/types";

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * General Notes — a single freeform text block per client (PRD §13), not a
 * list of separate entries. Matches the client-page design reference: one
 * continuous note, one "Updated <date>" stamp, no per-paragraph
 * attribution. Edit mode is local Alpine state (content is already on the
 * page); Save is the only HTTP round trip.
 */
export function renderNotesSection(client: ClientRow, error?: string) {
	const hasNotes = Boolean(client.generalNotes);
	return html`<section
		id="notes-section"
		x-data="{ editing: ${hasNotes ? "false" : "true"} }"
		class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm"
	>
		<div class="flex items-center justify-between">
			<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">General notes</h2>
			${
				client.generalNotesUpdatedAt
					? html`<span class="font-mono text-[11px] text-muted">Updated ${formatDate(client.generalNotesUpdatedAt)}</span>`
					: ""
			}
		</div>

		<div x-show="!editing" class="mt-3">
			${
				hasNotes
					? html`<div class="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">${client.generalNotes}</div>`
					: html`<p class="text-[13px] text-muted">No notes yet.</p>`
			}
			<button type="button" x-on:click="editing = true" class="mt-2 text-[11.5px] font-medium text-link hover:underline">
				${hasNotes ? "Edit" : "Add notes"}
			</button>
		</div>

		<form x-show="editing" hx-patch="/api/clients/${client.id}/notes" hx-target="#notes-section" hx-swap="outerHTML" class="mt-3">
			${error ? html`<p class="mb-2 text-[12.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
			<textarea
				name="body"
				rows="8"
				maxlength="5000"
				placeholder="Add general notes about this client…"
				class="w-full rounded-md border border-card-border px-2 py-1.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			>
${client.generalNotes ?? ""}</textarea
			>
			<div class="mt-2 flex items-center gap-3">
				<button type="submit" class="rounded-md bg-selected-filter px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
					Save
				</button>
				${
					hasNotes
						? html`<button type="button" x-on:click="editing = false" class="text-[11.5px] font-medium text-muted hover:underline">
								Cancel
							</button>`
						: ""
				}
			</div>
		</form>
	</section>`;
}
