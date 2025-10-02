// api/compose.ts  —— 加完整錯誤輸出
// 放在檔案最上面
export const config = {
  runtime: 'nodejs18.x',   // 明確指定 Node 18
  maxDuration: 60          // （可選）增加雲端函式超時上限
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

const songSchema = {
  name: "SONG_Plan",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      S: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
      O: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
      N: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
      G: {
        type: "object",
        additionalProperties: false,
        properties: {
          exercise: { type: "string" },
          steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
          summary: { type: "string" },
        },
        required: ["exercise", "steps", "summary"],
      },
    },
    required: ["S", "O", "N", "G"],
  },
} as const;

function buildPrompt(topic: string, level: string, locale: string) {
  return `
你是一位懂教學設計的家教，使用 ${locale} 回答，主題：「${topic}」，程度：${level}。
請嚴格依 SONG 輸出，並保持精簡：S/O/N 各 2 條，G 只 1 題 + 2~3 步 + 1 段總結。
只輸出 JSON（系統已提供 Schema），不要任何多餘文字。
`.trim();
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  let body: ComposeBody;
  try { body = (await req.json()) as ComposeBody; }
  catch (e) {
    console.error("Invalid JSON body:", e);
    return json({ ok: false, error: "INVALID_JSON_BODY" }, 400);
  }

  const topic = body.topic?.trim();
  const level = body.level ?? "beginner";
  const locale = body.locale ?? "zh-TW";
  if (!topic) return json({ ok: false, error: "MISSING_TOPIC" }, 400);

  const prompt = buildPrompt(topic, level, locale);

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing in Production env");
    }

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.1,
      max_output_tokens: 280,
      response_format: { type: "json_schema", json_schema: songSchema },
    });

    const data =
      (r as any)?.output?.[0]?.content?.[0]?.json ??
      ((r as any)?.output_text ? JSON.parse((r as any).output_text) : null);

    if (!data) {
      console.error("No JSON in response:", JSON.stringify(r, null, 2));
      return json({ ok: false, error: "NO_JSON" }, 502);
    }
    return json({ ok: true, data });
  } catch (err: any) {
    console.error("Compose error:", err);
    return json({
      ok: false,
      error: err?.message ?? String(err),
      stack: err?.stack ?? null,
    }, 500);
  }
}
