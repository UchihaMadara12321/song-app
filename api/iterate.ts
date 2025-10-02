// 放在檔案最上面
export const config = {
  runtime: 'nodejs',   // 明確指定 Node 18
  maxDuration: 60          // （可選）增加雲端函式超時上限
};

import { callOpenAIResponses, pluckJson, jsonResponse } from "../lib/openai";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { songPlan, action, context } = await req.json(); // action: explain-differently | more-examples | mini-quiz

    const prompt = `
現有SONG（JSON）：${JSON.stringify(songPlan).slice(0, 6000)}
操作：${action}
脈絡：${context ?? "無"}

請僅回傳：
{ "addon": { ...對應 action 的新增內容... } }

規則：
- explain-differently：用生活比喻重述 S.oneLine 與 S.bullets，給出 "paraphrase" 欄位。
- more-examples：在 G.practice.intro 或 intermediate 增 2~3 題，含 hints 與 solution。
- mini-quiz：出 3 題單選題，格式 {question, options[4], answer, why}。
`.trim();

    const body = {
      model: "gpt-4o-mini",
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
