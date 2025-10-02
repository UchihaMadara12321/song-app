// 放在檔案最上面
export const config = {
  runtime: 'nodejs18.x',   // 明確指定 Node 18
  maxDuration: 60          // （可選）增加雲端函式超時上限
};

export default async function handler() {
  // @ts-ignore
  const hasKey = !!process.env.OPENAI_API_KEY;

  return new Response(
    JSON.stringify({
      ok: true,
      env: { OPENAI_API_KEY: hasKey ? "present" : "missing" }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
