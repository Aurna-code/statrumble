export function isDemoMode(): boolean {
  const demoEnv = process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";
  const hasKey = Boolean(process.env.OPENAI_API_KEY);

  return demoEnv || !hasKey;
}
