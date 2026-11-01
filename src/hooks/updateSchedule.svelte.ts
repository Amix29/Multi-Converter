export function createUpdateSchedule(options: {
  active: boolean;
  lastCheckedAt: number;
  canCheck(): boolean;
  check(): Promise<void>;
}) {
  $effect(() => {
    if (!options.active) return;
    const poll = () => {
      if (
        Date.now() - options.lastCheckedAt >= 6 * 60 * 60 * 1000 &&
        options.canCheck()
      )
        void options.check();
    };
    const resume = () => {
      if (
        document.visibilityState !== "hidden" &&
        Date.now() - options.lastCheckedAt >= 2 * 60 * 60 * 1000 &&
        options.canCheck()
      )
        void options.check();
    };
    const interval = window.setInterval(poll, 30 * 60 * 1000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  });
}
