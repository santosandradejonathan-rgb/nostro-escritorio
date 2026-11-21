// Facebook (páginas) e Gerenciador de Anúncios da Nostro para a Vanessa. Só a função "agente" chama (cabeçalho x-segredo).
// Segredos: META_TOKEN (token de usuário do Jonathan, gerado no Explorador da Graph API) e META_APP_SECRET (chave do app).
// O token curto é trocado por um de 60 dias e fica guardado na tabela meta_conta. Toda alteração fica registrada em meta_acoes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL") || "";
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_ID = "1842874776758650";
const API = "https://graph.facebook.com/v23.0";

const db = (caminho: string, o: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${caminho}`, { ...o, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", ...(o.headers || {}) } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const curto = (t: unknown, n = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const norm = (t: string) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const reais = (centavos: unknown) => centavos == null || centavos === "" ? null : Math.round(+centavos) / 100;

/* ---------- token do usuário (60 dias) ---------- */
let MEM: { token: string; expira: number; ate: number } | null = null;
async function token(): Promise<string> {
  if (MEM && MEM.ate > Date.now()) return MEM.token;
  const r = await db("meta_conta?id=eq.1&select=token,expira_em,base");
  let linha = ((await r.json().catch(() => [])) as any[])[0];
  const env = (Deno.env.get("META_TOKEN") || "").trim().split(/\s+/)[0];
  const base = env.slice(-12);
  if (env && linha && linha.base !== base) linha = null; // token novo colado no segredo
  if (!linha) {
    if (!env) throw new Error("O Facebook ainda não foi conectado. Falta o segredo META_TOKEN no Supabase.");
    const sec = (Deno.env.get("META_APP_SECRET") || "").trim();
    let tk = env, expira = Date.now() + 3600e3;
    if (sec) {
      const t = await fetch(`${API}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: sec, fb_exchange_token: env })}`);
      const j = await t.json().catch(() => ({}));
      if (t.ok && j.access_token) { tk = j.access_token; expira = Date.now() + (+j.expires_in || 60 * 86400) * 1000; }
      else throw new Error("Não consegui transformar o token em acesso de 60 dias (" + (j.error?.message || t.status) + "). Talvez o token de 1 hora já tenha vencido: gere outro no Explorador da Graph API e troque o META_TOKEN.");
    }
    await db("meta_conta", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: 1, token: tk, expira_em: new Date(expira).toISOString(), base }) });
    linha = { token: tk, expira_em: new Date(expira).toISOString() };
  }
  // token ainda curto (ou perto de vencer) e já tem a chave do app: troca por um de 60 dias
  const sec2 = (Deno.env.get("META_APP_SECRET") || "").trim();
  if (sec2 && new Date(linha.expira_em).getTime() - Date.now() < 3 * 864e5 && new Date(linha.expira_em).getTime() > Date.now()) {
    const t = await fetch(`${API}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: sec2, fb_exchange_token: linha.token })}`);
    const j = await t.json().catch(() => ({}));
    if (t.ok && j.access_token) {
      linha = { token: j.access_token, expira_em: new Date(Date.now() + (+j.expires_in || 60 * 86400) * 1000).toISOString() };
      await db("meta_conta?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ token: linha.token, expira_em: linha.expira_em }) });
    }
  }
  MEM = { token: linha.token, expira: new Date(linha.expira_em).getTime(), ate: Date.now() + 20 * 60000 };
  return linha.token;
}
async function g(caminho: string, params: Record<string, string> = {}, metodo = "GET", tk?: string) {
  const q = new URLSearchParams({ ...params, access_token: tk || await token() });
  const r = metodo === "GET" ? await fetch(`${API}/${caminho}?${q}`) : await fetch(`${API}/${caminho}`, { method: metodo, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const m = j.error?.message || String(r.status);
    if (j.error?.code === 190) { MEM = null; throw new Error("O acesso ao Facebook venceu ou foi removido. O Jonathan precisa gerar um token novo no Explorador da Graph API e trocar o META_TOKEN."); }
    throw new Error("O Facebook respondeu: " + m);
  }
  return j;
}
const registra = (ferramenta: string, alvo: string, antes: string, depois: string, ok: boolean, detalhe = "") =>
  db("meta_acoes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ferramenta, alvo, antes, depois, ok, detalhe: detalhe.slice(0, 500) }) }).catch(() => {});

/* ---------- páginas ---------- */
let PAGS: { ate: number; lista: any[] } | null = null;
async function paginas(): Promise<any[]> {
  if (PAGS && PAGS.ate > Date.now()) return PAGS.lista;
  const lista: any[] = [];
  const vistos = new Set<string>();
  let url = "me/accounts", p: Record<string, string> = { fields: "id,name,access_token,fan_count,followers_count,category", limit: "100" };
  for (let i = 0; i < 5; i++) {
    const r = await g(url, p);
    for (const x of r.data || []) if (!vistos.has(x.id)) { vistos.add(x.id); lista.push(x); }
    if (!r.paging?.cursors?.after || !r.paging?.next) break;
    p = { ...p, after: r.paging.cursors.after };
  }
  // páginas que o Jonathan acessa só pelos portfólios empresariais
  try {
    const b = await g("me/businesses", { fields: "id,name", limit: "50" });
    for (const neg of b.data || []) {
      for (const borda of ["owned_pages", "client_pages"]) {
        try {
          const r = await g(`${neg.id}/${borda}`, { fields: "id,name,access_token,fan_count,followers_count,category", limit: "100" });
          for (const x of r.data || []) if (!vistos.has(x.id) && x.access_token) { vistos.add(x.id); lista.push(x); }
        } catch (_e) { /* sem acesso a essa lista */ }
      }
    }
  } catch (_e) { /* sem portfólios */ }
  PAGS = { ate: Date.now() + 20 * 60000, lista };
  return lista;
}
async function pagina(nome: string) {
  const lista = await paginas();
  if (!lista.length) throw new Error("Não achei nenhuma página do Facebook liberada para a Vanessa.");
  const n = norm(nome);
  if (!n) { if (lista.length === 1) return lista[0]; throw new Error("Diga qual página. Opções: " + lista.map((x) => x.name).join(", ")); }
  const exata = lista.find((x) => norm(x.name) === n || x.id === nome);
  if (exata) return exata;
  const parecidas = lista.filter((x) => norm(x.name).includes(n) || n.includes(norm(x.name)) || n.split(" ").every((p) => norm(x.name).includes(p)));
  if (parecidas.length === 1) return parecidas[0];
  if (parecidas.length > 1) throw new Error(`Achei mais de uma página parecida com "${nome}": ${parecidas.map((x) => x.name).join(", ")}. Qual delas?`);
  throw new Error(`Não achei a página "${nome}". Páginas liberadas: ${lista.map((x) => x.name).join(", ")}.`);
}

async function fbPaginas() {
  const l = await paginas();
  return { total: l.length, paginas: l.map((x) => ({ nome: x.name, id: x.id, seguidores: x.followers_count ?? x.fan_count ?? null, categoria: x.category })) };
}
async function fbPosts(a: any) {
  const p = await pagina(a.pagina);
  const r = await g(`${p.id}/posts`, { fields: "id,message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)", limit: String(Math.min(15, Math.max(1, +a.quantidade || 8))) }, "GET", p.access_token);
  return { pagina: p.name, posts: (r.data || []).map((x: any) => ({ id: x.id, data: String(x.created_time).slice(0, 10), texto: curto(x.message, 120), reacoes: x.reactions?.summary?.total_count ?? null, comentarios: x.comments?.summary?.total_count ?? null, compartilhamentos: x.shares?.count ?? 0, link: x.permalink_url })) };
}
async function fbNumeros(a: any) {
  const p = await pagina(a.pagina);
  const dias = Math.min(30, Math.max(1, Math.round(+a.dias || 7)));
  const ate = Math.floor(Date.now() / 1000), desde = ate - dias * 86400;
  const out: any = { pagina: p.name, periodo: `últimos ${dias} dias`, seguidores: p.followers_count ?? p.fan_count ?? null };
  const nomes: Record<string, string> = { page_impressions_unique: "alcance", page_total_media_view_unique: "alcance", page_media_view: "visualizacoes", page_post_engagements: "engajamento_posts", page_views_total: "visitas_ao_perfil", page_daily_follows_unique: "novos_seguidores", page_follows: "seguidores_total" };
  for (const m of Object.keys(nomes)) {
    if (out[nomes[m]] != null && m !== "page_follows") continue;
    try {
      const r = await g(`${p.id}/insights`, { metric: m, period: "day", since: String(desde), until: String(ate) }, "GET", p.access_token);
      const vals = (r.data?.[0]?.values || []).map((v: any) => +v.value || 0);
      if (!vals.length) continue;
      out[nomes[m]] = m === "page_follows" ? vals[vals.length - 1] : vals.reduce((s: number, v: number) => s + v, 0);
    } catch (_e) { /* métrica indisponível */ }
  }
  return out;
}
async function fbComentarios(a: any) {
  const p = await pagina(a.pagina);
  let ids: string[] = a.post_id ? [String(a.post_id)] : ((await g(`${p.id}/posts`, { fields: "id", limit: String(Math.min(10, Math.max(1, +a.ultimos_posts || 5))) }, "GET", p.access_token)).data || []).map((x: any) => x.id);
  ids = ids.map((x) => x.replace(/[^0-9_]/g, "")).filter(Boolean);
  const res: any[] = [];
  for (const id of ids) {
    const c = await g(`${id}/comments`, { fields: "id,message,from,created_time,comment_count", limit: "20", order: "reverse_chronological" }, "GET", p.access_token);
    for (const x of c.data || []) res.push({ post_id: id, comentario_id: x.id, de: x.from?.name || "?", texto: curto(x.message, 200), data: String(x.created_time).slice(0, 16).replace("T", " "), respostas: x.comment_count || 0 });
  }
  return { pagina: p.name, comentarios: res.slice(0, 40) };
}
async function fbMensagens(a: any) {
  const p = await pagina(a.pagina);
  const r = await g(`${p.id}/conversations`, { fields: "id,updated_time,participants,messages.limit(" + Math.min(10, Math.max(1, +a.mensagens || 3)) + "){message,from,created_time}", limit: String(Math.min(15, Math.max(1, +a.conversas || 8))) }, "GET", p.access_token);
  return { pagina: p.name, conversas: (r.data || []).map((x: any) => {
    const outro = (x.participants?.data || []).find((q: any) => q.id !== p.id) || {};
    return { usuario_id: outro.id, com: outro.name || "?", atualizada: String(x.updated_time || "").slice(0, 16).replace("T", " "),
      mensagens: (x.messages?.data || []).map((m: any) => ({ de: m.from?.id === p.id ? p.name : (m.from?.name || "?"), texto: curto(m.message, 300), quando: String(m.created_time || "").slice(0, 16).replace("T", " ") })) };
  }) };
}
async function fbResponderComentario(a: any) {
  const p = await pagina(a.pagina);
  const id = String(a.comentario_id || "").replace(/[^0-9_]/g, ""), texto = curto(a.texto, 2000);
  if (!id || !texto) return { erro: "Falta o comentário ou o texto." };
  const r = await g(`${id}/comments`, { message: texto }, "POST", p.access_token);
  await registra("fb_responder_comentario", `${p.name} ${id}`, "", texto, true);
  return { ok: true, pagina: p.name, resposta_id: r.id };
}
async function fbResponderMensagem(a: any) {
  const p = await pagina(a.pagina);
  const id = String(a.usuario_id || "").replace(/\D/g, ""), texto = curto(a.texto, 1500);
  if (!id || !texto) return { erro: "Falta a pessoa ou o texto." };
  const r = await fetch(`${API}/${p.id}/messages?access_token=${encodeURIComponent(p.access_token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id }, messaging_type: "RESPONSE", message: { text: texto } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { await registra("fb_responder_mensagem", `${p.name} ${id}`, "", texto, false, j.error?.message || ""); return { erro: "O Messenger não deixou enviar: " + (j.error?.message || r.status) + ". Pela regra da Meta, só dá para responder quem mandou mensagem nas últimas 24 horas." }; }
  await registra("fb_responder_mensagem", `${p.name} ${id}`, "", texto, true);
  return { ok: true, pagina: p.name };
}
async function fbPublicar(a: any) {
  const p = await pagina(a.pagina);
  const texto = String(a.texto || "").slice(0, 5000);
  const urls: string[] = (Array.isArray(a.urls) ? a.urls : a.urls ? [a.urls] : []).map((u: any) => String(u || "").trim()).filter((u: string) => /^https:\/\//.test(u));
  if (!texto && !urls.length) return { erro: "Falta o texto ou o arquivo do post." };
  const video = urls.length === 1 && /\.(mp4|mov)(\?|$)/i.test(urls[0]);
  let id = "";
  if (!urls.length) id = (await g(`${p.id}/feed`, { message: texto }, "POST", p.access_token)).id;
  else if (video) id = (await g(`${p.id}/videos`, { file_url: urls[0], description: texto }, "POST", p.access_token)).id;
  else if (urls.length === 1) id = (await g(`${p.id}/photos`, { url: urls[0], caption: texto }, "POST", p.access_token)).post_id || "";
  else {
    const fotos: string[] = [];
    for (const u of urls.slice(0, 10)) fotos.push((await g(`${p.id}/photos`, { url: u, published: "false" }, "POST", p.access_token)).id);
    const corpo: Record<string, string> = { message: texto };
    fotos.forEach((f, i) => (corpo[`attached_media[${i}]`] = JSON.stringify({ media_fbid: f })));
    id = (await g(`${p.id}/feed`, corpo, "POST", p.access_token)).id;
  }
  await registra("fb_publicar", p.name, "", `${texto.slice(0, 200)} | ${urls.length} arquivo(s)`, true, id);
  let link = "";
  try { link = id ? (await g(id, { fields: "permalink_url" }, "GET", p.access_token)).permalink_url || "" : ""; } catch (_e) { /* vídeo ainda processando */ }
  return { ok: true, pagina: p.name, post_id: id, link, aviso: video ? "Vídeo enviado; o Facebook pode levar alguns minutos para processar." : undefined };
}

/* ---------- anúncios ---------- */
let CONTAS: { ate: number; lista: any[] } | null = null;
async function contas(): Promise<any[]> {
  if (CONTAS && CONTAS.ate > Date.now()) return CONTAS.lista;
  const lista: any[] = [];
  let p: Record<string, string> = { fields: "id,name,account_status,currency,business_name,amount_spent", limit: "100" };
  for (let i = 0; i < 5; i++) {
    const r = await g("me/adaccounts", p);
    lista.push(...(r.data || []));
    if (!r.paging?.next) break;
    p = { ...p, after: r.paging.cursors.after };
  }
  CONTAS = { ate: Date.now() + 20 * 60000, lista };
  return lista;
}
const STATUS_CONTA: Record<number, string> = { 1: "ativa", 2: "desativada", 3: "pagamento pendente", 7: "em análise de risco", 8: "acerto pendente", 9: "em período de carência", 100: "fechamento pendente", 101: "fechada" };
async function conta(nome: string) {
  const lista = await contas();
  if (!lista.length) throw new Error("Não achei nenhuma conta de anúncios liberada para a Vanessa.");
  const n = norm(nome);
  if (!n) throw new Error("Diga qual conta de anúncios (nome do cliente).");
  const id = String(nome).replace(/\D/g, "");
  const exata = lista.find((x) => norm(x.name) === n || (id.length > 6 && x.id === "act_" + id));
  if (exata) return exata;
  const parecidas = lista.filter((x) => { const t = norm(x.name + " " + (x.business_name || "")); return t.includes(n) || n.split(" ").every((p) => t.includes(p)); });
  if (parecidas.length === 1) return parecidas[0];
  if (parecidas.length > 1) throw new Error(`Achei mais de uma conta parecida com "${nome}": ${parecidas.map((x) => x.name).join(", ")}. Qual delas?`);
  throw new Error(`Não achei a conta de anúncios "${nome}". Contas liberadas: ${lista.map((x) => x.name).join(", ")}.`);
}
const PERIODO: Record<string, string> = { hoje: "today", ontem: "yesterday", "7d": "last_7d", "14d": "last_14d", "30d": "last_30d", mes: "this_month", mes_passado: "last_month", maximo: "maximum" };
const ACOES: Record<string, string> = {
  lead: "leads", "onsite_conversion.lead_grouped": "leads", "onsite_conversion.messaging_conversation_started_7d": "conversas_iniciadas",
  link_click: "cliques_no_link", landing_page_view: "visitas_a_pagina", purchase: "compras", "offsite_conversion.fb_pixel_purchase": "compras",
  "onsite_conversion.post_save": "salvamentos", video_view: "visualizacoes_3s", "offsite_conversion.fb_pixel_lead": "leads_no_site",
};
function resumoLinha(x: any) {
  const o: any = { gasto: x.spend != null ? +(+x.spend).toFixed(2) : 0, alcance: x.reach != null ? +x.reach : null, impressoes: x.impressions != null ? +x.impressions : null, cliques: x.clicks != null ? +x.clicks : null, ctr: x.ctr != null ? +(+x.ctr).toFixed(2) : null };
  for (const a of x.actions || []) if (ACOES[a.action_type] && o[ACOES[a.action_type]] == null) o[ACOES[a.action_type]] = +a.value;
  for (const a of x.cost_per_action_type || []) if (ACOES[a.action_type] && o["custo_por_" + ACOES[a.action_type]] == null) o["custo_por_" + ACOES[a.action_type]] = +(+a.value).toFixed(2);
  return o;
}
async function adsContas() {
  const l = await contas();
  return { total: l.length, contas: l.map((x) => ({ nome: x.name, id: x.id, empresa: x.business_name || "", situacao: STATUS_CONTA[x.account_status] || String(x.account_status), moeda: x.currency })) };
}
async function adsResultados(a: any) {
  const preset = PERIODO[String(a.periodo || "7d")] || "last_7d";
  const campos = "spend,reach,impressions,clicks,ctr,actions,cost_per_action_type";
  if (a.conta) {
    const c = await conta(a.conta);
    const total = (await g(`${c.id}/insights`, { fields: campos, date_preset: preset })).data?.[0];
    const camp = await g(`${c.id}/insights`, { fields: "campaign_id,campaign_name," + campos, date_preset: preset, level: "campaign", limit: "50", sort: "spend_descending" });
    return { conta: c.name, moeda: c.currency, periodo: a.periodo || "7d", total: total ? resumoLinha(total) : { gasto: 0 }, campanhas: (camp.data || []).slice(0, 15).map((x: any) => ({ campanha: x.campaign_name, id: x.campaign_id, ...resumoLinha(x) })) };
  }
  const ativas = (await contas()).filter((x) => x.account_status === 1).slice(0, 40);
  const res: any[] = [];
  await Promise.all(ativas.map(async (c) => {
    try { const t = (await g(`${c.id}/insights`, { fields: campos, date_preset: preset })).data?.[0]; if (t && +t.spend > 0) res.push({ conta: c.name, moeda: c.currency, ...resumoLinha(t) }); } catch (_e) { /* conta sem acesso a relatório */ }
  }));
  res.sort((x, y) => y.gasto - x.gasto);
  return { periodo: a.periodo || "7d", contas_com_gasto: res.length, contas: res };
}
async function adsCampanhas(a: any) {
  const c = await conta(a.conta);
  const filtro = a.status === "todas" ? ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "WITH_ISSUES", "IN_PROCESS", "PENDING_REVIEW", "DISAPPROVED"] : a.status === "pausadas" ? ["PAUSED"] : ["ACTIVE", "WITH_ISSUES", "IN_PROCESS", "PENDING_REVIEW"];
  const r = await g(`${c.id}/campaigns`, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,adsets.limit(25){id,name,status,effective_status,daily_budget,lifetime_budget}", effective_status: JSON.stringify(filtro), limit: "50" });
  return { conta: c.name, moeda: c.currency, campanhas: (r.data || []).map((x: any) => ({
    id: x.id, nome: x.name, status: x.effective_status, objetivo: x.objective,
    orcamento_diario: reais(x.daily_budget), orcamento_total: reais(x.lifetime_budget),
    conjuntos: (x.adsets?.data || []).map((s: any) => ({ id: s.id, nome: s.name, status: s.effective_status, orcamento_diario: reais(s.daily_budget), orcamento_total: reais(s.lifetime_budget) })),
  })) };
}
async function alvoAds(id: string) {
  const limpo = String(id || "").replace(/\D/g, "");
  if (!limpo) throw new Error("Falta o id da campanha ou do conjunto (vem do ads_campanhas).");
  return { id: limpo, info: await g(limpo, { fields: "name,status,effective_status,daily_budget,lifetime_budget,account_id" }) };
}
async function adsStatus(a: any) {
  const { id, info } = await alvoAds(a.id);
  const novo = a.acao === "ativar" ? "ACTIVE" : a.acao === "pausar" ? "PAUSED" : "";
  if (!novo) return { erro: "A ação precisa ser pausar ou ativar." };
  if (info.status === novo) return { ok: true, aviso: `"${info.name}" já estava ${novo === "ACTIVE" ? "ativa" : "pausada"}.` };
  try {
    await g(id, { status: novo }, "POST");
  } catch (e) { await registra("ads_status", `${info.name} (${id})`, info.status, novo, false, String((e as Error).message)); throw e; }
  await registra("ads_status", `${info.name} (${id})`, info.status, novo, true);
  return { ok: true, nome: info.name, antes: info.status, agora: novo };
}
async function adsOrcamento(a: any) {
  const { id, info } = await alvoAds(a.id);
  const valor = Math.round(+String(a.valor_diario || "").replace(",", ".") * 100);
  if (!(valor > 0)) return { erro: "Falta o novo orçamento diário em reais." };
  if (info.daily_budget == null) return { erro: info.lifetime_budget != null ? `"${info.name}" usa orçamento total, não diário; isso eu não altero.` : `"${info.name}" não tem orçamento próprio: o orçamento fica nos conjuntos de anúncios (ou na campanha). Use o id certo do ads_campanhas.` };
  const antes = +info.daily_budget;
  if (valor > antes * 3) return { erro: `Por segurança eu não aumento mais de 3 vezes de uma vez (hoje está R$ ${(antes / 100).toFixed(2)} por dia). Faça em etapas.` };
  try {
    await g(id, { daily_budget: String(valor) }, "POST");
  } catch (e) { await registra("ads_orcamento", `${info.name} (${id})`, String(antes / 100), String(valor / 100), false, String((e as Error).message)); throw e; }
  await registra("ads_orcamento", `${info.name} (${id})`, String(antes / 100), String(valor / 100), true);
  return { ok: true, nome: info.name, antes_reais_dia: antes / 100, agora_reais_dia: valor / 100 };
}

async function status() {
  await token();
  const dias = MEM ? Math.floor((MEM.expira - Date.now()) / 864e5) : null;
  const [p, c] = await Promise.all([paginas().catch(() => []), contas().catch(() => [])]);
  return { conectado: true, dias_para_vencer: dias, paginas: p.length, contas_de_anuncio: c.length, aviso: dias != null && dias < 7 ? "O acesso ao Facebook vence em menos de 7 dias: o Jonathan precisa gerar um token novo." : undefined };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!CHAVE || req.headers.get("x-segredo") !== CHAVE) return json({ erro: "sem permissão" }, 403);
  let c: any;
  try { c = await req.json(); } catch { return json({ erro: "json" }, 400); }
  const f = String(c.ferramenta || ""), a = c.args || {};
  try {
    const mapa: Record<string, (a: any) => Promise<unknown>> = {
      meta_status: status, fb_paginas: fbPaginas, fb_posts: fbPosts, fb_numeros: fbNumeros, fb_comentarios: fbComentarios, fb_mensagens: fbMensagens,
      fb_responder_comentario: fbResponderComentario, fb_responder_mensagem: fbResponderMensagem, fb_publicar: fbPublicar,
      ads_contas: adsContas, ads_resultados: adsResultados, ads_campanhas: adsCampanhas, ads_status: adsStatus, ads_orcamento: adsOrcamento,
    };
    if (!mapa[f]) return json({ erro: "ferramenta desconhecida" });
    const out: any = await mapa[f](a);
    if (MEM && MEM.expira - Date.now() < 7 * 864e5 && out && typeof out === "object") out._aviso_acesso = "O acesso ao Facebook vence em menos de 7 dias; avise o Jonathan.";
    return json(out);
  } catch (e) { return json({ erro: String((e as Error).message || e) }); }
});
