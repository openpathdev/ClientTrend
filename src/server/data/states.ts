import type { SupabaseClient } from "@supabase/supabase-js";
import type { StateRef } from "./types";

type StateRow = { code: string; name: string; sort_order: number };

export async function listStates(supabase: SupabaseClient): Promise<StateRef[]> {
	const { data, error } = await supabase
		.from("states")
		.select("code, name, sort_order")
		.order("sort_order", { ascending: true });
	if (error) throw new Error(error.message);
	return (data as StateRow[]).map((s) => ({ code: s.code, name: s.name, sortOrder: s.sort_order }));
}
