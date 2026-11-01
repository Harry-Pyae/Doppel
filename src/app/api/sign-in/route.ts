import { signIn } from "@/server/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const result = await signIn(text(body?.username), text(body?.password));
  const status = "ok" in result ? 200 : result.error === "off" ? 503 : result.error === "locked" ? 429 : result.error === "wrong" ? 401 : 403;
  return Response.json(result, { status });
}
