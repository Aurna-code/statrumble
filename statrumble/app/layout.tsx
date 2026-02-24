import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import HeaderNavLinks from "@/app/components/HeaderNavLinks";
import WorkspaceSwitcher from "@/app/components/WorkspaceSwitcher";
import { getActiveWorkspaceSelection } from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StatRumble",
  description: "StatRumble MVP scaffolding",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let workspaceSelection = {
    workspaces: [],
    activeWorkspaceId: null,
  } as Awaited<ReturnType<typeof getActiveWorkspaceSelection>>;

  if (user) {
    try {
      workspaceSelection = await getActiveWorkspaceSelection();
    } catch {
      workspaceSelection = {
        workspaces: [],
        activeWorkspaceId: null,
      };
    }
  }

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-zinc-50 text-zinc-900">
          <header className="border-b border-zinc-200 bg-white">
            <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 text-sm md:px-8">
              <HeaderNavLinks />
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
          {children}
        </div>
      </body>
    </html>
  );
}
