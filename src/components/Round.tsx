"use client";

import { useEffect, useState } from "react";
import { art } from "@/lib/art";
import { character, type MyState } from "@/lib/game";
import { unlockSound } from "@/lib/sound";
import type { Act, Notify } from "./App";
import { Confirm } from "./Confirm";
import { useT } from "./Locale";
import { LeaveButton } from "./Room";
import { TimerBar } from "./Timer";

type InRoom = Extract<MyState, { status: "in_room" }>;

export function Round({ state, act, notify }: { state: InRoom; act: Act; notify: Notify }) {
  const t = useT();
  const { room, card } = state;
  const { timer } = room;
  const [asking, setAsking] = useState<"restart" | "end" | null>(null);
  // Which overlay was last asked for, so its text stays while it closes.
  const [last, setLast] = useState<"restart" | "end">("restart");
  const [busy, setBusy] = useState(false);

  async function run(fn: "restart_round" | "end_room") {
    setBusy(true);
    setAsking(null);
    const failed = await act(fn, { p_room: room.id });
    if (failed && fn === "restart_round") notify(failed);
    setBusy(false);
  }
  async function runTimer(action: "start" | "add" | "stop") {
    // The host's tap is what lets the browser play the timer's sound.
    if (action !== "stop") unlockSound();
    setBusy(true);
    const failed = await act("timer", { p_room: room.id, p_action: action });
    if (failed) notify(failed);
    setBusy(false);
  }
  const ask = (which: "restart" | "end") => {
    setLast(which);
    setAsking(which);
  };

  return (
    <>
      <p className="pt-2 text-center text-xs font-bold tracking-[0.14em] text-muted uppercase">{t("round.label", { n: room.round })}</p>
      <TimerBar timer={timer} host={room.host} />
      {card && <Card character={card.character} imposter={card.imposter} />}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {room.host && timer.minutes > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {timer.ends_at === null ? (
              <button className="btn col-span-2" disabled={busy} onClick={() => runTimer("start")}>
                {t("timer.start")}
              </button>
            ) : (
              <>
                <button className="btn" disabled={busy} onClick={() => runTimer("add")}>
                  {t("timer.add")}
                </button>
                <button className="btn btn-quiet" disabled={busy} onClick={() => runTimer("stop")}>
                  {t("timer.stop")}
                </button>
              </>
            )}
          </div>
        )}
        {room.host ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-quiet" disabled={busy} onClick={() => ask("restart")}>
              {t("round.restart")}
            </button>
            <button className="btn btn-quiet text-brick" disabled={busy} onClick={() => ask("end")}>
              {t("round.end")}
            </button>
          </div>
        ) : (
          <p className="py-3 text-center font-bold text-muted">{t("round.waitHost")}</p>
        )}
      </div>

      <Confirm
        open={asking !== null}
        title={t(last === "restart" ? "round.restartTitle" : "round.endTitle")}
        body={t(last === "restart" ? "round.restartBody" : "round.endBody")}
        danger={last === "end"}
        busy={busy}
        onCancel={() => setAsking(null)}
        onConfirm={() => run(last === "restart" ? "restart_round" : "end_room")}
      />
    </>
  );
}

/** Joined during a round: plays from the next one. */
export function Queued({ act }: { act: Act }) {
  const t = useT();
  return (
    <>
      <section className="panel mt-8 flex flex-col items-center gap-2 p-6 text-center">
        <span className="dot animate-pulse" aria-hidden />
        <p className="font-display text-xl font-bold text-balance" data-testid="queued">
          {t("round.queued")}
        </p>
      </section>
      <div className="mt-auto">
        <LeaveButton act={act} />
      </div>
    </>
  );
}

/**
 * Hidden until held: the face shows only while a finger or the mouse is down (or Space/Enter
 * is held), and hides at once on release, when the pointer is lost, and when the app goes to
 * the background. Both faces have the same layout, so the imposter's card looks no different
 * from across the table.
 */
function Card({ character: id, imposter }: { character: string; imposter: boolean }) {
  const t = useT();
  const c = character(id);
  const [held, setHeld] = useState(false);
  const layout = art.card;

  useEffect(() => {
    const hide = () => setHeld(false);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
    };
  }, []);

  // Warm the images so they are there the moment the card is pressed.
  useEffect(() => {
    if (c.image) new Image().src = c.image;
    if (layout) new Image().src = CARD_ART;
  }, [c.image, layout]);

  const show = () => {
    setHeld(true);
    navigator.vibrate?.(8);
  };
  const hide = () => setHeld(false);

  const picture = (
    <>
      {c.image ? <img src={c.image} alt="" className="size-full object-cover" draggable={false} /> : <Placeholder name={c.name} />}
      {imposter && (
        <span className="stamp" data-testid="imposter">
          {t("round.imposter")}
        </span>
      )}
    </>
  );
  const name = (
    <span className="card-name" data-testid="card-name">
      {c.name}
    </span>
  );

  return (
    <button
      type="button"
      className="card"
      data-testid="card"
      // The card art's own shape: its proportions and corner radius (data/card-layout.json).
      style={layout ? { aspectRatio: layout.aspect, borderRadius: `${layout.radius}% / ${layout.radius * layout.aspect}%` } : undefined}
      aria-label={held ? undefined : t("round.cardLabel")}
      onPointerDown={(e) => {
        if (!e.isPrimary) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        show();
      }}
      onPointerUp={hide}
      onPointerCancel={hide}
      onLostPointerCapture={hide}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          show();
        }
      }}
      onKeyUp={hide}
      onBlur={hide}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!held ? (
        <span className="card-back">
          <HoldGlyph />
          <span className="font-display text-2xl font-bold">{t("round.hold")}</span>
          <span className="text-sm opacity-85">{t("round.holdHint")}</span>
        </span>
      ) : layout ? (
        // The same card art for everyone: the picture in its window, the name on its nameplate.
        <span className="card-face card-art" data-testid="card-face">
          <img src={CARD_ART} alt="" className="absolute inset-0 size-full" draggable={false} />
          <span className="absolute overflow-hidden" style={box(layout.window)}>
            {picture}
          </span>
          <span className="card-plate" style={box(layout.nameplate)}>
            {name}
          </span>
        </span>
      ) : (
        <span className="card-face" data-testid="card-face">
          <span className="relative block aspect-square w-full overflow-hidden rounded-md">{picture}</span>
          <span className="flex flex-1 flex-col items-center justify-center text-center">{name}</span>
        </span>
      )}
    </button>
  );
}

const CARD_ART = "/art/card.webp";
const box = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` });

/** The one matte placeholder: a silhouette carrying the character's initial. */
function Placeholder({ name }: { name: string }) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? "?";
  return (
    <svg viewBox="0 0 100 100" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="100" height="100" fill="#e2d5b6" />
      <circle cx="50" cy="47" r="15" fill="#a3ae93" />
      <path d="M16 100c0-18 15-31 34-31s34 13 34 31z" fill="#a3ae93" />
      <text x="50" y="93" textAnchor="middle" fontSize="20" fontWeight="700" fill="#f6f1e3" style={{ fontFamily: "var(--font-display)" }}>
        {initial}
      </text>
    </svg>
  );
}

function HoldGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="size-14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <circle cx="24" cy="24" r="9" />
      <circle cx="24" cy="24" r="17" opacity="0.45" />
    </svg>
  );
}
