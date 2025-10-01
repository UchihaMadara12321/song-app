export const config = { runtime: "edge" };

export default async function handler() {
  // @ts-ignore
  const hasKey = !!process.env.OPENAI_API_KEY;

  return new Response(
    JSON.stringify({
      ok: true,
      env: { OPENAI_API_KEY: hasKey ? "present" : "missing" }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
