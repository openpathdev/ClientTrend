import { describe, expect, it } from "vitest";
import type { SyncRun } from "../data/hubspotSyncLog";
import { renderHubspotSyncStatus, timeAgo } from "./hubspotSyncStatus";

const NOW = new Date("2026-11-04T16:00:00Z");

function run(overrides: Partial<SyncRun>): SyncRun {
	return {
		id: "8235d4c5-8164-49e0-90c9-7649366b63ef",
		startedAt: "2026-11-04T15:58:00Z",
		finishedAt: "2026-11-04T15:59:00Z",
		status: "succeeded",
		clientsProcessed: 46,
		clientsFailed: 0,
		errorSummary: null,
		...overrides,
	};
}

async function render(opts: Parameters<typeof renderHubspotSyncStatus>[0]) {
	return (await renderHubspotSyncStatus({ now: NOW, ...opts })).toString().replace(/\s+/g, " ").replace(/&#39;/g, "'");
}

describe("timeAgo", () => {
	it("reads as relative time", () => {
		expect(timeAgo("2026-11-04T15:59:30Z", NOW)).toBe("just now");
		expect(timeAgo("2026-11-04T15:55:00Z", NOW)).toBe("5 min ago");
		expect(timeAgo("2026-11-04T13:00:00Z", NOW)).toBe("3 hr ago");
		expect(timeAgo("2026-11-03T12:00:00Z", NOW)).toBe("yesterday");
		expect(timeAgo("2026-10-31T12:00:00Z", NOW)).toBe("4 days ago");
	});

	it("treats a timestamp slightly in the future (clock skew) as just now", () => {
		expect(timeAgo("2026-11-04T16:00:05Z", NOW)).toBe("just now");
	});
});

describe("renderHubspotSyncStatus", () => {
	it("polls while a run is in progress", async () => {
		const out = await render({ run: run({ status: "running", finishedAt: null, clientsProcessed: 10 }) });
		expect(out).toContain("Syncing HubSpot… 10 clients so far");
		expect(out).toContain('hx-trigger="every 3s"');
		expect(out).toContain("live=1");
	});

	it("announces a finish the page watched", async () => {
		const out = await render({ run: run({}), live: true });
		expect(out).toContain("Sync finished — 46 clients updated.");
		expect(out).not.toContain("hx-trigger");
	});

	it("shows the last result on page load", async () => {
		expect(await render({ run: run({}) })).toContain("Last synced 1 min ago · 46 clients.");
	});

	it("names clients that couldn't sync", async () => {
		const out = await render({ run: run({ status: "partial", clientsProcessed: 44, clientsFailed: 2 }), problemClients: ["Adira", "Hope Clinic"], live: true });
		expect(out).toContain("Sync finished with problems — 44 updated, 2 couldn't sync.");
		expect(out).toContain("Couldn't sync: Adira, Hope Clinic");
	});

	it("shows a failed run's error", async () => {
		const out = await render({ run: run({ status: "failed", errorSummary: "HubSpot 401" }) });
		expect(out).toContain("Last sync failed 1 min ago.");
		expect(out).toContain("HubSpot 401");
	});

	it("reports a run that died part-way instead of polling forever", async () => {
		const out = await render({ run: run({ status: "running", startedAt: "2026-11-04T15:30:00Z", finishedAt: null }) });
		expect(out).toContain("Last sync stopped before finishing (started 30 min ago). Try again.");
		expect(out).not.toContain("every 3s");
	});
});
