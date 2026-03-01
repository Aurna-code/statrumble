export function getRuntimeDemoMode(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return document.documentElement.dataset.demoMode === "1";
}
