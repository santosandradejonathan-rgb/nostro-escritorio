// Ferramentas do Time de IA no Nostro Hub.
// Só a função "agente" chama esta (com a chave de serviço do próprio projeto). Cada agente só usa as suas:
//   Josué  → Geração de Leads (buscar empresas, analisar site) e entregar ao funil de um SDR do Time de IA.
//   Calebe → o próprio funil no Time de IA (ver, mover, anotar, atualizar contato) e passar a reunião para o Jonathan.
// O funil do Jonathan não é mexido aqui: a passagem fica marcada e o Hub cria o negócio quando abre.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { geocodificar, buscarOSM, buscarTomTom, juntarFontes, telefoneBR, analisarSite, consultarCnpj } from "./leads.js";

const URL_SB = Deno.env.get("SUPABASE_URL") || "";
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PERMISSOES: Record<string, string[]> = {
  josue: ["buscar_empresas", "ver_leads_gerados", "analisar_site", "consultar_cnpj", "entregar_ao_sdr", "ver_funil"],
  calebe: ["ver_funil", "mover_lead", "anotar_no_lead", "atualizar_lead", "passar_para_jonathan"],
};
const ETAPAS_SDR = ["novo", "abordado", "followup", "respondeu", "qualificando", "qualificado"];
const NOME_ETAPA: Record<string, string> = {
  encontrado: "Encontrado", diagnostico: "Diagnóstico feito", pronto: "Pronto para o SDR",
  novo: "Recebido do Josué", abordado: "1ª mensagem enviada", followup: "Em follow-up", respondeu: "Respondeu",
  qualificando: "Em qualificação", qualificado: "Qualificado", reuniao: "Reunião marcada", descartado: "Descartado",
};
const NOME: Record<string, string> = { josue: "Josué", calebe: "Calebe", camila: "Camila", jonathan: "Jonathan", descartado: "Descartados" };

const db = (caminho: string, o: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${caminho}`, { ...o, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json", ...(o.headers || {}) } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sem = (t: string) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = (t: string) => sem(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lead";
const curto = (t: unknown, n = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function leadsAgentes(): Promise<any[]> {
  const r = await db("pulse_agentes?select=id,data");
  if (!r.ok) throw new Error("Não consegui ler os funis do Time de IA.");
  return (await r.json()).map((x: any) => ({ ...(x.data || {}), id: x.id }));
}
async function salvarAg(l: any) {
  l.atualizadoEm = Date.now();
  const { id, ...data } = l;
  const r = await db("pulse_agentes", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, data: { ...data, id } }) });
  if (!r.ok) throw new Error("Não consegui salvar no funil: " + (await r.text()).slice(0, 150));
}
// acha o lead pelo id ou pelo nome da empresa (aproximado)
function acharLead(lista: any[], ref: string) {
  const q = sem(ref).trim();
  if (!q) return null;
  return lista.find((l) => l.id === ref) || lista.find((l) => sem(l.empresa) === q) ||
    lista.find((l) => sem(l.empresa).includes(q) || q.includes(sem(l.empresa))) ||
    lista.find((l) => q.split(/\s+/).filter((w) => w.length > 3).some((w) => sem(l.empresa).includes(w))) || null;
}
const resumoLead = (l: any) => ({ id: l.id, empresa: l.empresa, nicho: l.nicho, etapa: NOME_ETAPA[l.etapa] || l.etapa, com: NOME[l.dono] || l.dono, nota: l.nota ?? null, telefone: l.telefone || "", instagram: l.instagram || "", contato: l.contato || "", gancho: curto(l.gancho, 220), falhas: curto(l.falhas, 220) });

// localiza a cidade: TomTom/Nominatim (como no Hub) e, se falharem daqui, a base gratuita do Open-Meteo
async function achaCidade(local: string, env: any): Promise<any> {
  try { return await geocodificar(local, env); } catch (_e) { /* tenta a outra base */ }
  try {
    const [cid, uf] = local.split(",").map((x) => x.trim());
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cid)}&count=10&language=pt&countryCode=BR`);
    const j = await r.json();
    const lista = (j.results || []) as any[];
    const UF: Record<string, string> = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
    const estado = uf ? (UF[uf.toUpperCase()] || uf) : "";
    const g = lista.find((x) => !estado || sem(x.admin1) === sem(estado)) || lista[0];
    if (!g) return null;
    const raio = g.population > 1000000 ? 20000 : g.population > 200000 ? 12000 : 7000;
    return { lat: g.latitude, lon: g.longitude, bbox: null, raio, pais: "BR", fonte: "Open-Meteo" };
  } catch (_e) { return null; }
}

/* ---------- Josué: Geração de Leads ---------- */
async function buscarEmpresas(a: any) {
  const termo = curto(a.nicho, 120), local = curto(a.local || "Montes Claros, MG", 160);
  if (!termo) return { erro: "Diga o nicho da busca (ex.: dentista)." };
  // mesmo teto mensal do gerador de leads do Hub
  const mes = new Date().toLocaleString("en-CA", { timeZone: "America/Los_Angeles" }).slice(0, 7);
  const cfg = await (await db("pulse_leads_config?id=eq.1&select=limite")).json().catch(() => []);
  const limite = (cfg[0] && cfg[0].limite) || 900;
  const uso = await (await db(`pulse_leads_uso?mes=eq.${mes}&select=usadas`)).json().catch(() => []);
  const usadas = (uso[0] && uso[0].usadas) || 0;
  if (usadas + 1 > limite) return { erro: `O limite de buscas do mês acabou (${usadas} de ${limite}).` };
  const env = { TOMTOM_KEY: Deno.env.get("TOMTOM_KEY") || "" };
  const centro = await achaCidade(local, env);
  if (!centro) return { erro: `Não consegui localizar "${local}". Fale a cidade e o estado, por exemplo Montes Claros, MG.` };
  await db("pulse_leads_uso", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ mes, usadas: usadas + 1, updated_at: new Date().toISOString() }) });
  const [tt, osm] = await Promise.all([
    env.TOMTOM_KEY ? buscarTomTom(termo, centro, 50, env) : Promise.resolve({ lugares: [], erro: "" }),
    buscarOSM(termo, centro),
  ]);
  let lugares = juntarFontes([tt.lugares, osm]);
  const cidade = local.split(",")[0].trim();
  lugares.forEach((l: any) => {
    if (!l.cidade) l.cidade = cidade;
    if (!l.pais) l.pais = centro.pais || "";
    if (l.pais === "BR" && !l.telefone && l.telefoneIntl) l.telefone = telefoneBR(l.telefoneIntl).nac;
  });
  lugares.sort((x: any, y: any) => (+!!(y.telefone || y.telefoneIntl) + +!!y.site) - (+!!(x.telefone || x.telefoneIntl) + +!!x.site));
  lugares = lugares.slice(0, 50);
  if (!lugares.length) return { total: 0, aviso: "Não achei empresas com esse nicho nesse local nas bases de mapas gratuitas. Tente outro nome para o nicho." };

  // grava na Geração de Leads do Hub, como uma busca feita pelo Josué
  const bid = "ia-" + Date.now().toString(36);
  await db("pulse_leads_buscas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: bid, termo: termo + " (Josué)", local, total: lugares.length, paginas: 1 }) });
  const expira = new Date(Date.now() + 30 * 864e5).toISOString();
  await db("pulse_leads", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(lugares.map((l: any) => ({ id: l.id, busca_id: bid, data: { ...l, buscadoPor: "josue" }, expira_em: expira }))) });
  return {
    total: lugares.length, fonte: tt.lugares.length ? "TomTom + OpenStreetMap" : "OpenStreetMap",
    empresas: lugares.slice(0, 20).map((l: any) => ({ lead_id: l.id, nome: l.nome, categoria: l.categoria, telefone: l.telefone || l.telefoneIntl || "", site: l.site || "", instagram: l.instagram || "", endereco: curto(l.endereco, 90) })),
    obs: "A lista completa ficou salva na Geração de Leads do Hub.",
  };
}
async function verLeadsGerados(a: any) {
  const q = sem(a.filtro || "");
  const r = await db("pulse_leads?select=id,status,data,criado_em&order=criado_em.desc&limit=200");
  const lista = ((await r.json().catch(() => [])) as any[]).filter((x) => !x.data?.expirado);
  const f = q ? lista.filter((x) => sem(`${x.data?.nome} ${x.data?.categoria} ${x.data?.cidade}`).includes(q)) : lista;
  return { total: f.length, leads: f.slice(0, 25).map((x) => ({ lead_id: x.id, nome: x.data?.nome, categoria: x.data?.categoria, cidade: x.data?.cidade, telefone: x.data?.telefone || "", site: x.data?.site || "", instagram: x.data?.instagram || x.data?.siteInfo?.instagram?.[0] || "", no_time_ia: !!x.data?.timeIA, status: x.status })) };
}
async function analisarSiteF(a: any) {
  let url = curto(a.url, 300), leadRow: any = null;
  if (a.lead_id) {
    const r = await db(`pulse_leads?id=eq.${encodeURIComponent(a.lead_id)}&select=id,data`);
    leadRow = ((await r.json().catch(() => [])) as any[])[0] || null;
    if (!url && leadRow) url = leadRow.data?.site || "";
  }
  if (!url) return { erro: "Essa empresa não tem site cadastrado." };
  const s: any = await analisarSite(url);
  if (leadRow) await db(`pulse_leads?id=eq.${encodeURIComponent(leadRow.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ data: { ...leadRow.data, siteInfo: s } }) });
  return { site: s.url, abriu: s.ok, erro: s.erro || "", instagram: s.instagram, whatsapp: s.whatsapp, emails: s.emails, cnpj: s.cnpjs, pixel_meta: s.pixelMeta, google_tag: s.googleTag, google_ads: s.googleAds, responsivo: s.responsivo, https: s.https, plataforma: s.plataforma, titulo: s.titulo };
}
async function cnpjF(a: any) { const c: any = await consultarCnpj(a.cnpj); return c; }
async function entregarAoSdr(a: any) {
  const sdr = a.sdr === "camila" ? "camila" : "calebe";
  const empresa = curto(a.empresa, 120);
  if (!empresa) return { erro: "Falta o nome da empresa." };
  const todos = await leadsAgentes();
  const ja = todos.find((l) => sem(l.empresa) === sem(empresa));
  if (ja) return { erro: `${empresa} já está no Time de IA, com ${NOME[ja.dono] || ja.dono} (${NOME_ETAPA[ja.etapa] || ja.etapa}).` };
  let base: any = {};
  if (a.lead_id) {
    const r = await db(`pulse_leads?id=eq.${encodeURIComponent(a.lead_id)}&select=id,data`);
    const row = ((await r.json().catch(() => [])) as any[])[0];
    if (row) {
      base = row.data || {};
      await db(`pulse_leads?id=eq.${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ data: { ...base, timeIA: { sdr, em: Date.now() } } }) });
    }
  }
  const agora = Date.now();
  let id = "ag-" + slug(empresa);
  if (todos.some((l) => l.id === id)) id += "-" + agora.toString(36).slice(-4);
  const ig = curto(a.instagram || base.instagram || (base.siteInfo?.instagram || [])[0] || "", 40).replace(/^@?/, "");
  const l = {
    id, empresa, sdr, dono: sdr, etapa: "novo", nota: a.nota != null ? Math.max(0, Math.min(10, Math.round(+a.nota))) : null,
    nicho: curto(a.nicho || base.categoria, 80), cidade: curto(a.cidade || base.cidade || "Montes Claros", 60), bairro: curto(a.bairro, 60),
    telefone: curto(a.telefone || base.telefone || base.telefoneIntl, 30), instagram: ig ? "@" + ig : "", site: curto(a.site || base.site, 200),
    google: curto(a.google, 60), falhas: curto(a.falhas, 600), gancho: curto(a.gancho, 400),
    fonte: `Josué, pelo escritório virtual (${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})`,
    leadGeradoId: a.lead_id || null, criadoEm: agora, etapaDesde: agora,
    historico: [{ dono: "josue", etapa: "pronto", em: agora - 1 }, { dono: sdr, etapa: "novo", em: agora }],
    atividades: [{ texto: `Josué entregou o lead ${sdr === "camila" ? "à Camila" : "ao Calebe"}`, em: agora }, { texto: `Josué analisou e deu nota ${a.nota ?? "–"}/10`, em: agora - 1 }],
  };
  await salvarAg(l);
  return { ok: true, lead: resumoLead(l) };
}

/* ---------- funil do Time de IA ---------- */
async function verFunil(agente: string, a: any) {
  const todos = await leadsAgentes();
  const meus = agente === "calebe" ? todos.filter((l) => l.dono === "calebe" || (l.sdr === "calebe" && l.dono === "jonathan")) : todos;
  const f = a.etapa ? meus.filter((l) => sem(NOME_ETAPA[l.etapa] || l.etapa).includes(sem(a.etapa)) || l.etapa === a.etapa) : meus;
  const porEtapa: Record<string, number> = {};
  meus.forEach((l) => { const k = `${NOME[l.dono] || l.dono}: ${NOME_ETAPA[l.etapa] || l.etapa}`; porEtapa[k] = (porEtapa[k] || 0) + 1; });
  return { total: meus.length, por_etapa: porEtapa, leads: f.slice(0, 30).map(resumoLead) };
}
async function moverLead(agente: string, a: any) {
  const todos = await leadsAgentes();
  const meus = todos.filter((l) => l.dono === agente);
  const l = acharLead(meus, a.lead || "");
  if (!l) return { erro: `Não achei "${a.lead}" no seu funil. Seus leads: ${meus.map((x) => x.empresa).join(", ") || "nenhum"}.` };
  const etapa = String(a.etapa || "");
  if (!ETAPAS_SDR.includes(etapa) && etapa !== "descartado") return { erro: "Etapa inválida. Use: " + ETAPAS_SDR.join(", ") + " ou descartado." };
  if (etapa === "descartado" && !a.motivo) return { erro: "Para descartar, diga o motivo." };
  const agora = Date.now(), de = `${NOME[l.dono]} · ${NOME_ETAPA[l.etapa] || l.etapa}`;
  const dono = etapa === "descartado" ? "descartado" : l.dono;
  if (etapa === "descartado") l.motivo = curto(a.motivo, 120);
  l.dono = dono; l.etapa = etapa; l.etapaDesde = agora;
  (l.historico = l.historico || []).push({ dono, etapa, em: agora });
  (l.atividades = l.atividades || []).unshift({ texto: curto(a.observacao, 300) || `${de} → ${NOME[dono] || dono} · ${NOME_ETAPA[etapa] || etapa}`, em: agora });
  await salvarAg(l);
  return { ok: true, lead: resumoLead(l) };
}
async function anotar(agente: string, a: any) {
  const todos = await leadsAgentes();
  const l = acharLead(todos.filter((x) => x.dono === agente || x.sdr === agente), a.lead || "");
  if (!l) return { erro: `Não achei "${a.lead}" no seu funil.` };
  const t = curto(a.texto, 400);
  if (!t) return { erro: "Falta o texto da anotação." };
  (l.atividades = l.atividades || []).unshift({ texto: t, em: Date.now() });
  await salvarAg(l);
  return { ok: true, empresa: l.empresa };
}
// dados de contato e do negócio: telefone, decisor, e-mail, Instagram, site, dor, verba, prazo...
async function atualizarLead(agente: string, a: any) {
  const todos = await leadsAgentes();
  const l = acharLead(todos.filter((x) => x.dono === agente), a.lead || "");
  if (!l) return { erro: `Não achei "${a.lead}" no seu funil.` };
  const campos: Record<string, number> = { contato: 80, cargo_contato: 60, telefone: 30, email: 120, instagram: 40, site: 200, bairro: 60, dor: 400, decisor: 120, verba: 120, prazo: 120, servico_interesse: 160, objecoes: 400, observacoes: 600 };
  const mudou: string[] = [];
  for (const [k, n] of Object.entries(campos)) {
    if (a[k] == null || a[k] === "") continue;
    const chave = ({ cargo_contato: "cargoContato", servico_interesse: "servicoInteresse" } as any)[k] || k;
    l[chave] = curto(a[k], n); mudou.push(k.replace(/_/g, " "));
  }
  if (!mudou.length) return { erro: "Nada para atualizar." };
  (l.atividades = l.atividades || []).unshift({ texto: `${NOME[agente]} atualizou: ${mudou.join(", ")}`, em: Date.now() });
  await salvarAg(l);
  return { ok: true, empresa: l.empresa, atualizado: mudou };
}
async function passarJonathan(agente: string, a: any) {
  const todos = await leadsAgentes();
  const l = acharLead(todos.filter((x) => x.dono === agente), a.lead || "");
  if (!l) return { erro: `Não achei "${a.lead}" no seu funil.` };
  const quando = String(a.reuniao_em || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quando)) return { erro: "Preciso da data e hora da reunião no formato AAAA-MM-DDTHH:MM (horário de Brasília). Pergunte ao Jonathan se não souber." };
  const agora = Date.now();
  l.reuniaoEm = quando; l.contato = curto(a.contato, 80) || l.contato || ""; l.resumo = curto(a.resumo, 800);
  // o Hub cria o negócio no funil do Jonathan (Reunião agendada) assim que abrir, com as automações dele
  l.paraJonathan = { reuniaoEm: quando, contato: l.contato, resumo: l.resumo, sdr: agente, pedidoEm: agora };
  if (l.etapa !== "qualificado") { l.etapa = "qualificado"; l.etapaDesde = agora; (l.historico = l.historico || []).push({ dono: agente, etapa: "qualificado", em: agora }); }
  (l.atividades = l.atividades || []).unshift({ texto: `${NOME[agente]} marcou a reunião para ${quando.slice(8, 10)}/${quando.slice(5, 7)} às ${quando.slice(11, 16)} e passou para o Jonathan`, em: agora });
  await salvarAg(l);
  return { ok: true, empresa: l.empresa, reuniao: quando, obs: "Vai aparecer no funil do Jonathan, em Reunião agendada, quando o Hub abrir." };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!CHAVE || req.headers.get("x-segredo") !== CHAVE) return json({ erro: "sem permissão" }, 403);
  let c: any;
  try { c = await req.json(); } catch { return json({ erro: "json" }, 400); }
  const agente = String(c.agente || ""), f = String(c.ferramenta || ""), a = c.args || {};
  if (!(PERMISSOES[agente] || []).includes(f)) return json({ erro: `${NOME[agente] || agente} não tem acesso a "${f}".` }, 200);
  try {
    let r: unknown;
    if (f === "buscar_empresas") r = await buscarEmpresas(a);
    else if (f === "ver_leads_gerados") r = await verLeadsGerados(a);
    else if (f === "analisar_site") r = await analisarSiteF(a);
    else if (f === "consultar_cnpj") r = await cnpjF(a);
    else if (f === "entregar_ao_sdr") r = await entregarAoSdr(a);
    else if (f === "ver_funil") r = await verFunil(agente, a);
    else if (f === "mover_lead") r = await moverLead(agente, a);
    else if (f === "anotar_no_lead") r = await anotar(agente, a);
    else if (f === "atualizar_lead") r = await atualizarLead(agente, a);
    else if (f === "passar_para_jonathan") r = await passarJonathan(agente, a);
    else r = { erro: "ferramenta desconhecida" };
    return json(r);
  } catch (e: any) {
    return json({ erro: e?.publico || e?.message || String(e) });
  }
});
