"use client";

import { useState } from "react";
import { art } from "@/lib/art";
import { cleanCode, CODE_LENGTH } from "@/lib/game";
import type { Key } from "@/lib/i18n";
import { LanguageToggle, useT } from "./Locale";
import { Room } from "./Room";
import { Queued, Round } from "./Round";
import { Masthead, signOut } from "./SignIn";
import { useRoom, type Conn, type Notice } from "./useRoom";
import { useWakeLock } from "./useWakeLock";

export type Act = ReturnType<typeof useRoom>["act"];
export type Notify = ReturnType<typeof useRoom>["notify"];

export function App({ name }: { name: string }) {
  const { state, conn, act, notify, notices, dismiss } = useRoom();
  const inRoom = state?.status === "in_room" ? state : null;
  // A locked phone would show as away; keep the screen on in the game room and during rounds.
  useWakeLock(!!inRoom);
  // The table art behind the main menu, the game room and "Round in progress" (not the card).
  const backdrop = !!art.menu && !!state && (!inRoom || inRoom.room.phase === "lobby" || (inRoom.me.waiting && !inRoom.room.reveal));

  return (
    <main className="shell" data-art={backdrop || undefined}>
      {backdrop && <Backdrop />}
      <div className="flex items-center justify-between gap-2">
        <Connection conn={conn} />
        <LanguageToggle />
      </div>
      <Notices notices={notices} dismiss={dismiss} />
      {!state ? (
        // Only shows if the first answer is slow.
        <div className="loading m-auto" aria-busy="true">
          <span className="dot block size-3 animate-pulse" />
        </div>
      ) : !inRoom ? (
        <Menu name={name} act={act} />
      ) : inRoom.room.phase === "lobby" ? (
        <Room state={inRoom} act={act} notify={notify} />
      ) : inRoom.me.waiting && !inRoom.room.reveal ? (
        <Queued act={act} />
      ) : (
        <Round key={inRoom.room.round} state={inRoom} act={act} notify={notify} />
      )}
    </main>
  );
}

function Backdrop() {
  const files = art.menu!.files;
  return (
    <img
      className="backdrop"
      src={files[0].src}
      srcSet={files.map((f) => `${f.src} ${f.width}w`).join(", ")}
      sizes="(min-width: 30rem) 30rem, 100vw"
      alt=""
      fetchPriority="high"
      draggable={false}
    />
  );
}

function Connection({ conn }: { conn: Conn }) {
  const t = useT();
  return (
    <span className="conn" data-state={conn} role="status" data-testid="connection">
      <span className="dot" aria-hidden />
      {t(`conn.${conn}`)}
    </span>
  );
}

function Notices({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  const t = useT();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-10 flex flex-col items-center gap-2 px-4">
      {notices.map((n) => (
        <button key={n.id} type="button" onClick={() => dismiss(n.id)} className="notice panel pointer-events-auto max-w-[28rem] px-4 py-3 text-left font-bold" data-testid="notice">
          {t(n.key, n.vars)}
        </button>
      ))}
    </div>
  );
}

function Menu({ name, act }: { name: string; act: Act }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: string, args?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const failed = await act(fn, args);
    if (failed) setError(failed);
    setBusy(false);
  }

  return (
    <>
      <Masthead />
      <section className="panel flex flex-col gap-4 p-5">
        <button className="btn w-full" disabled={busy} onClick={() => run("create_room")}>
          {t("menu.create")}
        </button>
        <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          {t("menu.or")}
          <span className="h-px flex-1 bg-line" />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("join_room", { p_code: code });
          }}
        >
          <label htmlFor="code" className="sr-only">
            {t("menu.code")}
          </label>
          <input
            id="code"
            className="field code-field tracked min-w-0 flex-1"
            value={code}
            onChange={(e) => {
              setCode(cleanCode(e.target.value));
              setError(null);
            }}
            placeholder="······"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={!!error}
            aria-describedby={error ? "menu-error" : undefined}
          />
          <button className="btn" disabled={busy || code.length !== CODE_LENGTH}>
            {t("menu.join")}
          </button>
        </form>
        {error && (
          <p id="menu-error" role="alert" className="-mt-1 font-bold text-brick">
            {t(error)}
          </p>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-xl font-bold">{t("how.title")}</h2>
        <ol className="mt-3 flex flex-col gap-2.5">
          {(["how.1", "how.2", "how.3", "how.4", "how.5"] as const).map((key, i) => (
            <li key={key} className="flex gap-3">
              <span className="font-display flex size-6 flex-none items-center justify-center rounded-full bg-sage text-sm font-bold text-on-sage">{i + 1}</span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-3 text-sm text-muted">
        <span className="max-w-full truncate">{t("menu.signedIn", { name })}</span>
        <button className="min-h-11 font-bold text-ink underline underline-offset-4" onClick={signOut}>
          {t("menu.signOut")}
        </button>
      </footer>
    </>
  );
}
