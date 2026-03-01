"use client";

import { getRuntimeDemoMode } from "@/lib/runtimeMode";

type ModeBannerProps = {
  initialDemoMode: boolean;
};

export default function ModeBanner({ initialDemoMode }: ModeBannerProps) {
  const demoMode = getRuntimeDemoMode() || initialDemoMode;

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-700 md:px-8">
      <p className="mx-auto w-full max-w-6xl">
        {demoMode
          ? "Demo mode: no API calls. Full collaboration flow works without keys."
          : "API mode: actions may incur costs."}
      </p>
    </div>
  );
}
