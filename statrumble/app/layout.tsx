import type { Metadata } from "next";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import HeaderNavLinks from "@/app/components/HeaderNavLinks";
import ModeBanner from "@/app/components/ModeBanner";
import SetupDiagnosticsPanel from "@/app/components/SetupDiagnosticsPanel";
import WorkspaceSwitcher from "@/app/components/WorkspaceSwitcher";
import { getActiveWorkspaceSelection } from "@/lib/db/workspaces";
import { isDemoMode } from "@/lib/demoMode";
import { getSupabaseEnvStatus, readSupabaseEnvSource } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "StatRumble",
  description: "Debate and decide with metric snapshots.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const demoMode = isDemoMode();
  const supabaseEnv = getSupabaseEnvStatus(readSupabaseEnvSource(), "app startup");
  let user: User | null = null;
  let workspaceSelection = {
    workspaces: [],
    activeWorkspaceId: null,
  } as Awaited<ReturnType<typeof getActiveWorkspaceSelection>>;

  if (supabaseEnv.ok) {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  }

  if (user && supabaseEnv.ok) {
    try {
      workspaceSelection = await getActiveWorkspaceSelection();
    } catch {
      workspaceSelection = {
        workspaces: [],
        activeWorkspaceId: null,
      };
    }
  }

  const showJoin = Boolean(user) && workspaceSelection.workspaces.length === 0 && !workspaceSelection.activeWorkspaceId;

  return (
    <html lang="en" data-demo-mode={demoMode ? "1" : "0"}>
      <body className="antialiased font-sans">
        <div className="min-h-screen bg-zinc-50 text-zinc-900">
          <header className="border-b border-zinc-200 bg-white">
            <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 text-sm md:px-8">
              <HeaderNavLinks isAuthenticated={Boolean(user)} showJoin={showJoin} />
              <div className="ml-auto flex items-center gap-3">
                {workspaceSelection.activeWorkspaceId ? (
                  <WorkspaceSwitcher
                    workspaces={workspaceSelection.workspaces}
                    activeWorkspaceId={workspaceSelection.activeWorkspaceId}
                  />
                ) : null}
                {user?.email ? <p className="text-zinc-500">{user.email}</p> : null}
                {user ? (
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="text-zinc-600 hover:text-zinc-900"
                      aria-label="Sign out"
                    >
                      Logout
                    </button>
                  </form>
                ) : (
                  <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
                    Login
                  </Link>
                )}
              </div>
            </nav>
          </header>
          <ModeBanner initialDemoMode={demoMode} />
          {!supabaseEnv.ok ? (
            <div className="border-b border-amber-200 bg-amber-50">
              <div className="mx-auto w-full max-w-6xl px-4 py-4 md:px-8">
                <SetupDiagnosticsPanel
                  status={supabaseEnv}
                  title="Supabase setup required"
                  description="StatRumble started, but Supabase-backed auth and data flows are unavailable until the required environment variables are configured."
                />
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </body>
    </html>
  );
}
