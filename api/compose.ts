// api/compose.ts

export const config = {
  runtime: "nodejs",   // 使用 Node.js Runtime，而不是 Edge
  maxDuration: 60      // 增加允許時間，避免 OpenAI timeout
};

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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

// JSON Schema for SONG
const songSchema = {
  name: "SONG_Plan",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      S: { type: "array", items: { type: "string" }, minItems: 1 },
      O: { type: "array", items: { type: "string" }, minItems: 1 },
      N: { type: "array", items: { type: "string" }, minItems: 1 },
      G: {
        type: "object",
        additionalProperties: false,
        properties: {
          exercise: { type: "string" },
          steps: { type: "array", items: { type: "string" }, minItems: 1 },
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
你是一位懂教學設計的家教，請用 ${locale} 回答並設計學習內容，主題是「${topic}」，學習程度：${level}。
請嚴格依照 SONG 教學法輸出內容，並填入下列四個欄位（S / O / N / G）。
- S（Spark）：包含定義 / 計算方法 / 應用場景。
- O（Objectives）：3~5 條學習目標。
- N（Nucleus）：澄清常見誤解。
- G（Generation）：練習題、解題步驟、總結。
輸出只允許為 JSON。
`;
}

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return j({ ok: false, error: "Method Not Allowed" }, 405);
  }

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
      temperature: 0.7,
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
