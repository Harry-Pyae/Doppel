import { redirect } from "next/navigation";
import { LocaleProvider } from "@/components/Locale";
import { SignInForm } from "@/components/SignIn";
import { currentPlayer } from "@/server/auth";
import { getLocale } from "@/server/locale";

export const metadata = { title: "Sign in · Doppel" };

export default async function SignInPage() {
  const [player, locale] = await Promise.all([currentPlayer(), getLocale()]);
  if (player?.allowed) redirect("/");
  return (
    <LocaleProvider locale={locale}>
      <SignInForm />
    </LocaleProvider>
  );
}
