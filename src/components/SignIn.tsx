"use client";

import { useState } from "react";
import { messages, type Key } from "@/lib/i18n";
import { LanguageToggle, useT } from "./Locale";

export function Masthead() {
  const t = useT();
  return (
    <header className="masthead flex flex-col items-center gap-1 pt-6 pb-2 text-center">
      <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">{t("app.edition")}</p>
      <h1 className="font-display text-[2.125rem] leading-[1.1] font-bold text-balance">{t("app.title")}</h1>
    </header>
  );
}

export function SignInForm() {
  const t = useT();
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return window.location.replace("/");
      const key = `signin.${body.error}`;
      setError(key in messages.en ? (key as Key) : "error.generic");
    } catch {
      setError("error.generic");
    }
    setBusy(false);
  }

  return (
    <main className="shell">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <Masthead />
      <form onSubmit={submit} className="panel flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl font-bold">{t("signin.title")}</h2>
          <p className="text-muted">{t("signin.lead")}</p>
        </div>
        <label className="flex flex-col gap-1.5 font-bold">
          {t("signin.username")}
          <input className="field font-normal" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </label>
        <label className="flex flex-col gap-1.5 font-bold">
          {t("signin.password")}
          <input className="field font-normal" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="font-bold text-brick">
            {t(error)}
          </p>
        )}
        <button className="btn w-full" disabled={busy}>
          {busy ? t("signin.busy") : t("signin.submit")}
        </button>
        <p className="text-center text-sm text-muted">{t("signin.invite")}</p>
      </form>
    </main>
  );
}

export async function signOut() {
  await fetch("/api/sign-out", { method: "POST" }).catch(() => {});
  window.location.replace("/sign-in");
}

/** A signed-in account that may not play (waiting for approval or banned). */
export function NotAllowed() {
  const t = useT();
  return (
    <main className="shell">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <Masthead />
      <section className="panel flex flex-col gap-4 p-6 text-center">
        <p className="text-lg font-bold">{t("error.not_allowed")}</p>
        <button className="btn btn-quiet w-full" onClick={signOut}>
          {t("menu.signOut")}
        </button>
      </section>
    </main>
  );
}
