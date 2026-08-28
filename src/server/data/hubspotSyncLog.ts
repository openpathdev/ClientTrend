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
