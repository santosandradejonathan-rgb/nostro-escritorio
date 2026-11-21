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

/* ---------- criar anúncio (sempre nasce PAUSADO; só roda quando o Jonathan aprovar e mandar ativar) ---------- */
const TETO_DIA = +(Deno.env.get("ADS_TETO_DIARIO") || "100"); // reais por dia; acima disso a Vanessa não cria
const CTA_OK = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "CONTACT_US", "BOOK_TRAVEL", "GET_QUOTE", "SUBSCRIBE", "APPLY_NOW", "DOWNLOAD", "WHATSAPP_MESSAGE", "MESSAGE_PAGE", "INSTAGRAM_MESSAGE", "CALL_NOW", "ORDER_NOW", "GET_OFFER"];
async function igDaPagina(p: any): Promise<string> {
  try { return (await g(p.id, { fields: "instagram_business_account" }, "GET", p.access_token)).instagram_business_account?.id || ""; } catch (_e) { return ""; }
}
const UF: Record<string, string> = { ac: "acre", al: "alagoas", ap: "amapa", am: "amazonas", ba: "bahia", ce: "ceara", df: "distrito federal", es: "espirito santo", go: "goias", ma: "maranhao", mt: "mato grosso", ms: "mato grosso do sul", mg: "minas gerais", pa: "para", pb: "paraiba", pr: "parana", pe: "pernambuco", pi: "piaui", rj: "rio de janeiro", rn: "rio grande do norte", rs: "rio grande do sul", ro: "rondonia", rr: "roraima", sc: "santa catarina", sp: "sao paulo", se: "sergipe", to: "tocantins" };
async function cidadesAlvo(nomes: string[], raio: number) {
  const out: any[] = [];
  for (const nome of nomes.slice(0, 10)) {
    const r = await g("search", { type: "adgeolocation", location_types: JSON.stringify(["city"]), q: nome.split(",")[0].trim(), country_code: "BR", limit: "5" });
    const lista = r.data || [];
    const uf = norm(nome.split(",")[1] || ""), estado = UF[uf] || uf;
    const achou = (estado ? lista.find((x: any) => norm(x.region || "") === estado) : null) || lista.find((x: any) => x.type === "city") || lista[0];
    if (!achou) throw new Error(`Não achei a cidade "${nome}" no Gerenciador de Anúncios.`);
    out.push({ key: achou.key, nome: `${achou.name}, ${achou.region}`, ...(raio ? { radius: raio, distance_unit: "kilometer" } : {}) });
  }
  return out;
}
async function sobeImagem(contaId: string, url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Não consegui baixar a imagem do anúncio.");
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const j = await g(`${contaId}/adimages`, { bytes: btoa(bin) }, "POST");
  const img: any = Object.values(j.images || {})[0];
  if (!img?.hash) throw new Error("O Facebook não aceitou a imagem.");
  return img.hash;
}
async function sobeVideo(contaId: string, url: string): Promise<{ id: string; capa: string }> {
  const v = await g(`${contaId}/advideos`, { file_url: url }, "POST");
  for (let i = 0; i < 24; i++) { // espera o Facebook processar (até uns 2 minutos)
    await new Promise((r) => setTimeout(r, 5000));
    const s = await g(v.id, { fields: "status,picture" }).catch(() => ({} as any));
    if (s.status?.video_status === "ready" && s.picture) return { id: v.id, capa: s.picture };
    if (s.status?.video_status === "error") throw new Error("O Facebook não conseguiu processar o vídeo.");
  }
  throw new Error("O vídeo ainda está processando no Facebook. Tente criar o anúncio de novo em alguns minutos.");
}
async function adsCriar(a: any) {
  const tipo = String(a.tipo || "");
  if (!["mensagens", "impulsionar", "trafego", "cadastro"].includes(tipo)) return { erro: "O tipo precisa ser mensagens, impulsionar, trafego ou cadastro." };
  const c = await conta(a.conta);
  if (c.account_status !== 1) return { erro: `A conta "${c.name}" não está ativa (${STATUS_CONTA[c.account_status] || c.account_status}).` };
  const p = await pagina(a.pagina);
  const dia = Math.round(+String(a.orcamento_diario || "").replace(",", ".") * 100);
  if (!(dia >= 600)) return { erro: "Falta o orçamento diário em reais (mínimo R$ 6 por dia)." };
  if (dia > TETO_DIA * 100) return { erro: `O teto combinado é R$ ${TETO_DIA} por dia por anúncio novo. Acima disso, o Jonathan faz direto no Gerenciador (ou muda o teto).` };
  const dias = Math.round(+a.dias || 0);
  const nome = curto(a.nome || `Vanessa · ${tipo} · ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, 120);
  const ig = await igDaPagina(p);

  // público
  const cidades = (Array.isArray(a.cidades) ? a.cidades : a.cidades ? String(a.cidades).split(";") : ["Montes Claros, MG"]).map((x: any) => String(x).trim()).filter(Boolean);
  const raio = a.raio_km ? Math.min(80, Math.max(17, Math.round(+a.raio_km))) : 0;
  const geo = cidades.some((x: string) => norm(x) === "brasil") ? { countries: ["BR"] } : { cities: await cidadesAlvo(cidades, raio) };
  const targeting: any = { geo_locations: { ...geo, location_types: ["home", "recent"] }, age_min: Math.max(18, Math.round(+a.idade_min || 18)), age_max: Math.min(65, Math.round(+a.idade_max || 65)), targeting_automation: { advantage_audience: 0 } };
  if (a.genero === "mulheres") targeting.genders = [2]; else if (a.genero === "homens") targeting.genders = [1];

  // objetivo e otimização
  const destinoMsg = String(a.destino_mensagens || "whatsapp");
  const cfg: any = {
    mensagens: { objetivo: "OUTCOME_ENGAGEMENT", otimiza: "CONVERSATIONS", destino: destinoMsg === "direct" ? "INSTAGRAM_DIRECT" : destinoMsg === "messenger" ? "MESSENGER" : "WHATSAPP" },
    impulsionar: { objetivo: "OUTCOME_AWARENESS", otimiza: "REACH" },
    trafego: { objetivo: "OUTCOME_TRAFFIC", otimiza: "LINK_CLICKS", destino: "WEBSITE" },
    cadastro: { objetivo: "OUTCOME_LEADS", otimiza: "LEAD_GENERATION", destino: "ON_AD" },
  }[tipo];
  if (tipo === "trafego" && !/^https?:\/\//.test(String(a.link || ""))) return { erro: "Para tráfego, falta o link de destino (site ou perfil)." };
  if (tipo === "mensagens" && destinoMsg === "direct" && !ig) return { erro: `A página "${p.name}" não tem Instagram conectado, então não dá para anúncio de Direct.` };

  // formulário (cadastro): usa um formulário que já existe na página
  let formId = "";
  if (tipo === "cadastro") {
    const fs = (await g(`${p.id}/leadgen_forms`, { fields: "id,name,status", limit: "50" }, "GET", p.access_token)).data || [];
    const ativos = fs.filter((x: any) => x.status === "ACTIVE");
    const f = a.formulario ? ativos.find((x: any) => norm(x.name).includes(norm(a.formulario)) || x.id === String(a.formulario)) : ativos.length === 1 ? ativos[0] : null;
    if (!f) return { erro: ativos.length ? `Diga qual formulário usar. Formulários ativos da página: ${ativos.map((x: any) => x.name).join(", ")}.` : `A página "${p.name}" não tem formulário de cadastro ativo. Crie o formulário no Gerenciador primeiro.` };
    formId = f.id;
  }

  // criativo
  const texto = String(a.texto || "").slice(0, 2000), titulo = curto(a.titulo || "", 60);
  const arquivo = String(a.arquivo_url || "").trim();
  let criativo: Record<string, string> = {};
  if (tipo === "impulsionar") {
    const post = String(a.post_id || "").trim();
    if (!post) return { erro: "Para impulsionar, falta o post_id (do ig_perfil para Instagram, ou do fb_posts para Facebook)." };
    if (post.includes("_")) criativo = { object_story_id: post };
    else { if (!ig) return { erro: `A página "${p.name}" não tem Instagram conectado.` }; criativo = { object_id: p.id, instagram_user_id: ig, source_instagram_media_id: post }; }
  } else {
    if (!/^https:\/\//.test(arquivo)) return { erro: "Falta a imagem ou o vídeo do anúncio (link do drive_link_publico)." };
    if (!texto) return { erro: "Falta o texto do anúncio." };
    const ctaTipo = CTA_OK.includes(String(a.botao || "")) ? String(a.botao) : tipo === "mensagens" ? (destinoMsg === "direct" ? "INSTAGRAM_MESSAGE" : destinoMsg === "messenger" ? "MESSAGE_PAGE" : "WHATSAPP_MESSAGE") : tipo === "cadastro" ? "SIGN_UP" : "LEARN_MORE";
    const valor: any = tipo === "mensagens" ? { app_destination: cfg.destino === "INSTAGRAM_DIRECT" ? "INSTAGRAM_DIRECT" : cfg.destino === "MESSENGER" ? "MESSENGER" : "WHATSAPP" } : tipo === "cadastro" ? { lead_gen_form_id: formId } : { link: a.link };
    const link = tipo === "trafego" ? String(a.link) : tipo === "cadastro" ? "http://fb.me/" : cfg.destino === "MESSENGER" ? "https://fb.com/messenger_doc/" : cfg.destino === "INSTAGRAM_DIRECT" ? "https://www.instagram.com/" : "https://api.whatsapp.com/send";
    const cta = { type: ctaTipo, value: valor };
    const spec: any = { page_id: p.id, ...(ig ? { instagram_user_id: ig } : {}) };
    if (/\.(mp4|mov)(\?|$)/i.test(arquivo)) {
      const v = await sobeVideo(c.id, arquivo);
      spec.video_data = { video_id: v.id, image_url: v.capa, message: texto, ...(titulo ? { title: titulo } : {}), call_to_action: { type: ctaTipo, value: { ...valor, link } } };
    } else {
      const hash = await sobeImagem(c.id, arquivo);
      spec.link_data = { image_hash: hash, message: texto, link, ...(titulo ? { name: titulo } : {}), call_to_action: cta };
    }
    criativo = { object_story_spec: JSON.stringify(spec) };
  }

  // monta tudo; se algo falhar no meio, apaga o que foi criado
  let campanha = "";
  try {
    campanha = (await g(`${c.id}/campaigns`, { name: nome, objective: cfg.objetivo, status: "PAUSED", special_ad_categories: "[]", daily_budget: String(dia), bid_strategy: "LOWEST_COST_WITHOUT_CAP" }, "POST")).id;
    const conj: Record<string, string> = { name: nome + " · público", campaign_id: campanha, billing_event: "IMPRESSIONS", optimization_goal: cfg.otimiza, targeting: JSON.stringify(targeting), status: "ACTIVE" };
    if (cfg.destino) conj.destination_type = cfg.destino;
    if (tipo === "mensagens" || tipo === "cadastro") conj.promoted_object = JSON.stringify({ page_id: p.id });
    if (dias > 0) conj.end_time = String(Math.floor(Date.now() / 1000) + dias * 86400);
    const conjunto = (await g(`${c.id}/adsets`, conj, "POST")).id;
    const cr = (await g(`${c.id}/adcreatives`, { name: nome + " · criativo", ...criativo }, "POST")).id;
    const anuncio = (await g(`${c.id}/ads`, { name: nome + " · anúncio", adset_id: conjunto, creative: JSON.stringify({ creative_id: cr }), status: "ACTIVE" }, "POST")).id;
    let previa = "";
    try { const pv = await g(`${anuncio}/previews`, { ad_format: ig ? "INSTAGRAM_STANDARD" : "MOBILE_FEED_STANDARD" }); previa = (String(pv.data?.[0]?.body || "").match(/src="([^"]+)"/) || [])[1]?.replace(/&amp;/g, "&") || ""; } catch (_e) { /* sem prévia */ }
    await registra("ads_criar", `${c.name} · ${nome} (${campanha})`, "", `PAUSADA · ${tipo} · R$ ${dia / 100}/dia${dias ? ` · ${dias} dias` : ""}`, true);
    return {
      ok: true, situacao: "CRIADA PAUSADA: não está gastando nada. Só roda depois que o Jonathan aprovar e mandar ativar (ads_status ativar com o id da campanha).",
      conta: c.name, pagina: p.name, campanha_id: campanha, conjunto_id: conjunto, anuncio_id: anuncio, nome, tipo,
      orcamento_reais_dia: dia / 100, dias: dias || "sem data para acabar", publico: { lugares: (geo as any).cities ? (geo as any).cities.map((x: any) => x.nome + (x.radius ? ` (+${x.radius} km)` : "")) : ["Brasil"], idade: `${targeting.age_min} a ${targeting.age_max}`, genero: a.genero || "todos" },
      previa_link: previa || undefined, gerenciador: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.id.replace("act_", "")}&selected_campaign_ids=${campanha}`,
      aviso: "A Meta ainda revisa o anúncio; isso pode levar algumas horas depois de ativar.",
    };
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (campanha) { try { await g(campanha, {}, "DELETE"); } catch (_e) { /* fica pausada */ } }
    await registra("ads_criar", `${c.name} · ${nome}`, "", tipo, false, msg);
    return { erro: "Não consegui criar o anúncio: " + msg + (campanha ? " (apaguei o que tinha começado a criar, nada ficou no ar)" : "") };
  }
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
      ads_contas: adsContas, ads_resultados: adsResultados, ads_campanhas: adsCampanhas, ads_status: adsStatus, ads_orcamento: adsOrcamento, ads_criar: adsCriar,
    };
    if (!mapa[f]) return json({ erro: "ferramenta desconhecida" });
    const out: any = await mapa[f](a);
    if (MEM && MEM.expira - Date.now() < 7 * 864e5 && out && typeof out === "object") out._aviso_acesso = "O acesso ao Facebook vence em menos de 7 dias; avise o Jonathan.";
    return json(out);
  } catch (e) { return json({ erro: String((e as Error).message || e) }); }
});
