// Instagram do Jonathan (@jonathanandrade.nostro) para a Vanessa: números, comentários, Direct e publicação.
// Usa a API oficial da Meta (login unificado: graph.facebook.com com o id da conta do Instagram). Só a função "agente" chama (cabeçalho x-segredo).
// O token vem do segredo IG_TOKEN (token de usuário do sistema, não expira); fica guardado na tabela ig_conta.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL") || "";
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// o token pode ser do login do Instagram (começa com IG, API graph.instagram.com) ou do login unificado da Meta
// (começa com EAA, API graph.facebook.com com o id da conta do Instagram). O código se ajusta sozinho.
const IG_ID = (Deno.env.get("IG_USER_ID") || "17841401588713878").trim();
let API = "https://graph.instagram.com", EU = "me", FB = false;

const db = (caminho: string, o: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${caminho}`, { ...o, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", ...(o.headers || {}) } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/* ---------- token (renova a cada 5 dias; vale 60) ---------- */
let MEM: { token: string; ate: number } | null = null;
async function token(): Promise<string> {
  if (MEM && MEM.ate > Date.now()) return MEM.token;
  const r = await db("ig_conta?id=eq.1&select=token,renovado_em,base");
  let linha = ((await r.json().catch(() => [])) as any[])[0];
  const env = (Deno.env.get("IG_TOKEN") || "").trim().split(/\s+/)[0];
  const base = env.slice(-12);
  if (env && linha && linha.base !== base) linha = null; // o Jonathan colocou um token novo no segredo
  let tk = linha?.token || env;
  if (!tk) throw new Error("O Instagram ainda não foi conectado. Falta o token no segredo IG_TOKEN do Supabase.");
  const guarda = (t: string, quando: string) => db("ig_conta", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: 1, token: t, renovado_em: quando, base }) });
  if (!linha) await guarda(tk, new Date().toISOString());
  else if (!tk.startsWith("EAA") && Date.now() - new Date(linha.renovado_em).getTime() > 5 * 864e5) {
    const n = await fetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(tk)}`);
    const j = await n.json().catch(() => ({}));
    if (n.ok && j.access_token) { tk = j.access_token; await guarda(tk, new Date().toISOString()); }
  }
  FB = tk.startsWith("EAA");
  API = FB ? "https://graph.facebook.com/v23.0" : "https://graph.instagram.com";
  EU = FB ? IG_ID : "me";
  MEM = { token: tk, ate: Date.now() + 30 * 60000 };
  return tk;
}
async function ig(caminho: string, params: Record<string, string> = {}, metodo = "GET") {
  const q = new URLSearchParams({ ...params, access_token: await token() });
  const r = metodo === "GET" ? await fetch(`${API}/${caminho}?${q}`) : await fetch(`${API}/${caminho}`, { method: metodo, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("O Instagram respondeu: " + (j.error?.message || r.status));
  return j;
}
const curto = (t: unknown, n = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/* ---------- leitura ---------- */
async function perfil() {
  await token();
  const p = await ig(EU, { fields: "username,name,followers_count,follows_count,media_count" });
  const m = await ig(`${EU}/media`, { fields: "id,caption,media_type,timestamp,permalink,like_count,comments_count", limit: "10" });
  return { usuario: "@" + p.username, nome: p.name, seguidores: p.followers_count, seguindo: p.follows_count, posts: p.media_count,
    ultimos_posts: (m.data || []).map((x: any) => ({ id: x.id, tipo: x.media_type, data: String(x.timestamp).slice(0, 10), legenda: curto(x.caption, 120), curtidas: x.like_count, comentarios: x.comments_count, link: x.permalink })) };
}
async function numeros(a: any) {
  const dias = Math.min(30, Math.max(1, Math.round(+a.dias || 7)));
  const ate = Math.floor(Date.now() / 1000), desde = ate - dias * 86400;
  const out: any = { periodo: `últimos ${dias} dias` };
  for (const metrica of ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "follows_and_unfollows", "profile_links_taps"]) {
    try {
      await token();
      const r = await ig(`${EU}/insights`, { metric: metrica, period: "day", metric_type: "total_value", since: String(desde), until: String(ate) });
      const v = r.data?.[0]?.total_value;
      out[metrica] = v?.breakdowns ? v.breakdowns : v?.value ?? null;
    } catch (e) { out._falha = String((e as Error).message); /* métrica não disponível para esta conta */ }
  }
  if (Object.keys(out).length === 2 && out._falha) return { erro: out._falha.includes("permission") ? "Falta a permissão de números do Instagram: o Jonathan precisa gerar um token novo na Meta e trocar o IG_TOKEN." : out._falha };
  delete out._falha;
  return out;
}
async function numerosPost(a: any) {
  const id = String(a.post_id || "").replace(/\D/g, "");
  if (!id) return { erro: "Falta o id do post (vem do perfil)." };
  const out: any = {};
  for (const metrica of ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"]) {
    try { const r = await ig(`${id}/insights`, { metric: metrica }); out[metrica] = r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value ?? null; } catch (_e) { /* não disponível */ }
  }
  return out;
}
async function comentarios(a: any) {
  let ids: string[] = [];
  if (a.post_id) ids = [String(a.post_id).replace(/\D/g, "")];
  else { await token(); ids = ((await ig(`${EU}/media`, { fields: "id", limit: String(Math.min(10, Math.max(1, +a.ultimos_posts || 5))) })).data || []).map((x: any) => x.id); }
  const res: any[] = [];
  for (const id of ids) {
    const c = await ig(`${id}/comments`, { fields: "id,text,username,timestamp,replies{id,text,username}", limit: "20" });
    for (const x of c.data || []) res.push({ post_id: id, comentario_id: x.id, de: "@" + x.username, texto: curto(x.text, 200), data: String(x.timestamp).slice(0, 16).replace("T", " "), respostas: (x.replies?.data || []).length });
  }
  return { comentarios: res.slice(0, 40) };
}
async function directs(a: any) {
  await token();
  const c = await ig(`${EU}/conversations`, { platform: "instagram", fields: "id,updated_time,participants,messages.limit(" + Math.min(10, Math.max(1, +a.mensagens || 3)) + "){message,from,created_time}", limit: String(Math.min(15, Math.max(1, +a.conversas || 8))) });
  const eu = (await ig(EU, { fields: "username" }));
  return { conversas: (c.data || []).map((x: any) => {
    const outro = (x.participants?.data || []).find((p: any) => p.username !== eu.username) || {};
    return { usuario_id: outro.id, com: "@" + (outro.username || "?"), atualizada: String(x.updated_time || "").slice(0, 16).replace("T", " "),
      mensagens: (x.messages?.data || []).map((m: any) => ({ de: m.from?.username === eu.username ? "Jonathan" : "@" + (m.from?.username || "?"), texto: curto(m.message, 300), quando: String(m.created_time || "").slice(0, 16).replace("T", " ") })) };
  }) };
}

/* ---------- ações (a Vanessa só usa com a ordem do Jonathan) ---------- */
async function responderComentario(a: any) {
  const id = String(a.comentario_id || "").replace(/\D/g, ""), texto = curto(a.texto, 2000);
  if (!id || !texto) return { erro: "Falta o comentário ou o texto da resposta." };
  const r = await ig(`${id}/replies`, { message: texto }, "POST");
  return { ok: true, resposta_id: r.id };
}
async function responderDirect(a: any) {
  const id = String(a.usuario_id || "").replace(/\D/g, ""), texto = curto(a.texto, 1000);
  if (!id || !texto) return { erro: "Falta a pessoa ou o texto." };
  const tk = await token();
  const r = await fetch(`${API}/${EU}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ recipient: { id }, message: { text: texto } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) return { erro: "O Instagram não deixou enviar: " + (j.error?.message || r.status) + ". Pela regra da Meta, só dá para responder quem mandou mensagem nas últimas 24 horas." };
  return { ok: true };
}
async function esperaPronto(id: string) {
  for (let i = 0; i < 30; i++) {
    const s = await ig(id, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("O Instagram não conseguiu processar o arquivo.");
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("O vídeo ainda está processando no Instagram; tente publicar de novo em alguns minutos.");
}
async function publicar(a: any) {
  const urls: string[] = (Array.isArray(a.urls) ? a.urls : [a.urls]).map((u: any) => String(u || "").trim()).filter((u: string) => /^https:\/\//.test(u));
  const legenda = String(a.legenda || "").slice(0, 2200), tipo = String(a.tipo || (urls.length > 1 ? "carrossel" : "foto"));
  if (!urls.length) return { erro: "Falta o arquivo. Ele precisa estar num link público (use drive_link_publico para arquivos do Drive)." };
  await token();
  let criacao = "";
  if (tipo === "reels") {
    criacao = (await ig(`${EU}/media`, { media_type: "REELS", video_url: urls[0], caption: legenda }, "POST")).id;
    await esperaPronto(criacao);
  } else if (tipo === "carrossel" && urls.length > 1) {
    const filhos: string[] = [];
    for (const u of urls.slice(0, 10)) {
      const video = /\.(mp4|mov)(\?|$)/i.test(u);
      const f = (await ig(`${EU}/media`, video ? { media_type: "VIDEO", video_url: u, is_carousel_item: "true" } : { image_url: u, is_carousel_item: "true" }, "POST")).id;
      if (video) await esperaPronto(f);
      filhos.push(f);
    }
    criacao = (await ig(`${EU}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda }, "POST")).id;
  } else {
    criacao = (await ig(`${EU}/media`, { image_url: urls[0], caption: legenda }, "POST")).id;
  }
  const pub = await ig(`${EU}/media_publish`, { creation_id: criacao }, "POST");
  const info = await ig(pub.id, { fields: "permalink" }).catch(() => ({}));
  return { ok: true, post_id: pub.id, link: (info as any).permalink || "" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!CHAVE || req.headers.get("x-segredo") !== CHAVE) return json({ erro: "sem permissão" }, 403);
  let c: any;
  try { c = await req.json(); } catch { return json({ erro: "json" }, 400); }
  const f = String(c.ferramenta || ""), a = c.args || {};
  try {
    if (f === "ig_perfil") return json(await perfil());
    if (f === "ig_numeros") return json(await numeros(a));
    if (f === "ig_numeros_post") return json(await numerosPost(a));
    if (f === "ig_comentarios") return json(await comentarios(a));
    if (f === "ig_directs") return json(await directs(a));
    if (f === "ig_responder_comentario") return json(await responderComentario(a));
    if (f === "ig_responder_direct") return json(await responderDirect(a));
    if (f === "ig_publicar") return json(await publicar(a));
    return json({ erro: "ferramenta desconhecida" });
  } catch (e) { return json({ erro: String((e as Error).message || e) }); }
});
