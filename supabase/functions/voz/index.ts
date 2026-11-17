// Voz dos agentes da Nostro: transforma o texto em áudio MP3 com as vozes neurais da Microsoft (Azure Speech).
// Segredos no Supabase: AZURE_SPEECH_KEY (obrigatório) e AZURE_SPEECH_REGION (padrão: brazilsouth).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGENS = [
  "https://santosandradejonathan-rgb.github.io",
  "https://nostrohub.com.br",
  "https://www.nostrohub.com.br",
];
// voz de cada agente (dá para trocar sem mexer no código com o segredo VOZES_AGENTES em JSON)
const PADRAO: Record<string, { voz: string; ritmo: string; tom: string }> = {
  josue: { voz: "pt-BR-AntonioNeural", ritmo: "+4%", tom: "-2%" },
  calebe: { voz: "pt-BR-DonatoNeural", ritmo: "+6%", tom: "+0%" },
  camila: { voz: "pt-BR-ThalitaNeural", ritmo: "+5%", tom: "+0%" },
  fernanda: { voz: "pt-BR-FranciscaNeural", ritmo: "+2%", tom: "+0%" },
};

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
const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

Deno.serve(async (req) => {
  const { ok, ...h } = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!ok) return json({ erro: "origem não permitida" }, 403);

  const chave = (Deno.env.get("AZURE_SPEECH_KEY") || "").trim().split(/\s+/)[0];
  const regiao = (Deno.env.get("AZURE_SPEECH_REGION") || "brazilsouth").trim();
  if (!chave) return json({ erro: "AZURE_SPEECH_KEY não configurada", semVoz: true }, 503);

  let corpo: any;
  try { corpo = await req.json(); } catch { return json({ erro: "json" }, 400); }
  let mapa = PADRAO;
  try { const extra = JSON.parse(Deno.env.get("VOZES_AGENTES") || "{}"); mapa = { ...PADRAO, ...extra }; } catch { /* usa o padrão */ }
  const cfg = mapa[String(corpo.agente || "")] || PADRAO.josue;
  // permite testar outra voz (só vozes neurais em português do Brasil)
  const voz = /^pt-BR-[A-Za-z]+Neural$/.test(String(corpo.voz || "")) ? String(corpo.voz) : cfg.voz;
  const texto = String(corpo.texto || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!texto) return json({ erro: "sem texto" }, 400);

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR"><voice name="${voz}"><prosody rate="${cfg.ritmo}" pitch="${cfg.tom}">${xml(texto)}</prosody></voice></speak>`;
  let r: Response;
  try {
    r = await fetch(`https://${regiao}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": chave,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "nostro-escritorio",
      },
      body: ssml,
    });
  } catch (_e) {
    return json({ erro: "não consegui falar com o Azure" }, 502);
  }
  if (!r.ok) return json({ erro: "Azure recusou", status: r.status, detalhe: (await r.text().catch(() => "")).slice(0, 200) }, 502);
  return new Response(r.body, { headers: { ...h, "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voz": voz } });
});
