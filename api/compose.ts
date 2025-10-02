// api/compose.ts
export const config = {
  runtime: "nodejs",  // 一定要 Node.js，避免 Edge 5s 被砍
  maxDuration: 10,    // Hobby 實際上限
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

// 精簡版 Schema（足夠教學用、也比較快）
const songSchema = {
  name: "SONG_Plan",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      S: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      O: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      N: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      G: {
        type: "object",
        additionalProperties: false,
        properties: {
          exercise: { type: "string" },
          steps: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 4,
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
你是一位懂教學設計的家教，請用 ${locale} 回答，主題：「${topic}」，程度：${level}。
嚴格依 SONG 輸出，且每一欄目請「精簡且高密度」：
- S（Spark）：只給 3 條（定義 / 計算方法 / 應用場景）。每條 25~40 字。
- O（Objectives）：只給 3 條，能被檢核。
- N（Nucleus）：只給 3 條，澄清最常見誤解。
- G（Generation）：1 個練習題（清楚而短），3~4 個解題步驟，1 段 40~60 字總結。

只允許輸出 JSON（Schema 已由系統提供），不要多餘文字或 Markdown。
`.trim();
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return j({ ok: false, error: "Method Not Allowed" }, 405);

  let payload: ComposeBody;
  try {
    payload = (await req.json()) as ComposeBody;
  } catch {
    return j({ ok: false, error: "INVALID_JSON_BODY" }, 400);
  }

  const topic = payload.topic?.trim();
  const level = payload.level ?? "beginner";
  const locale = payload.locale ?? "zh-TW";
  if (!topic) return j({ ok: false, error: "MISSING_TOPIC" }, 400);

  const prompt = buildPrompt(topic, level, locale);

  try {
    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.2,          // 越低越快且穩定
      max_output_tokens: 450,    // 硬性限制輸出量，避免超時
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
