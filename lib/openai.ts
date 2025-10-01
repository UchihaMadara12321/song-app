// lib/openai.ts
export async function callOpenAIResponses(body: unknown) {
  const apiKey = process.env.OPENAI_API_KEY!;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Error ${res.status}: ${errText}`);
  }
  return res.json();
}

export function pluckJson(data: any) {
  if (data.output_parsed) return data.output_parsed;
  if (data.output_text)   return JSON.parse(data.output_text);
  const text = data?.output?.[0]?.content?.[0]?.text ?? data?.content?.[0]?.text;
  if (text) return JSON.parse(text);
  return data;
}

export function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
