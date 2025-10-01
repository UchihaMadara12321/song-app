// api/compose.ts
export const config = { runtime: "edge" };

/** ---------- Input / Output Types ---------- */

type ComposeIn = {
  topic?: string;
  level?: "beginner" | "intermediate" | "advanced" | string;
  locale?: string; // e.g. zh-TW
};

type ComposeOut = {
  meta: {
    topic: string;
    level: string;
    locale: string;
    duration_min: number;
  };
  S: { // Spark：喚起興趣與直覺
    hook_story: string;                // 小故事/情境
    intuition: string;                 // 生活化直覺
    visual: string;                    // ASCII/mermaid 簡圖（短）
    table: string;                     // Markdown 表格（短）
    real_world_examples: string[];     // 2–4 則
  };
  O: { // Objective：可衡量的目標
    learning_objectives: string[];     // 2–4 條（可衡量）
    prerequisites: string[];           // 前置知識
    key_terms: string[];               // 術語
    outcomes_checklist: string[];      // 自我檢核
  };
  N: { // Nucleus：核心講解
    core_explanation: string;          // 精煉、避免空話
    formulas: string[];                // LaTeX 可
    step_by_step: string[];            // 步驟/演算法
    worked_example: {                  // 具體例題
      problem: string;
      steps: string[];
      answer: string;
    };
    misconceptions: Array<{            // 常見誤解與澄清（error schema 的基礎）
      myth: string;
      fix: string;
    }>;
  };
  G: { // Generation：練習、糾錯、總結與延伸
    practice_sets: Array<{
      title: string;
      items: Array<{
        q: string;
        expected: string;   // 評分重點/標準
        hints: string[];
        common_error: string;
        correction: string; // 針對 common_error 的糾正指引
      }>;
    }>;
    summary: string;                    // 2–3 句總結
    spaced_retrieval: string[];         // 3–5 個記憶檢索提示
    extension: string[];                // 延伸/跨域應用
  };
};

/** ---------- Handler ---------- */

export default async function handler(req: Request) {
  if (req.method !== "POST") return j({ ok: false, error: "Method Not Allowed" }, 405);

  try {
    const input = (await req.json().catch(() => ({}))) as ComposeIn;
    const topic  = (input.topic || "統計學：信賴區間").trim();
    const level  = input.level  || "beginner";
    const locale = input.locale || "zh-TW";

    // @ts-ignore
    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) return j({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    // ===== Prompt：嚴格規格化（禁止只換名詞、必須具體可操作） =====
    const prompt =
`你是一位嚴謹且友善的教學助理。使用者提出明確的量化分析課題：「${topic}」。
請依「SONG 教學法」產生完整教學流程，語言：${locale}，學習層級：${level}。
最終目標：輕鬆學習、100 天後仍能記得。請務必：
1) Spark：用故事/圖形/表格/生活案例建立直覺，避免空話與模板化。
2) Objective：列出可衡量學習目標與自我檢核，補齊前置知識。
3) Nucleus：核心講解需有精煉說明、LaTeX 公式（若需要）、步驟化推導、完整例題；列出常見誤解與正確澄清。
4) Generation：以 error-based learning 設計練習（題目→常見錯誤→糾正），並給 2–3 句總結、spaced retrieval 提示、延伸應用。
5) 圖形請以極短 ASCII 或 mermaid 片段呈現；表格請用簡短 Markdown。
6) 僅輸出 **純 JSON**，結構與鍵名必須嚴格符合以下 Schema；不得輸出任何註解、額外說明或 \`\`\`json 標記。

Schema：
{
  "meta": { "topic": string, "level": string, "locale": string, "duration_min": number },
  "S": {
    "hook_story": string,
    "intuition": string,
    "visual": string,
    "table": string,
    "real_world_examples": string[]
  },
  "O": {
    "learning_objectives": string[],
    "prerequisites": string[],
    "key_terms": string[],
    "outcomes_checklist": string[]
  },
  "N": {
    "core_explanation": string,
    "formulas": string[],
    "step_by_step": string[],
    "worked_example": { "problem": string, "steps": string[], "answer": string },
    "misconceptions": [ { "myth": string, "fix": string } ]
  },
  "G": {
    "practice_sets": [
      {
        "title": string,
        "items": [ { "q": string, "expected": string, "hints": string[], "common_error": string, "correction": string } ]
      }
    ],
    "summary": string,
    "spaced_retrieval": string[],
    "extension": string[]
  }
}`;

    // Responses API：用字串 input 最穩定
    const body = { model: "gpt-4o-mini", input: prompt };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      return j({ ok: false, upstream: "openai", status: res.status, detail: trimLong(text) }, res.status);
    }

    const data    = await res.json();
    const rawText = data?.output_text ?? data?.output?.[0]?.content?.[0]?.text ?? "";

    const cleaned = sanitize(extractJson(rawText));
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return j({ ok:false, error:"MODEL_OUTPUT_NOT_JSON", raw: rawText }, 502);
    }

    const [ok, normalized, why] = validateAndNormalize(parsed, { topic, level, locale });
    if (!ok) return j({ ok:false, error:"SCHEMA_VALIDATION_FAILED", reason: why, raw: rawText }, 422);

    return j(normalized, 200);
  } catch (e: any) {
    return j({ ok:false, error:String(e?.message || e), stack:e?.stack ?? null }, 500);
  }
}

/** ---------- Helpers ---------- */

function j(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

// 擷取 JSON（去除 ```json ... ```；抓最可能的物件）
function extractJson(s: string): string {
  if (!s) return "";
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  let t = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i1 = t.indexOf("{"), i2 = t.lastIndexOf("}");
  if (i1 !== -1 && i2 !== -1 && i2 > i1) return t.slice(i1, i2 + 1).trim();
  return t;
}

// 移除控制字元，避免 JSON.parse 失敗
function sanitize(s: string) {
  return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}
function trimLong(s: string, max = 4000) {
  return s.length > max ? s.slice(0, max) + "…(truncated)" : s;
}

/** ---------- Light Schema Validation & Normalization ---------- */
function validateAndNormalize(x: any, meta: {topic: string; level: string; locale: string})
  : [true, ComposeOut, null] | [false, null, string] {

  if (!x || typeof x !== "object") return [false, null, "not an object"];

  const out: ComposeOut = {
    meta: {
      topic:  meta.topic,
      level:  meta.level,
      locale: meta.locale,
      duration_min: typeof x?.meta?.duration_min === "number" ? x.meta.duration_min : 20
    },
    S: {
      hook_story:          str(x?.S?.hook_story),
      intuition:           str(x?.S?.intuition),
      visual:              str(x?.S?.visual),
      table:               str(x?.S?.table),
      real_world_examples: arrStr(x?.S?.real_world_examples)
    },
    O: {
      learning_objectives: arrStr(x?.O?.learning_objectives),
      prerequisites:       arrStr(x?.O?.prerequisites),
      key_terms:           arrStr(x?.O?.key_terms),
      outcomes_checklist:  arrStr(x?.O?.outcomes_checklist)
    },
    N: {
      core_explanation: str(x?.N?.core_explanation),
      formulas:         arrStr(x?.N?.formulas),
      step_by_step:     arrStr(x?.N?.step_by_step),
      worked_example: {
        problem: str(x?.N?.worked_example?.problem),
        steps:   arrStr(x?.N?.worked_example?.steps),
        answer:  str(x?.N?.worked_example?.answer)
      },
      misconceptions: (Array.isArray(x?.N?.misconceptions) ? x.N.misconceptions : [])
        .filter((m: any) => isNonEmptyString(m?.myth) && isNonEmptyString(m?.fix))
        .map((m: any) => ({ myth: m.myth.trim(), fix: m.fix.trim() }))
    },
    G: {
      practice_sets: (Array.isArray(x?.G?.practice_sets) ? x.G.practice_sets : [])
        .map((ps: any) => ({
          title: str(ps?.title),
          items: (Array.isArray(ps?.items) ? ps.items : [])
            .map((it: any) => ({
              q:           str(it?.q),
              expected:    str(it?.expected),
              hints:       arrStr(it?.hints),
              common_error:str(it?.common_error),
              correction:  str(it?.correction)
            }))
            .filter((it: any) => it.q && it.expected)
        }))
        .filter((ps: any) => ps.title && ps.items?.length),
      summary:          str(x?.G?.summary),
      spaced_retrieval: arrStr(x?.G?.spaced_retrieval),
      extension:        arrStr(x?.G?.extension)
    }
  };

  // 必要性檢查：避免「只換名詞」
  if (!out.S.hook_story || !out.S.intuition) return [false, null, "S.hook_story / S.intuition missing"];
  if (out.S.real_world_examples.length < 2)  return [false, null, "S.real_world_examples too short"];
  if (!out.N.core_explanation || out.N.step_by_step.length < 2) return [false, null, "N.core_explanation / step_by_step too short"];
  if (!out.N.worked_example.problem || out.N.worked_example.steps.length < 2) return [false, null, "N.worked_example incomplete"];
  if (!out.N.misconceptions.length) return [false, null, "N.misconceptions missing"];
  if (!out.G.practice_sets.length || !out.G.practice_sets[0].items.length) return [false, null, "G.practice_sets missing"];
  if (!out.G.summary || !out.G.spaced_retrieval.length) return [false, null, "G.summary / spaced_retrieval missing"];

  return [true, out, null];
}

function str(v: any): string {
  return typeof v === "string" ? v.trim() : "";
}
function arrStr(v: any): string[] {
  return Array.isArray(v) ? v.filter(isNonEmptyString).map((s: string) => s.trim()) : [];
}
function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
