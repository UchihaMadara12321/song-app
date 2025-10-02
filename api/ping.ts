// api/ping.ts
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

export default async function handler() {
  return new Response(
    JSON.stringify({ ok: true, message: "pong", ts: Date.now() }),
    {
      headers: { "content-type": "application/json; charset=utf-8" },
    }
  );
}
