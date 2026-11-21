// Google Drive da Vanessa: autorização das contas (GET) e ferramentas do Drive (POST, só a função "agente" chama).
// Segredos: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. O acesso de cada conta fica na tabela drive_contas (só o servidor lê).
// Permissões pedidas ao Google: ler o Drive (procurar) e criar arquivos novos. Nada é alterado nem apagado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL") || "";
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// o ID do cliente é público (aparece no link de autorização); a chave secreta fica só no segredo
const CID = (Deno.env.get("GOOGLE_CLIENT_ID") || "675922438987-nskend7u8p7lrr7u4bhe6ijjtvl0eugh.apps.googleusercontent.com").trim();
const SEC = (Deno.env.get("GOOGLE_CLIENT_SECRET") || "").trim();
const REDIR = "https://isfyxyoelqmncqxcrvlx.supabase.co/functions/v1/drive-auth";
const PAGINA = "https://santosandradejonathan-rgb.github.io/nostro-escritorio/drive.html";
const CONTAS: Record<string, { email: string; nome: string }> = {
  jonathan: { email: "santosandradejonathan@gmail.com", nome: "Drive do Jonathan" },
  nostro: { email: "nostroagencia@gmail.com", nome: "Drive da Nostro" },
};
const ESCOPOS = "openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file";

const db = (caminho: string, o: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${caminho}`, { ...o, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", ...(o.headers || {}) } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const vai = (url: string) => new Response(null, { status: 302, headers: { Location: url } });
const volta = (p: Record<string, string>) => vai(PAGINA + "?" + new URLSearchParams(p).toString());

/* ---------- autorização (o Jonathan abre no navegador) ---------- */
async function autorizar(url: URL) {
  if (!CID || !SEC) return volta({ erro: "A credencial do Google ainda não foi configurada no Supabase." });
  const code = url.searchParams.get("code"), state = url.searchParams.get("state") || "";
  if (url.searchParams.get("error")) return volta({ erro: "A autorização foi cancelada no Google." });
  if (!code) {
    const conta = url.searchParams.get("conta") || "";
    if (!CONTAS[conta]) return volta({ erro: "Conta desconhecida." });
    const estado = crypto.randomUUID();
    await db("drive_estados", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado, conta }) });
    const q = new URLSearchParams({ client_id: CID, redirect_uri: REDIR, response_type: "code", scope: ESCOPOS, access_type: "offline", prompt: "consent", include_granted_scopes: "true", login_hint: CONTAS[conta].email, state: estado });
    return vai("https://accounts.google.com/o/oauth2/v2/auth?" + q.toString());
  }
  // volta do Google: confere o estado, troca o código pelo acesso e guarda
  const r0 = await db(`drive_estados?estado=eq.${encodeURIComponent(state)}&select=conta,criado_em`);
  const est = ((await r0.json().catch(() => [])) as any[])[0];
  await db(`drive_estados?estado=eq.${encodeURIComponent(state)}`, { method: "DELETE" });
  if (!est || Date.now() - new Date(est.criado_em).getTime() > 15 * 60000) return volta({ erro: "O link de autorização expirou. Tente de novo." });
  const conta = est.conta;
  const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CID, client_secret: SEC, redirect_uri: REDIR, grant_type: "authorization_code" }) });
  const tok = await t.json().catch(() => ({}));
  if (!t.ok || !tok.access_token) return volta({ erro: "O Google não liberou o acesso (" + (tok.error || t.status) + ")." });
  const u = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const email = String((await u.json().catch(() => ({}))).email || "").toLowerCase();
  if (email !== CONTAS[conta].email) return volta({ erro: `Você entrou com ${email || "outra conta"}. Para o ${CONTAS[conta].nome}, entre com ${CONTAS[conta].email}.` });
  if (!tok.refresh_token) return volta({ erro: "O Google não mandou o acesso permanente. Tente de novo." });
  const s = await db("drive_contas", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ conta, email, refresh_token: tok.refresh_token, atualizado_em: new Date().toISOString() }) });
  if (!s.ok) return volta({ erro: "Não consegui guardar o acesso." });
  return volta({ ok: conta });
}

/* ---------- acesso ao Drive ---------- */
const CACHE: Record<string, { token: string; ate: number }> = {};
async function acesso(conta: string): Promise<string> {
  const c = CACHE[conta];
  if (c && c.ate > Date.now() + 60000) return c.token;
  const r = await db(`drive_contas?conta=eq.${encodeURIComponent(conta)}&select=refresh_token`);
  const linha = ((await r.json().catch(() => [])) as any[])[0];
  if (!linha) throw new Error(`O ${CONTAS[conta]?.nome || conta} ainda não foi autorizado. O Jonathan precisa autorizar em ${PAGINA}.`);
  const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: linha.refresh_token, client_id: CID, client_secret: SEC, grant_type: "refresh_token" }) });
  const tok = await t.json().catch(() => ({}));
  if (!t.ok || !tok.access_token) throw new Error(`O acesso ao ${CONTAS[conta]?.nome || conta} expirou ou foi removido. O Jonathan precisa autorizar de novo em ${PAGINA}.`);
  CACHE[conta] = { token: tok.access_token, ate: Date.now() + (tok.expires_in || 3000) * 1000 };
  return tok.access_token;
}
const G = async (conta: string, caminho: string, o: RequestInit = {}) => {
  const r = await fetch("https://www.googleapis.com/" + caminho, { ...o, headers: { Authorization: `Bearer ${await acesso(conta)}`, ...(o.headers || {}) } });
  if (!r.ok) throw new Error("O Drive respondeu com erro " + r.status + ": " + (await r.text()).slice(0, 160));
  return r;
};
const TIPO: Record<string, string> = {
  "application/vnd.google-apps.document": "documento", "application/vnd.google-apps.spreadsheet": "planilha",
  "application/vnd.google-apps.presentation": "apresentação", "application/vnd.google-apps.folder": "pasta",
  "application/pdf": "PDF", "image/jpeg": "imagem", "image/png": "imagem", "video/mp4": "vídeo",
};
const contasDe = (c: string) => (c === "jonathan" || c === "nostro" ? [c] : ["jonathan", "nostro"]);
const aspas = (t: string) => String(t || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function buscar(a: any) {
  const termo = String(a.consulta || "").trim().slice(0, 120);
  if (!termo) return { erro: "Diga o que procurar." };
  const q = `trashed=false and (name contains '${aspas(termo)}' or fullText contains '${aspas(termo)}')`;
  const res: any = {};
  for (const conta of contasDe(a.conta)) {
    try {
      const r = await G(conta, `drive/v3/files?pageSize=10&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
      res[CONTAS[conta].nome] = ((await r.json()).files || []).map((f: any) => ({ id: f.id, nome: f.name, tipo: TIPO[f.mimeType] || f.mimeType.split("/").pop(), alterado: String(f.modifiedTime || "").slice(0, 10), link: f.webViewLink }));
    } catch (e) { res[CONTAS[conta].nome] = { erro: String((e as Error).message || e) }; }
  }
  return { consulta: termo, resultados: res };
}

async function ler(a: any) {
  const conta = contasDe(a.conta).length === 1 ? a.conta : "";
  if (!conta) return { erro: "Diga de qual Drive é o arquivo: jonathan ou nostro." };
  const id = String(a.id || "").replace(/[^A-Za-z0-9_\-]/g, "");
  if (!id) return { erro: "Falta o id do arquivo (vem da busca)." };
  const m = await (await G(conta, `drive/v3/files/${id}?fields=name,mimeType,webViewLink,size&supportsAllDrives=true`)).json();
  const exporta: Record<string, string> = { "application/vnd.google-apps.document": "text/plain", "application/vnd.google-apps.spreadsheet": "text/csv", "application/vnd.google-apps.presentation": "text/plain" };
  let texto = "";
  if (exporta[m.mimeType]) texto = await (await G(conta, `drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exporta[m.mimeType])}`)).text();
  else if (/^text\/|json|csv|xml/.test(m.mimeType) && +(m.size || 0) < 2e6) texto = await (await G(conta, `drive/v3/files/${id}?alt=media&supportsAllDrives=true`)).text();
  else return { nome: m.name, tipo: TIPO[m.mimeType] || m.mimeType, link: m.webViewLink, aviso: "Esse tipo de arquivo eu não consigo ler por dentro; só tenho o link." };
  return { nome: m.name, tipo: TIPO[m.mimeType] || m.mimeType, link: m.webViewLink, conteudo: texto.slice(0, 9000), cortado: texto.length > 9000 };
}

// tudo que a Vanessa salva fica na pasta "Vanessa" de cada Drive (criada por ela)
async function pastaVanessa(conta: string): Promise<string> {
  const r = await db(`drive_contas?conta=eq.${conta}&select=pasta_id`);
  const id = ((await r.json().catch(() => [])) as any[])[0]?.pasta_id;
  if (id) {
    const ok = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`, { headers: { Authorization: `Bearer ${await acesso(conta)}` } });
    if (ok.ok && !(await ok.json()).trashed) return id;
  }
  const c = await (await G(conta, "drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Vanessa", mimeType: "application/vnd.google-apps.folder" }) })).json();
  await db(`drive_contas?conta=eq.${conta}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ pasta_id: c.id }) });
  return c.id;
}
async function salvar(a: any) {
  const conta = contasDe(a.conta).length === 1 ? a.conta : "";
  if (!conta) return { erro: "Diga em qual Drive salvar: jonathan ou nostro." };
  const nome = String(a.nome || "").trim().slice(0, 150), conteudo = String(a.conteudo || "");
  if (!nome || !conteudo) return { erro: "Falta o nome ou o conteúdo do arquivo." };
  const planilha = a.tipo === "planilha";
  const pai = await pastaVanessa(conta);
  const meta = { name: nome, parents: [pai], mimeType: planilha ? "application/vnd.google-apps.spreadsheet" : "application/vnd.google-apps.document" };
  const lim = "vanessa" + Date.now();
  const corpo = `--${lim}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${lim}\r\nContent-Type: ${planilha ? "text/csv" : "text/plain"}; charset=UTF-8\r\n\r\n${conteudo.slice(0, 500000)}\r\n--${lim}--`;
  const f = await (await G(conta, "upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${lim}` }, body: corpo })).json();
  return { ok: true, drive: CONTAS[conta].nome, pasta: "Vanessa", nome: f.name, link: f.webViewLink };
}

// copia uma foto/vídeo do Drive para um link público temporário (pasta ig-publicar do Supabase), para o Instagram conseguir baixar
async function linkPublico(a: any) {
  const conta = contasDe(a.conta).length === 1 ? a.conta : "";
  if (!conta) return { erro: "Diga de qual Drive é o arquivo: jonathan ou nostro." };
  const id = String(a.id || "").replace(/[^A-Za-z0-9_\-]/g, "");
  if (!id) return { erro: "Falta o id do arquivo (vem da busca)." };
  const m = await (await G(conta, `drive/v3/files/${id}?fields=name,mimeType,size&supportsAllDrives=true`)).json();
  if (!/^(image\/(jpeg|png)|video\/(mp4|quicktime))$/.test(m.mimeType)) return { erro: `"${m.name}" não é foto JPG/PNG nem vídeo MP4/MOV; o Instagram não aceita esse formato.` };
  if (+(m.size || 0) > 50e6) return { erro: `"${m.name}" tem mais de 50 MB; exporte uma versão menor.` };
  const ext = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/quicktime": "mov" }[m.mimeType as string];
  const arq = await G(conta, `drive/v3/files/${id}?alt=media&supportsAllDrives=true`);
  const caminho = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const up = await fetch(`${URL_SB}/storage/v1/object/ig-publicar/${caminho}`, { method: "POST", headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": m.mimeType, "x-upsert": "true" }, body: await arq.arrayBuffer() });
  if (!up.ok) return { erro: "Não consegui preparar o arquivo: " + (await up.text()).slice(0, 160) };
  return { ok: true, nome: m.name, url: `${URL_SB}/storage/v1/object/public/ig-publicar/${caminho}` };
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
    if (f === "drive_buscar") return json(await buscar(a));
    if (f === "drive_ler") return json(await ler(a));
    if (f === "drive_salvar") return json(await salvar(a));
    if (f === "drive_link_publico") return json(await linkPublico(a));
    if (f === "drive_status") {
      const r = await db("drive_contas?select=conta,email,atualizado_em");
      return json({ contas: await r.json().catch(() => []) });
    }
    return json({ erro: "ferramenta desconhecida" });
  } catch (e) { return json({ erro: String((e as Error).message || e) }); }
});
