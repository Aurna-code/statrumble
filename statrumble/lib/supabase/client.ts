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

function getAuthEndpoint(input: RequestInfo | URL) {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.pathname.startsWith("/auth/v1/")) {
      return parsedUrl.pathname;
    }
  } catch {
    return null;
  }

  return null;
}

async function authEndpointLoggingFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const endpoint = getAuthEndpoint(response.url) ?? getAuthEndpoint(input);

  if (endpoint) {
    console.info("[Supabase Auth Response]", {
      endpoint,
      status: response.status,
      ok: response.ok,
    });
  }

  return response;
}

export function createClient() {
  if (client) {
    return client;
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: authEndpointLoggingFetch,
    },
  });

  return client;
}
