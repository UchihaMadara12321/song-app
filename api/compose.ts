export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const payload = await req.json();

    // @ts-ignore
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = {
      model: "gpt-4o-mini",
      input: [{
        role: "user",
        content: `用 SONG 教學法簡短解釋主題：「${payload.topic || "統計學"}」，請輸出 JSON，欄位為 S,O,N,G。`
      }]
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({
      error: String(e?.message || e),
      stack: e?.stack || null,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
