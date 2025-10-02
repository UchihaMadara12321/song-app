// api/compose.ts
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type ComposeBody = {
  topic: string;
  level?: "beginner" | "intermediate" | "advanced";
  locale?: "zh-TW" | "zh-CN" | "en-US";
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildPrompt(topic: string, level: string, locale: string) {
  return `
你是一位懂教學設計的家教，請用 ${locale} 回答，主題：「${topic}」，程度：${level}。
請嚴格依 SONG 教學法輸出內容，並以 JSON 格式回傳：
- S（Spark）：定義 / 計算方法 / 應用場景
- O（Objectives）：3~5 條學習目標
- N（Nucleus）：澄清常見誤解
- G（Generation）：練習題、解題步驟、總結
只允許輸出 JSON，不要有多餘文字。
`.trim();
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  let body: ComposeBody;
  try { body = (await req.json()) as ComposeBody; }
  catch { return json({ ok: false, error: "INVALID_JSON_BODY" }, 400); }

  const topic = body.topic?.trim();
  if (!topic) return json({ ok: false, error: "MISSING_TOPIC" }, 400);

  try {
    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: buildPrompt(topic, body.level ?? "beginner", body.locale ?? "zh-TW"),
      temperature: 0.2,
      max_output_tokens: 800,
      response_format: { type: "json_object" }, // 這裡 TS 不認識
    } as any); // ✅ 強制忽略 TS 型別

    const out = (r as any).output_text;
    const data = JSON.parse(out);

    return json({ ok: true, data });
  } catch (err: any) {
    console.error("Compose error:", err);
    return json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
}
