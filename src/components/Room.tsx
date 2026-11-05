"use client";

import { useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, TIMER_MINUTES, type MyState, type Player } from "@/lib/game";
import { setSoundOn, soundOn } from "@/lib/sound";
import type { Act, Notify } from "./App";
import { Confirm } from "./Confirm";
import { useT } from "./Locale";

type InRoom = Extract<MyState, { status: "in_room" }>;

/** The game room: the code, the players, and (for the host) Remove and Start. */
export function Room({ state, act, notify }: { state: InRoom; act: Act; notify: Notify }) {
  const t = useT();
  const { room, players, me } = state;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The last player asked about stays named while the overlay closes.
  const [target, setTarget] = useState<Player | null>(null);
  const [asking, setAsking] = useState(false);
  const missing = Math.max(0, MIN_PLAYERS - players.length);

  async function run(fn: string, args?: Record<string, unknown>) {
    setBusy(true);
    const failed = await act(fn, args);
    if (failed) notify(failed);
    setBusy(false);
  }

  // No clipboard (plain http, an old browser) or no permission: say how to copy it by hand.
  function copy() {
    const done = (ok: boolean) => {
      setCopied(ok);
      setCopyFailed(!ok);
      if (ok) setTimeout(() => setCopied(false), 1600);
    };
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(room.code).then(
      () => done(true),
      () => done(false),
    );
  }

  return (
    <div className="screen" data-screen="room">
      <section className="area-code panel flex flex-col items-center gap-2 px-5 pt-5 pb-4 text-center">
        <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">{t("room.code")}</p>
        <p className="tracked font-display pl-[0.2em] text-[3.25rem] leading-none font-bold tracking-[0.2em] tabular-nums select-all" data-testid="room-code">
          {room.code}
        </p>
        <button className="btn btn-quiet btn-small mt-1 min-w-36" onClick={copy}>
          {copied ? t("room.copied") : t("room.copy")}
        </button>
        {copyFailed && (
          <p role="status" className="text-sm font-bold text-muted" data-testid="copy-failed">
            {t("room.copyFailed")}
          </p>
        )}
      </section>

      <section className="area-players panel p-5">
        <h2 className="flex items-baseline justify-between">
          <span className="font-display text-xl font-bold">{t("room.players")}</span>
          <span className="text-sm font-bold text-muted tabular-nums">
            {players.length}/{MAX_PLAYERS}
          </span>
        </h2>
        <ul className="mt-2 flex flex-col" data-testid="players">
          {players.map((p) => (
            <li key={p.id} className="flex min-h-13 items-center gap-3 border-t border-line/50 first:border-t-0" data-testid="player">
              <span className="dot" data-on={p.connected} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold" data-testid="player-name">
                  {p.name}
                </span>
                {p.id === me.id && <span className="text-muted"> ({t("room.you")})</span>}
                <span className="sr-only">, {p.connected ? t("room.connected") : t("room.away")}</span>
              </span>
              {p.host && <span className="rounded-full bg-sage px-2.5 py-0.5 text-xs font-bold text-on-sage">{t("room.host")}</span>}
              {room.host && p.id !== me.id && (
                <button
                  className="btn btn-quiet btn-small -mr-2 border-transparent text-brick"
                  aria-label={`${t("room.remove")} ${p.name}`}
                  onClick={() => {
                    setTarget(p);
                    setAsking(true);
                  }}
                >
                  {t("room.remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <TimerSetting room={room} busy={busy} run={run} />

      <div className="area-actions mt-auto flex flex-col gap-2 pt-2">
        {room.host ? (
          <>
            <button className="btn w-full" disabled={busy || missing > 0} onClick={() => run("start_round", { p_room: room.id })}>
              {t("room.start")}
            </button>
            {missing > 0 && <p className="text-center text-sm text-muted">{t("room.needMore", { n: missing })}</p>}
          </>
        ) : (
          <p className="py-3 text-center font-bold text-muted">{t("room.waitHost")}</p>
        )}
        <LeaveButton act={act} />
      </div>

      <Confirm
        open={asking}
        title={t("room.removeTitle", { name: target?.name ?? "" })}
        body={t("room.removeBody")}
        danger
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          if (target) await run("remove_player", { p_room: room.id, p_user: target.id });
        }}
      />
    </div>
  );
}

/** The round timer's length: the host picks it, everyone sees it. */
function TimerSetting({ room, busy, run }: { room: InRoom["room"]; busy: boolean; run: (fn: string, args?: Record<string, unknown>) => void }) {
  const t = useT();
  const label = (m: number) => (m === 0 ? t("timer.off") : t("timer.minutes", { n: m }));
  // Remembered on this device; read once (this screen only renders in the browser).
  const [sound, setSound] = useState(soundOn);
  const minutes = room.timer.minutes;
  return (
    <section className="area-timer panel px-5 py-4" data-testid="timer-setting">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
        <h2 className="font-display text-xl font-bold" id="timer-label">
          {t("timer.label")}
        </h2>
        {!room.host ? (
          <span className="font-bold" data-testid="timer-minutes">
            {label(minutes)}
          </span>
        ) : (
          minutes > 0 && (
            <label className="flex items-center gap-2.5 text-sm font-bold text-muted">
              {t("timer.sound")}
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={sound}
                onChange={(e) => {
                  setSound(e.target.checked);
                  setSoundOn(e.target.checked);
                }}
              />
            </label>
          )
        )}
      </div>
      {room.host && (
        <div className="seg mt-2 grid grid-cols-5" role="radiogroup" aria-labelledby="timer-label">
          {TIMER_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={minutes === m}
              disabled={busy}
              onClick={() => minutes !== m && run("set_timer", { p_room: room.id, p_minutes: m })}
            >
              {label(m)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Leave room, behind a small confirmation (easy to tap by accident). */
export function LeaveButton({ act }: { act: Act }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className="btn btn-quiet w-full" disabled={busy} onClick={() => setAsking(true)}>
        {t("room.leave")}
      </button>
      <Confirm
        open={asking}
        title={t("room.leaveTitle")}
        confirmLabel={t("room.leaveOk")}
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          setBusy(true);
          await act("leave_room");
          setBusy(false);
        }}
      />
    </>
  );
}
