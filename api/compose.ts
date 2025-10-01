// api/compose.ts
// Node.js Serverless Function 版：較不易因內容龐大而超時
export const config = { runtime: "nodejs" };

type ComposeIn = {
  topic?: string;
  level?: "beginner" | "intermediate" | "advanced" | string;
  locale?: string; // e.g. "zh-TW"
};

type ComposeOut = {
  meta: { topic: string; level: string; locale: string; duration_min: number };
  S: {
    hook_story: string;
    intuition: string;
    visual: string;
    table: string;
    real_world_examples: string[];
  };
  O: {
    learning_objectives: string[];
    prerequisites: string[];
    key_terms: string[];
    outcomes_checklist: string[];
  };
  N: {
    core_explanation: string;
    formulas: string[];
    step_by_step: string[];
    worked_example: { problem: string; steps: string[]; answer: string };
    misconceptions: Array<{ myth: string; fix: string }>;
  };
  G: {
    practice_sets: Array<{
      title: string;
      items: Array<{
        q: string;
        expected: string;
        hints: string[];
        common_error: string;
        correction: string;
      }>;
    }>;
    summary: string;
    spaced_retrieval: string[];
    extension: string[];
  };
};

// Vercel Node API：export default (req, res)
export default async function handler(req: any, res: any) {
  // 統一 JSON 回傳（UTF-8）
  const j = (obj: unknown, status = 200) =>
    res
      .status(status)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .send(JSON.stringify(obj));

  if (req.method !== "POST") return j({ ok: false, error: "Method Not Allowed" }, 405);

  try {
    // 兼容 body 可能是已解析物件或字串
    const bodyRaw = req.body ?? {};
    const input: ComposeIn =
      typeof bodyRaw === "string" ? JSON.parse(bodyRaw) : (bodyRaw as ComposeIn);

    const topic = (input.topic || "統計學：信賴區間").trim();
    const level = input.level || "beginner";
    const locale = input.locale || "zh-TW";

    const apiKey = process.env.OPENAI_API_KEY as string | undefined;
    if (!apiKey) return j({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    // —— Prompt（完整教學流程）——
    const prompt = `你是一位嚴謹且友善的教學助理。使用者提出明確的量化分析課題：「${topic}」。
請依「SONG 教學法」產生完整教學流程，語言：${locale}，學習層級：${level}。
最終目標：輕鬆學習、100 天後仍能記得。請務必：
1) Spark：用故事/圖形/表格/生活案例建立直覺，避免空話與模板化。
2) Objective：列出可衡量學習目標與自我檢核，補齊前置知識。
3) Nucleus：核心講解需有精煉說明、LaTeX 公式（若需要）、步驟化推導、完整例題；列出常見誤解與正確澄清。
4) Generation：以 error-based learning 設計練習（題目→常見錯誤→糾正），並給 2–3 句總結、spaced retrieval 提示、延伸應用。
5) 圖形請以極短 ASCII 或 mermaid 片段呈現；表格請用簡短 Markdown。
6) 僅輸出「純 JSON」，結構與鍵名必須嚴格符合以下 Schema；不得輸出註解、額外說明或 \`\`\`json 標記。

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

    // 用 Responses API（最穩定）
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", input: prompt })
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return j({ ok: false, upstream: "openai", status: resp.status, detail: trimLong(detail) }, resp.status);
    }

    const data = await resp.json();// 取得模型原始文字
// 取得模型原始文字（保持你的寫法）
const rawText: string =
  data?.output_text ??
  data?.output?.[0]?.content?.[0]?.text ??
  "";

// 仍然保留你的 extractJson / sanitize
const cleaned = sanitize(extractJson(rawText));

function tryParseJson<T = any>(s: string): [true, T] | [false, null] {
  try {
    return [true, JSON.parse(s) as T];
  } catch {
    return [false, null];
  }
}

// ① 第一次嘗試：直接 parse（若模型已回真正 JSON，這一步就成功）
let [ok1, first] = tryParseJson<any>(cleaned);

// ② 如果第一次 parse 成功，而且「結果是字串」，代表模型回的是「字串化的 JSON」
//    再 parse 第二次就會得到真正的物件
if (ok1 && typeof first === "string") {
  const [ok2, second] = tryParseJson<any>(first);
  if (ok2) {
    parsed = second;
  } else {
    // 第二次 parse 還是失敗 -> 視為不合規
    return j({ ok: false, error: "MODEL_OUTPUT_NOT_JSON", raw: rawText }, 502);
  }
} else if (ok1) {
  // 第一次 parse 就得到物件，直接用
  parsed = first;
} else {
  // ③ 還是不行，最後再嘗試去掉可能包住整串的引號（有些模型會外層再套一對引號）
  const trimmed = cleaned.replace(/^\s*"(.*)"\s*$/s, "$1");
  const [ok3, third] = tryParseJson<any>(trimmed);
  if (ok3) {
    parsed = third;
  } else {
    return j({ ok: false, error: "MODEL_OUTPUT_NOT_JSON", raw: rawText }, 502);
  }
}


    const [ok, normalized, why] = validateAndNormalize(parsed, { topic, level, locale });
    if (!ok) return j({ ok: false, error: "SCHEMA_VALIDATION_FAILED", reason: why, raw: rawText }, 422);

    return j(normalized, 200);
  } catch (e: any) {
    return res
      .status(500)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .send(JSON.stringify({ ok: false, error: String(e?.message || e), stack: e?.stack ?? null }));
  }
}

/* ---------- Helpers ---------- */
function extractJson(s: string): string {
  if (!s) return "";
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  let t = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i1 = t.indexOf("{"), i2 = t.lastIndexOf("}");
  if (i1 !== -1 && i2 !== -1 && i2 > i1) return t.slice(i1, i2 + 1).trim();
  return t;
}
function sanitize(s: string) {
  return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}
function trimLong(s: string, max = 4000) {
  return s.length > max ? s.slice(0, max) + "…(truncated)" : s;
}

function validateAndNormalize(x: any, meta: { topic: string; level: string; locale: string })
  : [true, ComposeOut, null] | [false, null, string] {
  if (!x || typeof x !== "object") return [false, null, "not an object"];

  const out: ComposeOut = {
    meta: {
      topic: meta.topic,
      level: meta.level,
      locale: meta.locale,
      duration_min: typeof x?.meta?.duration_min === "number" ? x.meta.duration_min : 25
    },
    S: {
      hook_story: str(x?.S?.hook_story),
      intuition: str(x?.S?.intuition),
      visual: str(x?.S?.visual),
      table: str(x?.S?.table),
      real_world_examples: arrStr(x?.S?.real_world_examples)
    },
    O: {
      learning_objectives: arrStr(x?.O?.learning_objectives),
      prerequisites: arrStr(x?.O?.prerequisites),
      key_terms: arrStr(x?.O?.key_terms),
      outcomes_checklist: arrStr(x?.O?.outcomes_checklist)
    },
    N: {
      core_explanation: str(x?.N?.core_explanation),
      formulas: arrStr(x?.N?.formulas),
      step_by_step: arrStr(x?.N?.step_by_step),
      worked_example: {
        problem: str(x?.N?.worked_example?.problem),
        steps: arrStr(x?.N?.worked_example?.steps),
        answer: str(x?.N?.worked_example?.answer)
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
              q: str(it?.q),
              expected: str(it?.expected),
              hints: arrStr(it?.hints),
              common_error: str(it?.common_error),
              correction: str(it?.correction)
            }))
            .filter((it: any) => it.q && it.expected)
        }))
        .filter((ps: any) => ps.title && ps.items?.length),
      summary: str(x?.G?.summary),
      spaced_retrieval: arrStr(x?.G?.spaced_retrieval),
      extension: arrStr(x?.G?.extension)
    }
  };

  // 必要性檢查（避免只換名詞）
  if (!out.S.hook_story || !out.S.intuition) return [false, null, "S.hook_story / S.intuition missing"];
  if (out.S.real_world_examples.length < 2) return [false, null, "S.real_world_examples too short"];
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
