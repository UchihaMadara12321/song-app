// 放在檔案最上面
export const config = {
  runtime: 'nodejs18.x',   // 明確指定 Node 18
  maxDuration: 60          // （可選）增加雲端函式超時上限
};


export default async function handler() {
  // @ts-ignore
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok:false, error: "OPENAI_API_KEY missing" }), { status: 500 });
  }

  const body = {
    model: "gpt-4o-mini",
    input: [{ role: "user", content: "Say: ok" }]
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" }
  });
}
