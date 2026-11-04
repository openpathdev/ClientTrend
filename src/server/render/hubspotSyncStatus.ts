import { html } from "hono/html";
import type { SyncRun } from "../data/hubspotSyncLog";

/** HX-Trigger event sent when a sync the page was watching finishes — the Overview grid reloads on it. */
export const HUBSPOT_SYNC_FINISHED_EVENT = "hubspot-sync-finished";

/** How often the page checks a running sync. */
const POLL_SECONDS = 3;

/**
 * A run still marked running after this long has died part-way (e.g. a
 * Worker invocation hit a Cloudflare limit, so the next batch was never
 * chained). Real runs finish in 1–2 minutes.
 */
export const STALE_RUN_MINUTES = 15;

export function isRunActive(run: SyncRun, now: Date): boolean {
	return run.status === "running" && now.getTime() - new Date(run.startedAt).getTime() < STALE_RUN_MINUTES * 60_000;
}

/** "just now", "5 min ago", "3 hr ago", "yesterday", "4 days ago" — relative, so it reads right in any time zone. */
export function timeAgo(iso: string, now: Date): string {
	const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${String(minutes)} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${String(hours)} hr ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? "yesterday" : `${String(days)} days ago`;
}

function plural(n: number, word: string): string {
	return `${String(n)} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The message next to the Sync HubSpot button (always `#hubspot-sync-status`,
 * swapped by outerHTML).
 * - running: "Syncing…" with a progress count, re-polls itself every few seconds
 * - `live` (the page watched this run finish): "Sync finished — …"
 * - otherwise (page load): "Last synced 3 hr ago · …"
 */
export function renderHubspotSyncStatus(opts: { run: SyncRun | null; problemClients?: string[]; live?: boolean; now?: Date }) {
	const { run, problemClients = [], live = false } = opts;
	const now = opts.now ?? new Date();
	if (!run) return html`<span id="hubspot-sync-status" class="text-[12px] text-muted"></span>`;

	if (isRunActive(run, now)) {
		return html`<span
			id="hubspot-sync-status"
			class="inline-flex items-center gap-1.5 text-[12px] text-muted"
			role="status"
			hx-get="/api/admin/hubspot-sync/status?runId=${run.id}&live=1"
			hx-trigger="every ${String(POLL_SECONDS)}s"
			hx-swap="outerHTML"
		>
			<span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-card-border border-t-ink" aria-hidden="true"></span>
			Syncing HubSpot…${run.clientsProcessed > 0 ? ` ${plural(run.clientsProcessed, "client")} so far` : ""}
		</span>`;
	}

	const names = problemClients.join(", ") + (run.clientsFailed > problemClients.length ? ", …" : "");
	const when = timeAgo(run.finishedAt ?? run.startedAt, now);

	let tone: "healthy" | "watch" | "attention";
	let text: string;
	let detail = "";
	if (run.status === "running") {
		tone = "attention";
		text = `Last sync stopped before finishing (started ${timeAgo(run.startedAt, now)}). Try again.`;
	} else if (run.status === "failed") {
		tone = "attention";
		text = live ? "Sync failed." : `Last sync failed ${when}.`;
		detail = run.errorSummary ?? "";
	} else if (run.status === "partial" || run.clientsFailed > 0) {
		tone = "watch";
		const counts = `${String(run.clientsProcessed)} updated, ${String(run.clientsFailed)} couldn't sync`;
		text = live ? `Sync finished with problems — ${counts}.` : `Last synced ${when} · ${counts}.`;
		detail = names ? `Couldn't sync: ${names}` : "";
	} else {
		tone = "healthy";
		text = live ? `Sync finished — ${plural(run.clientsProcessed, "client")} updated.` : `Last synced ${when} · ${plural(run.clientsProcessed, "client")}.`;
	}

	const color = tone === "attention" ? "text-needs-attention-text" : tone === "watch" ? "text-watch-text" : live ? "text-healthy-text" : "text-muted";
	return html`<span id="hubspot-sync-status" class="max-w-md text-right text-[12px] ${color}" role="status" title="${detail}">
		${text}${detail && tone === "watch" ? html`<span class="block text-muted">${detail}</span>` : ""}${detail && tone === "attention" ? html`<span class="block text-muted">${detail.length > 140 ? `${detail.slice(0, 140)}…` : detail}</span>` : ""}
	</span>`;
}
