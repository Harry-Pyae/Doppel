"use client";

import { useEffect, useState } from "react";
import { art } from "@/lib/art";
import { character, type Character, type MyState, type Reveal } from "@/lib/game";
import { unlockSound } from "@/lib/sound";
import type { Act, Notify } from "./App";
import { Confirm } from "./Confirm";
import { useT } from "./Locale";
import { LeaveButton } from "./Room";
import { TimerBar } from "./Timer";

type InRoom = Extract<MyState, { status: "in_room" }>;
type Ask = "reveal" | "restart" | "end";

const ASK = {
  reveal: { title: "round.revealTitle", body: undefined, ok: "round.revealOk", fn: "reveal" },
  restart: { title: "round.restartTitle", body: "round.restartBody", ok: undefined, fn: "restart_round" },
  end: { title: "round.endTitle", body: "round.endBody", ok: undefined, fn: "end_room" },
} as const;

export function Round({ state, act, notify }: { state: InRoom; act: Act; notify: Notify }) {
  const t = useT();
  const { room, card } = state;
  const { timer, reveal } = room;
  const [asking, setAsking] = useState<Ask | null>(null);
  // Which overlay was last asked for, so its text stays while it closes.
  const [last, setLast] = useState<Ask>("restart");
  const [busy, setBusy] = useState(false);

  async function run(fn: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setAsking(null);
    const failed = await act(fn, { p_room: room.id, ...args });
    if (failed && fn !== "end_room") notify(failed);
    setBusy(false);
  }
  function runTimer(action: "start" | "add" | "stop") {
    // The host's tap is what lets the browser play the timer's sound.
    if (action !== "stop") unlockSound();
    return run("timer", { p_action: action });
  }
  const ask = (which: Ask) => {
    setLast(which);
    setAsking(which);
  };
  const asked = ASK[last];

  return (
    <div className="screen" data-screen="round">
      <p className="pt-2 text-center text-xs font-bold tracking-[0.14em] text-muted uppercase">{t("round.label", { n: room.round })}</p>
      {reveal ? (
        <RevealView reveal={reveal} />
      ) : (
        <>
          <TimerBar timer={timer} host={room.host} />
          {card && <Card character={card.character} />}
        </>
      )}

      <div className="round-actions mt-auto flex flex-col gap-2 pt-2">
        {room.host && !reveal && timer.minutes > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {timer.ends_at === null ? (
              <button className="btn btn-quiet col-span-2" disabled={busy} onClick={() => runTimer("start")}>
                {t("timer.start")}
              </button>
            ) : (
              <>
                <button className="btn btn-quiet" disabled={busy} onClick={() => runTimer("add")}>
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
          <div className={`grid gap-2 ${reveal ? "grid-cols-2" : "grid-cols-3"}`}>
            {!reveal && (
              <button className="btn px-2" disabled={busy} onClick={() => ask("reveal")}>
                {t("round.reveal")}
              </button>
            )}
            <button className="btn btn-quiet px-2" disabled={busy} onClick={() => ask("restart")}>
              {t("round.restart")}
            </button>
            <button className="btn btn-quiet px-2 text-brick" disabled={busy} onClick={() => ask("end")}>
              {t("round.end")}
            </button>
          </div>
        ) : (
          <p className="py-3 text-center font-bold text-muted">{t("round.waitHost")}</p>
        )}
      </div>

      <Confirm
        open={asking !== null}
        title={t(asked.title)}
        body={asked.body && t(asked.body)}
        confirmLabel={asked.ok && t(asked.ok)}
        danger={last === "end"}
        busy={busy}
        onCancel={() => setAsking(null)}
        onConfirm={() => run(asked.fn)}
      />
    </div>
  );
}

/** Joined during a round: plays from the next one. */
export function Queued({ act }: { act: Act }) {
  const t = useT();
  return (
    <div className="screen" data-screen="queued">
      <section className="panel mt-8 flex flex-col items-center gap-2 p-6 text-center">
        <span className="dot animate-pulse" aria-hidden />
        <p className="font-display text-xl font-bold text-balance" data-testid="queued">
          {t("round.queued")}
        </p>
      </section>
      <div className="mt-auto">
        <LeaveButton act={act} />
      </div>
    </div>
  );
}

/** After the host's reveal, on every phone: who it was, and both characters side by side. */
function RevealView({ reveal }: { reveal: Reveal }) {
  const t = useT();
  const sides = [
    ["group", reveal.group, "reveal.group"],
    ["doppel", reveal.doppel, "reveal.doppel"],
  ] as const;
  return (
    <section className="flex flex-col gap-4" data-testid="reveal">
      <h2 className="reveal-title font-display text-center text-[1.75rem] leading-tight font-bold text-balance" aria-live="polite" data-testid="reveal-title">
        {t("reveal.title", { name: reveal.name })}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {sides.map(([side, id, label]) => (
          <figure key={side} className="reveal-side flex flex-col items-center gap-2" data-testid={`reveal-${side}`}>
            <div className="card-shape w-full" style={shape}>
              <CardFace c={character(id)} />
            </div>
            <figcaption className="text-center text-sm font-bold text-muted">{t(label)}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

const CARD_ART = "/art/card.webp";
const layout = art.card;
// The card art's own shape: its proportions and corner radius (data/card-layout.json).
const shape = layout ? { aspectRatio: layout.aspect, borderRadius: `${layout.radius}% / ${layout.radius * layout.aspect}%` } : undefined;
const box = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` });

/** A character's face: the picture (or placeholder) and the name, laid out the same for everyone. */
function CardFace({ c }: { c: Character }) {
  const picture = c.image ? <img src={c.image} alt="" className="size-full object-cover" draggable={false} /> : <Placeholder name={c.name} />;
  const name = (
    <span className="card-name" data-testid="card-name">
      {c.name}
    </span>
  );
  return layout ? (
    // The card art: the picture in its window, the name on its nameplate.
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
  );
}

/**
 * Hidden until held: the face shows only while a finger or the mouse is down (or Space/Enter
 * is held), and hides at once on release, when the pointer is lost, and when the app goes to
 * the background. Every player's card is the same in every way but the character on it:
 * nobody, not even the doppel, can tell from it who the doppel is.
 */
function Card({ character: id }: { character: string }) {
  const t = useT();
  const c = character(id);
  const [held, setHeld] = useState(false);

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
  }, [c.image]);

  const show = () => {
    setHeld(true);
    navigator.vibrate?.(8);
  };
  const hide = () => setHeld(false);

  return (
    <button
      type="button"
      className="card card-shape"
      data-testid="card"
      style={shape}
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
      {held ? (
        <CardFace c={c} />
      ) : (
        <span className="card-back">
          <HoldGlyph />
          <span className="font-display text-2xl font-bold">{t("round.hold")}</span>
          <span className="text-sm opacity-85">{t("round.holdHint")}</span>
        </span>
      )}
    </button>
  );
}

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
