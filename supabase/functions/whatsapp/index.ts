// WhatsApp da Vanessa: recebe as mensagens do Jonathan (texto ou áudio), pede a resposta para a função "agente" e responde.
// Só responde números cadastrados na tabela wa_permitidos. A Meta assina cada chamada com a chave do app (META_APP_SECRET).
// Áudio vira texto pelo Azure (o mesmo AZURE_SPEECH_KEY da voz). O token da Meta vem da tabela meta_conta (o mesmo do Facebook).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const URL_SB = Deno.env.get("SUPABASE_URL") || "";
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SEGREDO_APP = (Deno.env.get("META_APP_SECRET") || "").trim();
const VERIFICA = (Deno.env.get("WA_VERIFY_TOKEN") || "vanessa-nostro-wa-7c41").trim();
const NUMERO_ID = (Deno.env.get("WA_PHONE_ID") || "1496253523567167").trim();
const API = "https://graph.facebook.com/v23.0";

const db = (caminho: string, o: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${caminho}`, { ...o, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", ...(o.headers || {}) } });

async function assinaturaOk(corpo: string, cab: string | null) {
  if (!SEGREDO_APP) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO_APP), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(corpo)));
  const esperado = "sha256=" + Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!cab || cab.length !== esperado.length) return false;
  let dif = 0; for (let i = 0; i < cab.length; i++) dif |= cab.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

let TK: { t: string; ate: number } | null = null;
async function token() {
  if (TK && TK.ate > Date.now()) return TK.t;
  const r = await db("meta_conta?id=eq.1&select=token");
  const t = ((await r.json().catch(() => [])) as any[])[0]?.token || "";
  TK = { t, ate: Date.now() + 10 * 60000 };
  return t;
}
async function wa(corpo: Record<string, unknown>) {
  const r = await fetch(`${API}/${NUMERO_ID}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) console.log("erro ao enviar no WhatsApp:", j.error?.message || r.status);
  return j;
}
function pedacos(t: string, max = 3900) {
  const out: string[] = []; let resto = t.trim();
  while (resto.length > max) { let i = resto.lastIndexOf("\n", max); if (i < max * .5) i = resto.lastIndexOf(" ", max); if (i < 1) i = max; out.push(resto.slice(0, i).trim()); resto = resto.slice(i).trim(); }
  if (resto) out.push(resto);
  return out;
}
async function envia(para: string, texto: string) { for (const p of pedacos(texto)) await wa({ to: para, type: "text", text: { body: p, preview_url: false } }); }

/* ---------- áudio para texto (Azure) ---------- */
async function transcreve(mediaId: string): Promise<string> {
  const tk = await token();
  const info = await (await fetch(`${API}/${mediaId}`, { headers: { Authorization: `Bearer ${tk}` } })).json().catch(() => ({}));
  if (!info.url) throw new Error("não consegui baixar o áudio");
  const audio = await (await fetch(info.url, { headers: { Authorization: `Bearer ${tk}` } })).arrayBuffer();
  const chave = (Deno.env.get("AZURE_SPEECH_KEY") || "").trim().split(/\s+/)[0];
  const regiao = (Deno.env.get("AZURE_SPEECH_REGION") || "brazilsouth").trim();
  // transcrição rápida (aceita áudios longos)
  try {
    const fd = new FormData();
    fd.append("audio", new Blob([audio], { type: info.mime_type || "audio/ogg" }), "audio.ogg");
    fd.append("definition", JSON.stringify({ locales: ["pt-BR"] }));
    const r = await fetch(`https://${regiao}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": chave }, body: fd });
    const j = await r.json().catch(() => ({}));
    const t = (j.combinedPhrases || []).map((p: any) => p.text).join(" ").trim();
    if (t) return t;
  } catch (_e) { /* tenta o outro jeito */ }
  // áudio curto (até 60 s)
  const r2 = await fetch(`https://${regiao}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=pt-BR`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": chave, "Content-Type": "audio/ogg; codecs=opus" }, body: audio });
  const j2 = await r2.json().catch(() => ({}));
  return String(j2.DisplayText || "").trim();
}

/* ---------- conversa ---------- */
async function atende(m: any, nomeContato: string) {
  const de = String(m.from || "");
  const reg = await db(`wa_permitidos?numero=eq.${encodeURIComponent(de)}&select=pessoa,nome`);
  const perm = ((await reg.json().catch(() => [])) as any[])[0];
  // guarda tudo (inclusive de quem não está liberado), sem repetir a mesma mensagem
  const guarda = (quem: string, texto: string, id: string | null = null) => db("wa_mensagens?on_conflict=wamid", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ wamid: id, numero: de, quem, texto: texto.slice(0, 8000) }) });
  if (!perm) { await guarda("x", `[${m.type}] ${nomeContato}: ${m.text?.body || ""}`.slice(0, 500), m.id); return; }

  await wa({ status: "read", message_id: m.id, typing_indicator: { type: "text" } });
  let texto = "";
  if (m.type === "text") texto = String(m.text?.body || "");
  else if (m.type === "audio") {
    try { texto = await transcreve(m.audio?.id); } catch (_e) { texto = ""; }
    if (!texto) { await envia(de, "Não consegui entender esse áudio. Pode mandar de novo ou escrever?"); return; }
  } else if (m.type === "interactive") texto = String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "");
  else if (m.type === "button") texto = String(m.button?.text || "");
  else { await envia(de, "Por enquanto eu entendo só texto e áudio por aqui."); return; }
  if (!texto.trim()) return;

  const nova = await guarda("u", (m.type === "audio" ? "(áudio) " : "") + texto, m.id);
  if (nova.ok && ((await nova.json().catch(() => [])) as any[]).length === 0) return; // a Meta mandou de novo: já respondida

  // conversa recente pelo WhatsApp (últimas 12 horas)
  const desde = new Date(Date.now() - 12 * 3600e3).toISOString();
  const h = await db(`wa_mensagens?numero=eq.${encodeURIComponent(de)}&quem=in.(u,a)&criado_em=gte.${encodeURIComponent(desde)}&order=criado_em.desc&limit=14&select=quem,texto,criado_em`);
  const hist = ((await h.json().catch(() => [])) as any[]).reverse();
  const mensagens = hist.map((x) => ({ role: x.quem === "a" ? "assistant" : "user", content: String(x.texto).replace(/^\(áudio\) /, "") }));
  const inicio = hist[0]?.criado_em || new Date().toISOString();

  // a memória da Vanessa é a mesma da janela de voz
  const mem = (quem: string, t: string) => db("escritorio_memoria", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ agente: "calebe", pessoa: perm.pessoa, quem, texto: ("[WhatsApp] " + t).slice(0, 1200) }) });
  await mem("u", texto);

  let resp: any = {};
  try {
    const r = await fetch(`${URL_SB}/functions/v1/agente`, { method: "POST", headers: { "Content-Type": "application/json", "x-segredo": CHAVE, Authorization: `Bearer ${CHAVE}` },
      body: JSON.stringify({ agente: "calebe", canal: "whatsapp", pessoa: perm.pessoa, interlocutor: perm.nome || "Jonathan", sala: "WhatsApp", inicio, mensagens }) });
    resp = await r.json().catch(() => ({}));
  } catch (_e) { resp = {}; }
  const fala = String(resp.texto || "").trim();
  const telas: any[] = Array.isArray(resp.telas) ? resp.telas : [];
  if (!fala && !telas.length) { await envia(de, "Deu um problema aqui do meu lado. Tenta de novo daqui a pouquinho?"); return; }
  if (fala) await envia(de, fala);
  for (const t of telas) await envia(de, `*${String(t.titulo || "").trim()}*\n\n${String(t.texto || "").trim()}`);
  const registro = fala + telas.map((t) => `\n\n(Mandei no WhatsApp, "${t.titulo}":)\n${t.texto}`).join("");
  await guarda("a", registro);
  await mem("a", registro);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFICA) return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
    // configuração única: liga o webhook do app e inscreve a conta do WhatsApp (temporário)
    if (url.searchParams.get("acao") === "configurar" && url.searchParams.get("k") === "cfg-9f2e81") {
      const out: Record<string, unknown> = {};
      const app = await fetch(`${API}/1842874776758650/subscriptions`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: `1842874776758650|${SEGREDO_APP}`, object: "whatsapp_business_account", callback_url: `${URL_SB}/functions/v1/whatsapp`, verify_token: VERIFICA, fields: "messages" }) });
      out.webhook = await app.json().catch(() => app.status);
      const waba = await fetch(`${API}/1840438010331469/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${await token()}` } });
      out.conta = await waba.json().catch(() => waba.status);
      return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") return new Response("método", { status: 405 });
  const corpo = await req.text();
  if (!(await assinaturaOk(corpo, req.headers.get("x-hub-signature-256")))) return new Response("assinatura", { status: 401 });
  let j: any = {};
  try { j = JSON.parse(corpo); } catch { return new Response("ok"); }
  const tarefas: Promise<unknown>[] = [];
  for (const e of j.entry || []) for (const c of e.changes || []) {
    const v = c.value || {};
    const nomes: Record<string, string> = {};
    for (const ct of v.contacts || []) nomes[ct.wa_id] = ct.profile?.name || "";
    for (const st of v.statuses || []) console.log("status WhatsApp:", st.status, st.recipient_id, JSON.stringify(st.errors || []));
    for (const m of v.messages || []) tarefas.push(atende(m, nomes[m.from] || "").catch((err) => console.log("erro:", String(err))));
  }
  // responde na hora para a Meta e continua trabalhando em segundo plano
  if (tarefas.length) EdgeRuntime.waitUntil(Promise.all(tarefas));
  return new Response("ok", { status: 200 });
});
