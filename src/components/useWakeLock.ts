"use client";

import { useEffect } from "react";

/** Keeps the screen on while `on` (in a room: game room and round), via the Wake Lock API; skipped where unsupported. */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const take = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!alive) lock.release();
      } catch {
        // Refused (battery saver, iframe): the screen may sleep.
      }
    };
    take();
    // The browser drops the lock when the tab is hidden; take it again on return.
    document.addEventListener("visibilitychange", take);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
