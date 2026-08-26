import type { SupabaseClient } from "@supabase/supabase-js";
import type { Csm } from "./types";

type CsmRow = { id: string; name: string; email: string | null; active: boolean };

export async function listCsms(supabase: SupabaseClient): Promise<Csm[]> {
	const { data, error } = await supabase
		.from("csms")
		.select("id, name, email, active")
		.eq("active", true)
		.order("name", { ascending: true });
	if (error) throw error;
	return data as CsmRow[];
}
