export const config = { runtime: "edge" };

import { SONG_SCHEMA } from "../schema/songSchema";
import { callOpenAIResponses, pluckJson, jsonResponse } from "../lib/openai";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { topic, level = "beginner", locale = "zh-TW", goal } = await req.json();

    const system = [
      "你是一位嚴謹且溫暖的家教，使用 SONG 教學法（S=Summarize, O=Organize, N=Navigate, G=Guide）。",
      "輸出必須符合提供的 JSON Schema；使用繁體中文；段落儘量短；同時提供 a11y.ttsPlainText（無公式、無特殊符號）。"
    ].join("\n");

    const user = [
      `主題：${topic}`,
      `程度：${level}`,
      `語系：${locale}`,
      goal ? `學習目標（偏好）：${goal}` : null,
      "請產生完整 SONG：S(總攬) / O(概念點與先備) / N(常見誤解) / G(分層練習＋總結)；切記符合 Schema。"
    ].filter(Boolean).join("\n");

    const body = {
      model: "gpt-4o-mini", // 可改成你的 Responses 相容模型
      input: [
        { role: "system", content: system },
        { role: "user",   content: user }
      ],
      response_format: { type: "json_schema", json_schema: SONG_SCHEMA }
    };

    const data = await callOpenAIResponses(body);
    const json = pluckJson(data);
    return jsonResponse(json);
  } catch (e: any) {
     return jsonResponse({
    error: String(e?.message || e),
    stack: e?.stack || null
  }, 500);
  }
}
