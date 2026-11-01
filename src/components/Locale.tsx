"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { LOCALE_COOKIE, translate, type Key, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return (key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

function saveLocale(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = l;
}

/** EN | မြန်မာ. The cookie is read on the server; refresh re-renders without losing state. */
export function LanguageToggle() {
  const locale = useContext(LocaleContext);
  const router = useRouter();
  const t = useT();
  const pick = (l: Locale) => {
    saveLocale(l);
    router.refresh();
  };
  return (
    <div className="lang" role="group" aria-label={t("lang.label")}>
      {(["en", "my"] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => pick(l)}>
          {l === "en" ? "EN" : "မြန်မာ"}
        </button>
      ))}
    </div>
  );
}
