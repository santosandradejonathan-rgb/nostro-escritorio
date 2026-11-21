// Vigia da Vanessa: roda sozinho (pg_cron). "campanhas" confere as contas de anúncio todo dia e guarda os alertas;
// "novidades" pesquisa toda semana as mudanças de Meta Ads, Google Ads e Instagram. A Vanessa conta na próxima conversa.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!, K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function chaveDoVigia(): Promise<string> {
  const r = await fetch(`${URL_}/rest/v1/vanessa_config?nome=eq.vigia_chave&select=valor`, { headers: H });
  return r.ok ? ((await r.json())[0]?.valor || "") : "";
}

async function campanhas() {
  const r = await fetch(`${URL_}/functions/v1/meta`, { method: "POST", headers: { ...H, "x-segredo": K }, body: JSON.stringify({ agente: "calebe", ferramenta: "ads_diagnostico", args: {} }) });
  const d = await r.json().catch(() => ({}));
  const alertas = (d.alertas || []).map((a: any) => ({ chave: a.chave, conta: a.conta || "", campanha: a.campanha || "", tipo: a.tipo, texto: a.texto, sugestao: a.sugestao || "" }));
  if (alertas.length) {
    const w = await fetch(`${URL_}/rest/v1/vanessa_alertas?on_conflict=chave`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(alertas) });
    const novos = w.ok ? (await w.json()).length : 0;
    return { contas: d.contas_verificadas, alertas: alertas.length, novos, erro: w.ok ? undefined : await w.text() };
  }
  return { contas: d.contas_verificadas, alertas: 0, novos: 0, erro: d.erro };
}

async function novidades() {
  const pedido = "Tarefa automática da semana. Pesquise na internet (web_search) as novidades e mudanças dos últimos 7 a 10 dias no Meta Ads (Facebook e Instagram Ads), no Google Ads e no Instagram (algoritmo, formatos, recursos, regras), que importam para uma agência de marketing de negócios locais em Montes Claros. Coloque o resumo com mostrar_na_tela, título NOVIDADES DA SEMANA: no máximo 8 tópicos, cada um com o que mudou, a data, o que isso muda para a Nostro e os clientes, e a fonte (nome do site). Se não achar nada confiável de uma plataforma, diga isso. Não invente.";
  const r = await fetch(`${URL_}/functions/v1/agente`, { method: "POST", headers: { ...H, "x-segredo": K }, body: JSON.stringify({ agente: "calebe", pessoa: "sistema", interlocutor: "Jonathan", canal: "chat", mensagens: [{ role: "user", content: pedido }] }) });
  const d = await r.json().catch(() => ({}));
  const texto = String(d.telas?.[0]?.texto || d.texto || "").trim();
  if (!r.ok || texto.length < 80) return { ok: false, erro: d.erro || "resposta vazia" };
  const w = await fetch(`${URL_}/rest/v1/vanessa_novidades`, { method: "POST", headers: H, body: JSON.stringify({ texto: texto.slice(0, 8000) }) });
  return { ok: w.ok, tamanho: texto.length };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const vem = req.headers.get("x-vigia") || "", seg = req.headers.get("x-segredo") || "";
  const chave = vem ? await chaveDoVigia() : "";
  if (!(seg && seg === K) && !(vem && chave && vem === chave)) return json({ erro: "sem permissão" }, 403);
  const { modo } = await req.json().catch(() => ({}));
  try {
    if (modo === "campanhas") return json(await campanhas());
    if (modo === "novidades") return json(await novidades());
    return json({ erro: "modo: campanhas ou novidades" }, 400);
  } catch (e) { return json({ erro: String(e).slice(0, 200) }, 500); }
});
