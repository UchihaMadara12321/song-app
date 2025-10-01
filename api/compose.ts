// api/compose.ts
export const config = { runtime: "edge" };

type ComposeIn = {
  topic?: string;
  level?: "beginner" | "intermediate" | "advanced" | string;
  locale?: string;
};

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const input = (await req.json().catch(() => ({}))) as ComposeIn;
    const topic = (input.topic || "統計學：信賴區間").trim();
    const level = input.level || "beginner";
    const locale = input.locale || "zh-TW";

    // @ts-ignore
    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) return j({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    // 用 Responses API；input 可用字串（最穩）
    const body = {
      model: "gpt-4o-mini",
      input:
        `你是一位嚴謹且友善的教學助理。` +
        `請用「SONG 教學法」為主題「${topic}」生成結構化學習引導，受眾程度：${level}，語言：${locale}。` +
        `直接輸出 **純 JSON**，只有四個欄位：` +
        `S（Structure/主題結構，2–4 條）、O（Objectives/學習目標，2–3 條）、` +
        `N（Negatives/常見誤解與澄清，2–3 條）、G（Guided Practice/練習與總結，1–2 個練習＋1段總結）。` +
        `禁止輸出任何註解、Markdown 或 \`\`\`json 標記。僅輸出 JSON 物件。`
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      return j({ ok: false, upstream: "openai", status: res.status, detail: trimLong(text) }, res.status);
    }

    const data = await res.json();

    // 優先用 output_text；否則取常見路徑
    const rawText: string =
      data?.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "";

    // 清理並嘗試解析 JSON
    const cleaned = extractJson(rawText);
    try {
      const parsed = JSON.parse(cleaned);
      return j(parsed, 200);
    } catch {
      // 仍不是 JSON 就原樣回傳，避免 500
      return j({ raw: rawText }, 200);
    }
  } catch (e: any) {
    return j({ ok: false, error: String(e?.message || e), stack: e?.stack ?? null }, 500);
  }
}

/* ---------- helpers ---------- */

function j(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" } // ← 加上 charset
  });
}

// 去除 ```json ... ```、抓出最像 JSON 的區段
function extractJson(s: string): string {
  if (!s) return "";
  // 1) 先抓 ```json ... ``` 內容
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  // 2) 去除開頭/結尾的 ``` 或多餘字
  let t = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // 3) 嘗試從第一個 { 到最後一個 } 擷取
  const firstObj = t.indexOf("{");
  const lastObj = t.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return t.slice(firstObj, lastObj + 1).trim();
  }
  // 4) 再試一次 array 形式
  const firstArr = t.indexOf("[");
  const lastArr = t.lastIndexOf("]");
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    return t.slice(firstArr, lastArr + 1).trim();
  }
  return t;
}

function trimLong(s: string, max = 4000) {
  return s.length > max ? s.slice(0, max) + "…(truncated)" : s;
}
