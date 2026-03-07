"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/supabase/env";

let client: ReturnType<typeof createBrowserClient> | undefined;

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

  const { supabaseUrl, supabaseAnonKey } = requireSupabaseEnv("browser auth client");
  client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: authEndpointLoggingFetch,
    },
  });

  return client;
}
