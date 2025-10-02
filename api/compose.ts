// api/compose.ts  —— ULTRA COMPACT 版本，先確認可在 Vercel Hobby 10s 內通過
export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type ComposeBody = {
  topic: string;
  level?: "beginner" | "intermediate" | "advanced";
  locale?: "zh-TW" | "zh-CN" | "en-US";
};

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// 超精簡 Schema：輸出量最小化，確保不超時
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
          steps: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 3,
          },
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
請嚴格依 SONG 輸出，且務必「精簡」：
- S（Spark）：僅 2 條（定義 / 計算方法 / 應用場景，三選二，合計 2 條），每條 20~35 字。
- O（Objectives）：僅 2 條，可檢核、可評量。
- N（Nucleus）：僅 2 條，澄清最常見誤解。
- G（Generation）：僅 1 個練習題、2~3 個解題步驟、最後 1 段 30~50 字總結。

只允許輸出 JSON（系統已提供 Schema），不要任何多餘文字或 Markdown。
`.trim();
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return j({ ok: false, error: "Method Not Allowed" }, 405);

  let payload: ComposeBody;
  try { payload = (await req.json()) as ComposeBody; } 
  catch { return j({ ok: false, error: "INVALID_JSON_BODY" }, 400); }

  const topic = payload.topic?.trim();
  const level = payload.level ?? "beginner";
  const locale = payload.locale ?? "zh-TW";
  if (!topic) return j({ ok: false, error: "MISSING_TOPIC" }, 400);

  const prompt = buildPrompt(topic, level, locale);

  try {
    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.1,          // 穩定快速
      max_output_tokens: 280,    // 硬性限制輸出量，避免超時
      response_format: {
        type: "json_schema",
        json_schema: songSchema,
      },
    });

    const data =
      (r as any)?.output?.[0]?.content?.[0]?.json ??
      ((r as any)?.output_text ? JSON.parse((r as any).output_text) : null);

    if (!data) return j({ ok: false, error: "NO_JSON", raw: r }, 502);
    return j({ ok: true, data });
  } catch (err: any) {
    return j({ ok: false, error: err?.message ?? String(err) }, 500);
  }
}
