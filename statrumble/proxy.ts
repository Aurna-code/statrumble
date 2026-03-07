import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseEnvStatus,
  readSupabaseEnvSource,
  requireSupabaseEnv,
} from "@/lib/supabase/env";

const EXCLUDED_PREFIXES = ["/_next", "/favicon.ico"];
const EXCLUDED_PATHS = new Set(["/auth/callback", "/healthz"]);

const PUBLIC_PATHS = new Set(["/portal", "/p", "/setup"]);
const PUBLIC_PREFIXES = ["/portal/", "/p/"];

function isExcludedPath(pathname: string) {
  if (EXCLUDED_PATHS.has(pathname)) {
    return true;
  }

  return EXCLUDED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isExcludedPath(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseEnv = getSupabaseEnvStatus(readSupabaseEnvSource(), "request auth");

  if (!supabaseEnv.ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: supabaseEnv.message,
          missing: supabaseEnv.missing,
          invalid: supabaseEnv.invalid,
        },
        {
          status: 503,
        },
      );
    }

    return NextResponse.next();
  }

  const { supabaseUrl, supabaseAnonKey } = requireSupabaseEnv("request auth");
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && pathname !== "/login") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
