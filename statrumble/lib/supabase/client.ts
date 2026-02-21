"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | undefined;

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createClient() {
  if (client) {
    return client;
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  client = createBrowserClient(supabaseUrl, supabaseAnonKey);

  return client;
}
