import type { SupabaseClient } from "@supabase/supabase-js";

export async function createSyncRun(supabase: SupabaseClient): Promise<string> {
	const { data, error } = await supabase.from("hubspot_sync_runs").insert({}).select("id").single();
	if (error) throw new Error(error.message);
	return (data as { id: string }).id;
}

/** Adds this batch's counts to the run's running total — batches are processed as separate Worker invocations (see runHubspotSync's cursor/self-chaining), so counts accumulate across calls rather than being set once. */
export async function incrementSyncRunCounts(supabase: SupabaseClient, runId: string, processedDelta: number, failedDelta: number): Promise<{ clientsProcessed: number; clientsFailed: number }> {
	const { data, error } = await supabase.from("hubspot_sync_runs").select("clients_processed, clients_failed").eq("id", runId).single();
	if (error) throw new Error(error.message);
	const current = data as { clients_processed: number; clients_failed: number };
	const clientsProcessed = current.clients_processed + processedDelta;
	const clientsFailed = current.clients_failed + failedDelta;
	const { error: updateError } = await supabase
		.from("hubspot_sync_runs")
		.update({ clients_processed: clientsProcessed, clients_failed: clientsFailed })
		.eq("id", runId);
	if (updateError) throw new Error(updateError.message);
	return { clientsProcessed, clientsFailed };
}

export async function finishSyncRun(
	supabase: SupabaseClient,
	runId: string,
	input: { status: "succeeded" | "failed" | "partial"; errorSummary?: string },
): Promise<void> {
	const { error } = await supabase
		.from("hubspot_sync_runs")
		.update({
			finished_at: new Date().toISOString(),
			status: input.status,
			error_summary: input.errorSummary ?? null,
		})
		.eq("id", runId);
	if (error) throw new Error(error.message);
}

export async function logSyncResult(
	supabase: SupabaseClient,
	runId: string,
	clientId: string,
	status: "synced" | "error" | "unmatched",
	detail?: string,
): Promise<void> {
	const { error } = await supabase.from("hubspot_sync_log").insert({
		sync_run_id: runId,
		client_id: clientId,
		status,
		detail: detail ?? null,
	});
	if (error) throw new Error(error.message);
}

export type SyncRun = {
	id: string;
	startedAt: string;
	finishedAt: string | null;
	status: "running" | "succeeded" | "failed" | "partial";
	clientsProcessed: number;
	clientsFailed: number;
	errorSummary: string | null;
};

type SyncRunRow = {
	id: string;
	started_at: string;
	finished_at: string | null;
	status: SyncRun["status"];
	clients_processed: number;
	clients_failed: number;
	error_summary: string | null;
};

const SYNC_RUN_SELECT = "id, started_at, finished_at, status, clients_processed, clients_failed, error_summary";

function mapSyncRun(row: SyncRunRow): SyncRun {
	return {
		id: row.id,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		status: row.status,
		clientsProcessed: row.clients_processed,
		clientsFailed: row.clients_failed,
		errorSummary: row.error_summary,
	};
}

export async function getSyncRun(supabase: SupabaseClient, runId: string): Promise<SyncRun | null> {
	const { data, error } = await supabase.from("hubspot_sync_runs").select(SYNC_RUN_SELECT).eq("id", runId).maybeSingle();
	if (error) throw new Error(error.message);
	return data ? mapSyncRun(data as SyncRunRow) : null;
}

export async function getLatestSyncRun(supabase: SupabaseClient): Promise<SyncRun | null> {
	const { data, error } = await supabase.from("hubspot_sync_runs").select(SYNC_RUN_SELECT).order("started_at", { ascending: false }).limit(1).maybeSingle();
	if (error) throw new Error(error.message);
	return data ? mapSyncRun(data as SyncRunRow) : null;
}

/** Names of the clients a run couldn't sync (up to `limit`), for the finished message. */
export async function listSyncRunProblemClients(supabase: SupabaseClient, runId: string, limit = 5): Promise<string[]> {
	const { data, error } = await supabase
		.from("hubspot_sync_log")
		.select("status, client:clients ( name )")
		.eq("sync_run_id", runId)
		.in("status", ["error", "unmatched"])
		.order("created_at", { ascending: true })
		.limit(limit);
	if (error) throw new Error(error.message);
	return (data as unknown as { client: { name: string } | null }[]).map((r) => r.client?.name ?? "Unknown client");
}
