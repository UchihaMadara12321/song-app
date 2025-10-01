// api/compose.ts
export const config = { runtime: "edge" };

type ComposeIn = {
  topic?: string;
  level?: "beginner" | "intermediate" | "advanced" | string;
  locale?: string; // e.g., "zh-TW"
};

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const input = (await req.json().catch(() => ({}))) as ComposeIn;

    const topic = input.topic?.trim() || "統計學：信賴區間";
    const level = input.level || "beginner";
    const locale = input.locale || "zh-TW";

    // 讀環境變數（Vercel → Settings → Environment Variables）
    // @ts-ignore
    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      return json({ ok: false, error: "Missing OPENAI_API_KEY in env" }, 500);
    }

    // 這版先不強制 schema，讓成功率最高；之後再逐步加上 Structured Outputs
    const body = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `你是一位嚴謹且友善的教學助理。` +
                `請用「SONG 教學法」為主題「${topic}」生成結構化學習引導，` +
                `受眾程度：${level}，語言：${locale}。` +
                `請直接輸出 **JSON**，四個欄位：` +
                `S（Structure/主題結構，列出2–4個核心小節）、` +
                `O（Objectives/學習目標，2–3條）、` +
                `N（Negatives/常見誤解與澄清，2–3條）、` +
                `G（Guided Practice/練習與總結，提供1–2個簡短練習與1段總結）。` +
                `只輸出 JSON，不要任何多餘文字。`
            }
          ]
        }
      ]
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    // 若 OpenAI 回非 2xx，把原始錯誤內容回傳，方便除錯
    if (!res.ok) {
      const text = await res.text();
      return json(
        { ok: false, upstream: "openai", status: res.status, detail: safeText(text) },
        res.status
      );
    }

    // 取得 OpenAI 原始回應（responses API）
    const data = await res.json();

    // 嘗試抓出文字：優先用 output_text；否則走到最常見的位置 output[0].content[0].text
    const text: string =
      data?.output_text ??
      data?.output?.[0]?.content?.[0]?.text ??
      "";

    // 嘗試把文字 parse 成 JSON（S/O/N/G）；若不是 JSON，就回 raw 文字，避免 500
    let payloadOut: unknown;
    try {
      payloadOut = JSON.parse(text);
    } catch {
      payloadOut = { raw: text };
    }

    return json(payloadOut, 200);
  } catch (e: any) {
    // 落網之魚：把錯誤曝露出來，方便你在客戶端或 Logs 看到
    return json(
      { ok: false, error: String(e?.message || e), stack: e?.stack ?? null },
      500
    );
  }
}

/* ------------------------- 小工具 ------------------------- */

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function safeText(s: string) {
  // 避免把太長或非 JSON 的原文塞爆回應
  return s.length > 4000 ? s.slice(0, 4000) + "…(truncated)" : s;
}
