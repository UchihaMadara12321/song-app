// api/compose.ts
// 目標：用 Structured Outputs 要求模型只輸出符合 SONG schema 的乾淨 JSON
// 適用 Vercel Serverless Functions（Node 預設 runtime）

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type ComposeBody = {
  topic: string;            // 使用者要學的主題（例如：信賴區間是什麼？）
  level?: "beginner" | "intermediate" | "advanced";
  locale?: "zh-TW" | "zh-CN" | "en-US";
};

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// SONG 輸出結構（最小可行）
const songSchema = {
  name: "SONG_Plan",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      S: {
        // Spark：用「可以直接拿去教」的條列說明（定義/方法/應用場景等）
        type: "array",
        items: { type: "string" },
        minItems: 1,
      },
      O: {
        // Objectives：學習目標（具體到可以檢核）
        type: "array",
        items: { type: "string" },
        minItems: 1,
      },
      N: {
        // Nucleus：核心概念（澄清常見誤解、正確觀念）
        type: "array",
        items: { type: "string" },
        minItems: 1,
      },
      G: {
        // Generation：引導練習（錯誤導向/步驟/總結）
        type: "object",
        additionalProperties: false,
        properties: {
          exercise: { type: "string" }, // 一個具體練習題或任務敘述
          steps: {
            type: "array",
            items: { type: "string" }, // 解題/練習步驟（條列）
            minItems: 1,
          },
          summary: { type: "string" }, // 一段完整的總結/延伸
        },
        required: ["exercise", "steps", "summary"],
      },
    },
    required: ["S", "O", "N", "G"],
  },
} as const;

// 你可以把這段 prompt 視為「出題規範」：
// - 限定語言（locale）
// - 限定層級（level）
// - 明確請模型依 SONG 結構填內容
function buildPrompt(topic: string, level: string, locale: string) {
  return `
你是一位懂教學設計的家教，請用 ${locale} 回答並設計學習內容，主題是「${topic}」，學習程度：${level}。
請嚴格依照 SONG 教學法輸出內容，並填入下列四個欄位（S / O / N / G）。
- S（Spark）：用容易懂、可用於啟動動機與快速入門的 3~5 條 bullet，優先包含「定義 / 計算方法 / 應用場景」。
- O（Objectives）：3~5 條可檢核的學習目標（用動作動詞，具體可觀察）。
- N（Nucleus）：釐清此主題最常見的誤解與正確概念（3~5 條）。
- G（Generation）：設計一個練習任務（exercise），並提供 3~6 個步驟（steps），最後給一段總結（summary）。

輸出只允許為 JSON（由系統提供的 JSON Schema 已經約束），不要多餘文字、不要 Markdown、不要程式碼圍欄。
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

  const topic = (payload.topic ?? "").trim();
  const level = (payload.level ?? "beginner").trim();
  const locale = (payload.locale ?? "zh-TW").trim();

  if (!topic) {
    return j({ ok: false, error: "MISSING_TOPIC" }, 400);
  }

  // 建立提示
  const prompt = buildPrompt(topic, level, locale);

  try {
    // ★ 關鍵：用 Structured Outputs（json_schema）強制模型回「符合 schema 的 JSON」
    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: songSchema,
      },
    });

    // 依 SDK 版本取 JSON：新版會在 content[0].json；有些版本會在 output_text（即 JSON 字串）
    let data: any =
      (r as any)?.output?.[0]?.content?.[0]?.json ??
      (r as any)?.output_text
        ? JSON.parse((r as any).output_text)
        : null;

    if (!data) {
      // 安全退路：把完整結果回給你排錯，不再回「MODEL_OUTPUT_NOT_JSON」
      return j({ ok: false, error: "NO_JSON_PAYLOAD", raw: r }, 502);
    }

    // 最簡單的校驗：確保四個欄位存在
    const ok =
      data &&
      Array.isArray(data.S) &&
      Array.isArray(data.O) &&
      Array.isArray(data.N) &&
      data.G &&
      typeof data.G.exercise === "string" &&
      Array.isArray(data.G.steps) &&
      typeof data.G.summary === "string";

    if (!ok) {
      return j({ ok: false, error: "JSON_SHAPE_INVALID", raw: data }, 422);
    }

    // 成功
    return j({ ok: true, data });
  } catch (err: any) {
    // OpenAI / 其他例外
    return j({
      ok: false,
      error: "OPENAI_ERROR",
      message: err?.message ?? String(err),
    }, 500);
  }
}
