export const config = { runtime: "edge" };

import { callOpenAIResponses, pluckJson, jsonResponse } from "../lib/openai";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { songPlan, userAnswers } = await req.json();

    const prompt = `
請基於 SONG 與使用者作答，輸出：
{
  "wrapup": {
    "recap": "五行內重點回顧",
    "corrections": ["針對常見誤解的修正重點..."],
    "nextSteps": ["三個延伸學習建議（含關鍵字）..."],
    "ttsPlainText": "適合語音朗讀的簡化文本"
  }
}
SONG: ${JSON.stringify(songPlan).slice(0, 6000)}
作答: ${JSON.stringify(userAnswers ?? {})}
`.trim();

    const body = {
      model: "o4-mini",
      input: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    };

    const data = await callOpenAIResponses(body);
    const json = pluckJson(data);
    return jsonResponse(json);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
}
