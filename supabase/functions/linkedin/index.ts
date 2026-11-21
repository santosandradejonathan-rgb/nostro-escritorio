// LinkedIn da Vanessa: autorização do perfil do Jonathan (GET) e publicação no perfil (POST, só a função "agente" chama).
// Segredos: LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET (app do LinkedIn com "Share on LinkedIn" e "Sign In with LinkedIn using OpenID Connect").
// O LinkedIn não deixa ler mensagens, conexões nem buscar pessoas: aqui é só publicar no perfil, com ordem do Jonathan.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL") || "";
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// o ID do app (Nostro Agência) é público: aparece no link de autorização; a chave secreta fica só no segredo
const CID = (Deno.env.get("LINKEDIN_CLIENT_ID") || "77iva3zm1bvufa").trim();
const SEC = (Deno.env.get("LINKEDIN_CLIENT_SECRET") || "").trim();
const REDIR = "https://isfyxyoelqmncqxcrvlx.supabase.co/functions/v1/linkedin";
const PAGINA = "https://santosandradejonathan-rgb.github.io/nostro-escritorio/linkedin.html";
const ESCOPOS = "openid profile email w_member_social";

const db = (caminho: string, o: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${caminho}`, { ...o, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", ...(o.headers || {}) } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const vai = (url: string) => new Response(null, { status: 302, headers: { Location: url } });
const volta = (p: Record<string, string>) => vai(PAGINA + "?" + new URLSearchParams(p).toString());

/* ---------- autorização (o Jonathan abre no celular ou no computador) ---------- */
async function autorizar(url: URL) {
  if (!CID || !SEC) return volta({ erro: "As chaves do app do LinkedIn ainda não foram configuradas no Supabase." });
  const code = url.searchParams.get("code"), state = url.searchParams.get("state") || "";
  if (url.searchParams.get("error")) return volta({ erro: "A autorização foi cancelada no LinkedIn (" + (url.searchParams.get("error_description") || url.searchParams.get("error")) + ")." });
  if (!code) {
    const estado = crypto.randomUUID();
    await db("linkedin_estados", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado }) });
    const q = new URLSearchParams({ response_type: "code", client_id: CID, redirect_uri: REDIR, state: estado, scope: ESCOPOS });
    return vai("https://www.linkedin.com/oauth/v2/authorization?" + q.toString());
  }
  const r0 = await db(`linkedin_estados?estado=eq.${encodeURIComponent(state)}&select=criado_em`);
  const est = ((await r0.json().catch(() => [])) as any[])[0];
  await db(`linkedin_estados?estado=eq.${encodeURIComponent(state)}`, { method: "DELETE" });
  if (!est || Date.now() - new Date(est.criado_em).getTime() > 15 * 60000) return volta({ erro: "O link de autorização expirou. Tente de novo." });
  const t = await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CID, client_secret: SEC, redirect_uri: REDIR }) });
  const tok = await t.json().catch(() => ({}));
  if (!t.ok || !tok.access_token) return volta({ erro: "O LinkedIn não liberou o acesso (" + (tok.error_description || tok.error || t.status) + ")." });
  const u = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const eu = await u.json().catch(() => ({}));
  if (!eu.sub) return volta({ erro: "Não consegui identificar o seu perfil no LinkedIn." });
  const expira = new Date(Date.now() + (tok.expires_in || 5184000) * 1000).toISOString();
  const s = await db("linkedin_conta", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, sub: eu.sub, nome: eu.name || "", email: eu.email || "", token: tok.access_token, expira_em: expira, atualizado_em: new Date().toISOString() }) });
  if (!s.ok) return volta({ erro: "Não consegui guardar o acesso." });
  return volta({ ok: eu.name || "perfil" });
}

async function conta() {
  const r = await db("linkedin_conta?id=eq.1&select=sub,nome,token,expira_em");
  const c = ((await r.json().catch(() => [])) as any[])[0];
  if (!c) throw new Error(`O LinkedIn ainda não foi conectado. O Jonathan precisa autorizar em ${PAGINA}.`);
  const dias = Math.floor((new Date(c.expira_em).getTime() - Date.now()) / 864e5);
  if (dias < 0) throw new Error(`O acesso ao LinkedIn venceu. O Jonathan precisa autorizar de novo em ${PAGINA}.`);
  return { ...c, dias };
}

// a API nova do LinkedIn pede a versão (AAAAMM); usa a mais recente que estiver ativa
let VERSAO = "";
function versoes() {
  if (VERSAO) return [VERSAO];
  const v: string[] = [], d = new Date();
  for (let i = 1; i <= 11; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); v.push(`${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}`); }
  return v;
}
async function api(c: any, caminho: string, corpo: unknown) {
  let ultima: Response | null = null, texto = "";
  for (const v of versoes()) {
    const r = await fetch(`https://api.linkedin.com/rest/${caminho}`, { method: "POST", headers: { Authorization: `Bearer ${c.token}`, "LinkedIn-Version": v, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    texto = await r.text();
    if (r.status === 426 || /NONEXISTENT_VERSION|VERSION_MISSING|not active/i.test(texto)) { ultima = r; continue; }
    if (r.ok) VERSAO = v;
    return { r, texto };
  }
  return { r: ultima!, texto };
}

// o texto do post usa um formato em que alguns caracteres precisam de barra antes
const escapa = (t: string) => t.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => "\\" + c);

async function publicar(a: any) {
  const c = await conta();
  const texto = String(a.texto || "").trim();
  if (!texto) return { erro: "Falta o texto do post." };
  if (texto.length > 3000) return { erro: `O texto tem ${texto.length} caracteres; o LinkedIn aceita até 3000.` };
  const autor = `urn:li:person:${c.sub}`;
  const post: any = { author: autor, commentary: escapa(texto), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false };
  if (a.imagem_url) {
    const arq = await fetch(String(a.imagem_url));
    if (!arq.ok) return { erro: "Não consegui baixar a imagem (" + arq.status + "). Gere o link de novo com drive_link_publico." };
    const bytes = new Uint8Array(await arq.arrayBuffer());
    if (bytes.length > 20e6) return { erro: "A imagem passa de 20 MB." };
    const ini = await api(c, "images?action=initializeUpload", { initializeUploadRequest: { owner: autor } });
    const v = (JSON.parse(ini.texto || "{}").value) || {};
    if (!ini.r.ok || !v.uploadUrl) return { erro: "O LinkedIn recusou a imagem: " + ini.texto.slice(0, 200) };
    const up = await fetch(v.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${c.token}` }, body: bytes });
    if (!up.ok) return { erro: "Falhou o envio da imagem (" + up.status + ")." };
    post.content = { media: { id: v.image, altText: String(a.descricao_imagem || "").slice(0, 300) } };
  } else if (a.link) {
    post.content = { article: { source: String(a.link), title: String(a.titulo_link || a.link).slice(0, 200) } };
  }
  const { r, texto: resp } = await api(c, "posts", post);
  if (!r.ok) return { erro: "O LinkedIn não publicou (" + r.status + "): " + resp.slice(0, 300) };
  const id = r.headers.get("x-restli-id") || r.headers.get("x-linkedin-id") || "";
  await db("meta_acoes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ferramenta: "li_publicar", alvo: "LinkedIn " + (c.nome || ""), ok: true, detalhe: (id + " · " + texto).slice(0, 500) }) }).catch(() => {});
  return { ok: true, publicado: true, link: id ? `https://www.linkedin.com/feed/update/${id}/` : "https://www.linkedin.com/in/me/recent-activity/all/", aviso_acesso: c.dias < 7 ? `O acesso ao LinkedIn vence em ${c.dias} dias: o Jonathan precisa autorizar de novo em ${PAGINA}.` : undefined };
}

async function status() {
  try {
    const c = await conta();
    return { conectado: true, perfil: c.nome, dias_para_vencer: c.dias, aviso: c.dias < 7 ? `Vence em ${c.dias} dias: autorizar de novo em ${PAGINA}.` : undefined, pode: "publicar no perfil (texto, texto com imagem ou texto com link)", nao_pode: "ler mensagens, ver conexões, buscar pessoas, mandar convite ou mensagem (o LinkedIn não libera)" };
  } catch (e) { return { conectado: false, erro: String((e as Error).message || e) }; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") return autorizar(url);
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!CHAVE || req.headers.get("x-segredo") !== CHAVE) return json({ erro: "sem permissão" }, 403);
  let c: any;
  try { c = await req.json(); } catch { return json({ erro: "json" }, 400); }
  const f = String(c.ferramenta || ""), a = c.args || {};
  try {
    if (f === "li_status") return json(await status());
    if (f === "li_publicar") return json(await publicar(a));
    return json({ erro: "ferramenta desconhecida" });
  } catch (e) { return json({ erro: String((e as Error).message || e) }); }
});
