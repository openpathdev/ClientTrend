import type { SupabaseClient } from "@supabase/supabase-js";

export async function createSyncRun(supabase: SupabaseClient): Promise<string> {
	const { data, error } = await supabase.from("hubspot_sync_runs").insert({}).select("id").single();
	if (error) throw new Error(error.message);
	return (data as { id: string }).id;
}

export async function finishSyncRun(
	supabase: SupabaseClient,
	runId: string,
	input: { status: "succeeded" | "failed" | "partial"; clientsProcessed: number; clientsFailed: number; errorSummary?: string },
): Promise<void> {
	const { error } = await supabase
		.from("hubspot_sync_runs")
		.update({
			finished_at: new Date().toISOString(),
			status: input.status,
			clients_processed: input.clientsProcessed,
			clients_failed: input.clientsFailed,
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
