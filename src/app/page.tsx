import { redirect } from "next/navigation";
import { App } from "@/components/App";
import { LocaleProvider } from "@/components/Locale";
import { NotAllowed } from "@/components/SignIn";
import { currentPlayer } from "@/server/auth";
import { getLocale } from "@/server/locale";

export default async function Home() {
  const [player, locale] = await Promise.all([currentPlayer(), getLocale()]);
  if (!player) redirect("/sign-in");
  return <LocaleProvider locale={locale}>{player.allowed ? <App name={player.name} /> : <NotAllowed />}</LocaleProvider>;
}
