import { html } from "hono/html";
import type { Comment, CommentSection } from "../data/types";
import { domCellKey } from "../cellKey";

function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Must match the id `renderCellMarker`/`renderCellMarkerButton` construct in monthlyDataTable.ts — see domCellKey's doc comment for why colons can't appear in this id. */
function panelId(section: CommentSection, metricId: string, month: string): string {
	return `comment-panel-${section}-${domCellKey(metricId, month)}`;
}

function renderCommentItem(clientId: string, section: CommentSection, metricId: string, month: string, comment: Comment) {
	const targetId = panelId(section, metricId, month);
	return html`<div x-data="{ editing: false, confirming: false }" class="border-b border-row-rule py-2 last:border-b-0">
		<div x-show="!editing">
			<p class="whitespace-pre-wrap text-[12.5px] text-ink">${comment.body}</p>
			<div class="mt-1 flex flex-wrap items-center gap-2">
				<span class="text-[11px] text-muted">${comment.createdBy} · ${formatDateTime(comment.createdAt)}</span>
				<button type="button" x-on:click="editing = true" class="text-[11px] font-medium text-link hover:underline">Edit</button>
				<button
					type="button"
					x-show="!confirming"
					x-on:click="confirming = true"
					class="text-[11px] font-medium text-needs-attention-text hover:underline"
				>
					Delete
				</button>
				<span x-show="confirming" x-cloak class="flex items-center gap-1.5 text-[11px]">
					<button
						type="button"
						hx-delete="/api/clients/${clientId}/comments/${comment.id}"
						hx-target="#${targetId}"
						hx-swap="innerHTML"
						hx-vals='{"section":"${section}","metricId":"${metricId}","month":"${month}"}'
						class="font-medium text-needs-attention-text hover:underline"
					>
						Confirm
					</button>
					<button type="button" x-on:click="confirming = false" class="font-medium text-muted hover:underline">Cancel</button>
				</span>
			</div>
		</div>
		<form
			x-show="editing"
			hx-patch="/api/clients/${clientId}/comments/${comment.id}"
			hx-target="#${targetId}"
			hx-swap="innerHTML"
			hx-vals='{"section":"${section}","metricId":"${metricId}","month":"${month}"}'
			class="flex flex-col gap-1.5"
		>
			<textarea
				name="body"
				rows="2"
				maxlength="2000"
				required
				aria-label="Edit comment"
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
 * Rendered into the popover opened from a cell's marker (PRD §12, per-cell
 * comments — redesigned 2026-08-31, superseding the earlier month-level
 * model). This is `hx-swap="innerHTML"`ed *into* the panel div already
 * present inside the cell's popover (`#comment-panel-{section}-{metricId}:{month}`,
 * see monthlyDataTable.ts's `renderCellMarker`) — it must NOT re-wrap its
 * own content in an element carrying that same id, or every open/mutation
 * would nest a duplicate-id div inside the last one (the same caveat as
 * the old month-level version, now scoped per cell instead of per month).
 *
 * The cell's comment-count badge is a separate, out-of-band-swappable
 * element (`renderCellMarkerButton` in monthlyDataTable.ts) — app.ts's
 * comment routes prepend it (with `oob=true`) to the response alongside
 * this panel's content, so the badge updates immediately without resetting
 * the popover's own open/close state (which lives on a never-swapped
 * ancestor, connected only via a window-scoped custom event).
 */
export function renderCommentPopover(
	clientId: string,
	section: CommentSection,
	metricId: string,
	month: string,
	comments: Comment[],
	error?: string,
) {
	const targetId = panelId(section, metricId, month);
	return html`<div class="max-h-48 overflow-y-auto">
		${
			comments.length > 0
				? comments.map((c) => renderCommentItem(clientId, section, metricId, month, c))
				: html`<p class="text-[12px] text-muted">No comments yet.</p>`
		}
	</div>
	<form
		hx-post="/api/clients/${clientId}/comments"
		hx-target="#${targetId}"
		hx-swap="innerHTML"
		hx-vals='{"section":"${section}","metricId":"${metricId}","month":"${month}"}'
		class="mt-2 flex flex-col gap-1.5 border-t border-row-rule pt-2"
	>
		${error ? html`<p class="text-[11.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
		<textarea
			name="body"
			rows="2"
			maxlength="2000"
			required
			aria-label="Add a comment"
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
