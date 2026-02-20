import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-zinc-50 text-zinc-900">
          <header className="border-b border-zinc-200 bg-white">
            <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 text-sm md:px-8">
              <Link href="/" className="font-semibold">
                StatRumble
              </Link>
              <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
                Login
              </Link>
              <Link href="/decisions" className="text-zinc-600 hover:text-zinc-900">
                Decisions
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
