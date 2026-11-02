"use client";

import { useEffect, useRef, useState } from "react";
import type { Timer } from "@/lib/game";
import { play, soundOn } from "@/lib/sound";
import { useT } from "./Locale";
import { serverNow } from "./useRoom";

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The countdown above the card, the same on every phone: each counts to the server's end time
 * on the server's clock (useRoom's serverNow). It updates on each whole second and the bar
 * shrinks linearly on the compositor. Sound plays on the host's phone only.
 */
export function TimerBar({ timer, host }: { timer: Timer; host: boolean }) {
  const t = useT();
  const { ends_at: ends, started_at: started, minutes } = timer;
  const total = ends !== null && started !== null ? ends - started : minutes * 60_000;
  // now: the server's clock at the last tick; skew: server minus this phone (for the test hook).
  const [tick, setTick] = useState(() => ({ now: serverNow(), skew: serverNow() - Date.now() }));
  const bar = useRef<HTMLSpanElement>(null);
  const lastSecond = useRef<number | null>(null);

  useEffect(() => {
    if (ends === null) {
      lastSecond.current = null;
      return;
    }
    let id: ReturnType<typeof setTimeout>;
    const step = () => {
      const now = serverNow();
      const left = ends - now;
      const second = Math.max(0, Math.ceil(left / 1000));
      // A tick for 5..1, the chime at 0; only when seen counting down (not after a reload at 0).
      const prev = lastSecond.current;
      if (host && prev !== null && second < prev && soundOn()) {
        if (second === 0) play("chime");
        else if (second <= 5) play("tick");
      }
      lastSecond.current = second;
      setTick({ now, skew: now - Date.now() });
      // Wake just after the next whole second.
      if (left > 0) id = setTimeout(step, (left % 1000 || 1000) + 15);
    };
    id = setTimeout(step, 0);
    return () => clearTimeout(id);
  }, [ends, host]);

  useEffect(() => {
    const el = bar.current;
    if (!el || ends === null) return;
    const left = Math.max(0, ends - serverNow());
    const from = total > 0 ? Math.min(1, left / total) : 0;
    const anim = el.animate([{ transform: `scaleX(${from})` }, { transform: "scaleX(0)" }], { duration: left, easing: "linear", fill: "forwards" });
    return () => anim.cancel();
  }, [ends, total]);

  if (minutes === 0) return null;
  const left = ends === null ? total : Math.max(0, ends - tick.now);
  const state = ends === null ? "idle" : left > 0 ? "running" : "up";
  return (
    <div className="timer" data-state={state} data-testid="timer" data-ends-local={ends === null ? undefined : ends - tick.skew}>
      <span className="timer-track" aria-hidden>
        <span ref={bar} className="timer-fill" />
      </span>
      <span role="timer" aria-label={t("timer.label")} className="timer-text" data-testid="timer-text">
        {state === "up" ? t("timer.up") : clock(left)}
      </span>
      <span className="sr-only" aria-live="polite">
        {state === "up" ? t("timer.up") : ""}
      </span>
    </div>
  );
}
