// Ouvido da Vanessa no chat do celular: recebe o áudio gravado na página e devolve o texto (Azure Speech, pt-BR).
// Usa os mesmos segredos da voz: AZURE_SPEECH_KEY e AZURE_SPEECH_REGION (padrão: brazilsouth).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGENS = [
  "https://santosandradejonathan-rgb.github.io",
  "https://nostrohub.com.br",
  "https://www.nostrohub.com.br",
];
function cors(origem: string | null) {
  const ok = origem && (ORIGENS.includes(origem) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem));
  return {
    "Access-Control-Allow-Origin": ok ? origem! : ORIGENS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
    ok: !!ok,
  };
}

Deno.serve(async (req) => {
  const { ok, ...h } = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!ok) return json({ erro: "origem não permitida" }, 403);

  const chave = (Deno.env.get("AZURE_SPEECH_KEY") || "").trim().split(/\s+/)[0];
  const regiao = (Deno.env.get("AZURE_SPEECH_REGION") || "brazilsouth").trim();
  if (!chave) return json({ erro: "AZURE_SPEECH_KEY não configurada" }, 500);

  const tipo = (req.headers.get("content-type") || "audio/webm").split(";")[0].trim();
  const audio = await req.arrayBuffer();
  if (audio.byteLength < 800) return json({ texto: "" });
  if (audio.byteLength > 15 * 1024 * 1024) return json({ erro: "áudio grande demais" }, 413);
  const ext = /mp4|m4a|aac/.test(tipo) ? "m4a" : /ogg/.test(tipo) ? "ogg" : /wav/.test(tipo) ? "wav" : /mpeg|mp3/.test(tipo) ? "mp3" : "webm";

  // transcrição rápida (aceita webm, m4a, ogg, mp3, wav e áudios longos)
  try {
    const fd = new FormData();
    fd.append("audio", new Blob([audio], { type: tipo }), "audio." + ext);
    fd.append("definition", JSON.stringify({ locales: ["pt-BR"] }));
    const r = await fetch(`https://${regiao}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": chave }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) console.log("transcrição rápida falhou:", r.status, JSON.stringify(j).slice(0, 300));
    const t = (j.combinedPhrases || []).map((p: any) => p.text).join(" ").trim();
    if (t || r.ok) return json({ texto: t });
  } catch (e) { console.log("transcrição rápida erro:", String(e).slice(0, 200)); }

  // plano B para ogg/wav curtos (até 60 s)
  if (ext === "ogg" || ext === "wav") {
    const ct = ext === "wav" ? "audio/wav; codecs=audio/pcm; samplerate=16000" : "audio/ogg; codecs=opus";
    const r2 = await fetch(`https://${regiao}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=pt-BR`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": chave, "Content-Type": ct }, body: audio });
    const j2 = await r2.json().catch(() => ({}));
    if (r2.ok) return json({ texto: String(j2.DisplayText || "").trim() });
  }
  return json({ erro: "não consegui entender o áudio" }, 502);
});
