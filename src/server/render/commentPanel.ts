import { html } from "hono/html";
import type { Comment, CommentSection } from "../data/types";
import { renderCommentIndicator } from "./monthlyDataTable";

function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderCommentItem(clientId: string, section: CommentSection, month: string, comment: Comment) {
	return html`<div x-data="{ editing: false, confirming: false }" class="border-b border-row-rule py-2 last:border-b-0">
		<div x-show="!editing">
			<p class="whitespace-pre-wrap text-[12.5px] text-ink">${comment.body}</p>
			<div class="mt-1 flex items-center gap-2">
				<span class="text-[11px] text-muted">${comment.createdBy} · ${formatDateTime(comment.createdAt)}</span>
				<button type="button" x-on:click="editing = true" class="text-[11px] font-medium text-link hover:underline">Edit</button>
				<template x-if="!confirming">
					<button type="button" x-on:click="confirming = true" class="text-[11px] font-medium text-needs-attention-text hover:underline">
						Delete
					</button>
				</template>
				<template x-if="confirming">
					<span class="flex items-center gap-1.5 text-[11px]">
						<button
							type="button"
							hx-delete="/api/clients/${clientId}/comments/${comment.id}"
							hx-target="#comment-panel-${month}"
							hx-swap="innerHTML"
							hx-vals='{"section":"${section}","month":"${month}"}'
							class="font-medium text-needs-attention-text hover:underline"
						>
							Confirm
						</button>
						<button type="button" x-on:click="confirming = false" class="font-medium text-muted hover:underline">Cancel</button>
					</span>
				</template>
			</div>
		</div>
		<form
			x-show="editing"
			hx-patch="/api/clients/${clientId}/comments/${comment.id}"
			hx-target="#comment-panel-${month}"
			hx-swap="innerHTML"
			hx-vals='{"section":"${section}","month":"${month}"}'
			class="flex flex-col gap-1.5"
		>
			<textarea
				name="body"
				rows="2"
				maxlength="2000"
				required
				class="w-full rounded-md border border-card-border px-2 py-1 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			>
${comment.body}</textarea
			>
			<div class="flex items-center gap-2">
				<button type="submit" class="text-[11px] font-medium text-link hover:underline">Save</button>
				<button type="button" x-on:click="editing = false" class="text-[11px] font-medium text-muted hover:underline">Cancel</button>
			</div>
		</form>
	</div>`;
}

/**
 * Rendered into the popover opened from a month header's comment indicator
 * (PRD §12). Note: this is `hx-swap="innerHTML"`ed *into* the existing
 * `#comment-panel-{month}` placeholder (see monthlyDataTable.ts) — it must
 * NOT re-wrap its own content in an element carrying that same id, or every
 * open/mutation would nest another duplicate-id div inside the last one.
 * The leading `renderCommentIndicator(...)` fragment is a separate
 * out-of-band swap (`hx-swap-oob`) that updates the header badge count
 * in place, elsewhere in the DOM, in the same response.
 */
export function renderCommentPanel(
	clientId: string,
	section: CommentSection,
	month: string,
	comments: Comment[],
	error?: string,
) {
	return html`${renderCommentIndicator(clientId, section, month, comments.length, true)}
	<div class="max-h-48 overflow-y-auto">
		${
			comments.length > 0
				? comments.map((c) => renderCommentItem(clientId, section, month, c))
				: html`<p class="text-[12px] text-muted">No comments yet.</p>`
		}
	</div>
	<form
		hx-post="/api/clients/${clientId}/comments"
		hx-target="#comment-panel-${month}"
		hx-swap="innerHTML"
		hx-vals='{"section":"${section}","month":"${month}"}'
		class="mt-2 flex flex-col gap-1.5 border-t border-row-rule pt-2"
	>
		${error ? html`<p class="text-[11.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
		<textarea
			name="body"
			rows="2"
			maxlength="2000"
			required
			placeholder="Add a comment…"
			class="w-full rounded-md border border-card-border px-2 py-1 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
		></textarea>
		<button
			type="submit"
			class="self-start rounded-md bg-selected-filter px-2.5 py-1 text-[11.5px] font-medium text-white hover:opacity-90"
		>
			Add comment
		</button>
	</form>`;
}
