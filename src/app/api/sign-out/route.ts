import { signOut } from "@/server/auth";

export async function POST() {
  await signOut();
  return Response.json({ ok: true });
}
