"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  assertSupabaseEnv();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
