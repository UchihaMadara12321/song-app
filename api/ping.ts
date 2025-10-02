// api/ping.ts
export const config = { runtime: "nodejs", maxDuration: 10 };

export default async function handler(req: Request) {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
