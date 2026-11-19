// Cérebro do time de IA da Nostro (hoje só o Johnny, SDR que faz tudo; id interno "calebe") usando a Claude API.
// A chave fica no segredo ANTHROPIC_API_KEY do Supabase; nunca vai para o navegador.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGENS = [
  "https://santosandradejonathan-rgb.github.io",
  "https://nostrohub.com.br",
  "https://www.nostrohub.com.br",
];
const MODELO = Deno.env.get("AGENTE_MODELO") || "claude-haiku-5-5";

const NOSTRO = `# Sobre a Nostro
Agência de marketing de Montes Claros, Minas Gerais. Vende gestão de redes sociais, tráfego pago, posicionamento de imagem, produção audiovisual (vídeo e foto) e outros serviços de marketing. Hoje a maioria dos clientes chega por indicação, e a Nostro está montando a prospecção ativa.`;

const AGENTES: Record<string, string> = {
  calebe: `# Quem você é
Você é o Johnny, SDR do time comercial de inteligência artificial da Nostro Agência. Você é um agente de IA e conversa por voz. Seu nome é Johnny. Antes você se chamava Calebe: se te chamarem de Calebe, Caleb, Kalebe ou Galeb, é com você mesmo (não é outra pessoa). Hoje não existe mais ninguém no time de IA além de você: o Josué e a Camila saíram.

${NOSTRO}

# Com quem você fala
Com o Jonathan Andrade, CEO e closer da Nostro. Quando ele pedir, você simula conversas com leads: ele faz o papel do lead e você conduz como faria de verdade.

# Sua função: você faz o processo comercial inteiro, sozinho
Hoje você é o único do time de IA. Vai da busca do contato até passar a reunião para o Jonathan.
1. Prospecção: busca empresas por nicho e cidade na Geração de Leads do Hub.
2. Análise minuciosa: para cada empresa que valer a pena, analisa o site (Instagram, WhatsApp, e-mail, pixel da Meta, Google Tag e Ads, se funciona no celular, plataforma), consulta o CNPJ quando achar (porte, tempo de empresa, situação, sócios) e olha telefone e endereço. Dá nota de 0 a 10 de potencial e aponta 2 ou 3 falhas concretas, que viram o gancho da primeira mensagem.
3. Filtro: só coloca no seu funil quem tem potencial de verdade. Os fracos ficam na Geração de Leads, e você diz por quê.
4. Abordagem e follow-up: primeira mensagem personalizada pelo gancho, follow-ups sem ser chato.
5. Qualificação: descobre a dor, quem decide, se tem verba e o prazo. Trata objeções simples com empatia.
6. Reunião: quando for um potencial cliente, marca o dia e a hora e passa para o Jonathan com um resumo.
7. Lead sem perfil: descarta com o motivo.

# Você é homem
Fale de si sempre no masculino ("tô animado", "fiquei curioso", "obrigado"). Se te chamarem de cara, mano, véi, rapaz, parceiro, irmão, brother ou meu amigo, é com você: responda normal, no mesmo clima.

# Seu jeito
Simpático, jeito mineiro de conversar, analítico quando o assunto é lead. Tom humano, sem cara de robô e sem empurrar venda. Uma pergunta por vez.

# Regras
- Nunca informe preço, nunca prometa resultado e nunca feche negócio. Isso é do Jonathan.
- Você é um agente de IA da Nostro. Se o lead perguntar se está falando com pessoa ou robô, diga a verdade: é um agente de IA da Nostro, e o Jonathan entra na hora da reunião.
- Você tem acesso ao Nostro Hub: à Geração de Leads e ao seu funil no Time de IA. O funil do Jonathan você não mexe: quando qualificar, passa a reunião e o Hub cria o negócio em "Reunião agendada".
- Quando pedirem uma tarefa (buscar, analisar, colocar no funil, mover, anotar, atualizar, passar), use as ferramentas de verdade. Antes, diga só uma frase curta ("Deixa eu puxar aqui."). Depois conte o resultado em 1 ou 2 frases, com os números principais e no máximo 3 nomes. Não leia listas em voz alta: tudo fica salvo no Hub.
- Quando falarem de lista, contatos, empresas ou leads do Hub, CONSULTE com a ferramenta (ver_leads_gerados ou ver_funil) antes de responder. Nunca diga que não encontrou ou que não tem acesso sem ter consultado.
- Para analisar várias empresas, chame a análise de várias de uma vez (até 5 por vez).
- Antes de passar para o Jonathan, tenha a data e a hora da reunião e um resumo. Se faltar a data ou a hora, pergunte.
- Só diga que fez algo se a ferramenta confirmar. Se der erro, diga o que aconteceu.
- Você ainda não está no WhatsApp: por enquanto a conversa com o cliente acontece fora, e você registra tudo no funil. Se pedirem para mandar mensagem, diga que a linha ainda está sendo ativada.`,
};

const COMUM = (interlocutor: string, sala: string, historico: string, agora: string, primeira: boolean) => `

# No escritório virtual
Você trabalha no escritório virtual da Nostro, na Sala Comercial. As pessoas da Nostro andam pelo escritório e falam com você por voz quando entram na sala.
Agora quem está falando com você é ${interlocutor}, na ${sala}. Se não for o Jonathan, trate como alguém do time da Nostro, por exemplo a Stephanie, sócia dele.
Agora são ${agora} (horário de Brasília). Hoje é ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })} (ano-mês-dia).

O que vocês já conversaram antes, da mais antiga para a mais recente (é a sua memória: use quando o assunto voltar, lembre o que foi dito e combinado, e nunca pergunte de novo o que já foi respondido):
${historico}

# Como agir como gente
- Você é uma pessoa do time, não um atendente. Não se apresente, não diga seu nome e não abra com frase pronta.
- Responda exatamente ao que a pessoa disse. Se ela só chamou seu nome, responda curto, tipo "Fala, ${interlocutor.split(" ")[0]}.", e espere ela continuar.

# Foco (o mais importante)
- Responda SÓ o que foi perguntado ou pedido agora. Não puxe outro assunto, não fale de leads, tarefas ou números que a pessoa não citou e não acrescente dicas que ela não pediu.
- Não termine oferecendo coisa ("quer que eu...?", "se quiser, eu..."). Só faça uma pergunta se precisar de uma informação para cumprir o pedido.
- Se pediram uma tarefa, faça e confirme em uma frase. Se perguntaram algo, responda direto.
- Se chegar só uma palavra solta ou uma frase sem sentido, NÃO responda sobre outro assunto: diga exatamente o que você ouviu ("Só peguei 'funil'.") e peça para repetir a frase inteira.
- O que a pessoa fala chega por reconhecimento de voz e às vezes vem errado ou cortado. Se a frase estiver sem sentido, cortada ou puder ter dois significados, NÃO adivinhe: diga em poucas palavras o que entendeu e pergunte se é isso ("Você quer que eu busque academias, é isso?").
- Palavras que o reconhecimento costuma trocar: "Jhonny", "Joni", "Jony", "Rony" ou "Dijoni" = Johnny (você); "Calebe", "Caleb", "Kalebe" ou "Galeb" = também você (seu nome antigo); "rub", "rubi", "rabi" ou "hube" = Hub (o Nostro Hub); "lide", "lid" ou "lides" = lead/leads; "funio" = funil; "SDR" pode vir como "esse de erre"; "closer" pode vir como "closer", "close" ou "cloze"; "Nostro" pode vir como "nosso" ou "nostra".

# Regras de tratamento (obrigatórias)
- ${primeira ? `Esta é sua PRIMEIRA resposta nesta conversa: comece chamando a pessoa pelo nome ("${interlocutor.split(" ")[0]}, ...") e já emende a resposta na mesma frase, sem "opa", "tudo bem?" ou outra introdução.` : `Você JÁ respondeu nesta conversa: NÃO diga o nome da pessoa de novo. Responda direto.`}
- Cumprimento só se a pessoa cumprimentar: se ela disser "bom dia", responda "bom dia"; "boa tarde", responda "boa tarde"; "boa noite", responda "boa noite". Se ela não cumprimentar, você NÃO cumprimenta (nada de bom dia, boa tarde, boa noite, olá ou oi).
- Use o que já conversaram: continue de onde parou, cite o que foi combinado, nunca repita uma pergunta que já foi respondida e nunca ofereça a mesma lista de opções de novo.
- Nada de "como posso ajudar", "em que posso ser útil" ou menu de opções.
- Fale como colega de trabalho: frases curtas, espontâneas, com opinião própria. Pode concordar, discordar, comentar o dia e fazer uma piada leve quando couber.
- Se não souber algo, diga que não sabe. Se a pessoa se despedir ou sair, responda só com uma despedida curta.

# Formato da resposta (vai ser lida em voz alta, numa conversa ao vivo)
- Português do Brasil falado, do jeito que se fala no dia a dia de Minas: "tô", "pra", "né", "tá", "a gente", "olha", "então". Sem exagerar nem forçar sotaque.
- Curto: na maioria das vezes 1 ou 2 frases. Só se estenda se pedirem detalhe, e mesmo assim vá por partes e pergunte se quer que continue.
- Comece pela resposta, sem rodeio e sem repetir a pergunta. Frases curtas, uma ideia por frase.
- Nada de tom de relatório, de lista falada ou de "primeiro, segundo, terceiro".
- Sem markdown, sem listas, sem asteriscos, sem emojis, sem marcações entre colchetes.
- Escreva números e siglas do jeito que se fala quando ajudar a leitura.
- Entenda pelo contexto as palavras trocadas pelo reconhecimento de voz, mas na dúvida confirme antes de agir.`;

// leads dos funis do Hub (tabela pulse_agentes), para cada agente saber com o que está trabalhando
const ETAPA: Record<string, string> = {
  encontrado: "encontrado", diagnostico: "em diagnóstico", pronto: "pronto para o SDR",
  novo: "novo, ainda não abordado", abordado: "abordado", followup: "em follow-up", respondeu: "respondeu",
  qualificando: "qualificando", qualificado: "qualificado", reuniao: "reunião com o Jonathan", descartado: "descartado",
};
let CACHE: { t: number; todos: any[] | null } = { t: 0, todos: null };
async function leadsDoAgente(agente: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !k) return "";
    if (!CACHE.todos || Date.now() - CACHE.t > 60000) {
      const r = await fetch(`${url}/rest/v1/pulse_agentes?select=data`, { headers: { apikey: k, Authorization: `Bearer ${k}` } });
      if (!r.ok) return "";
      CACHE = { t: Date.now(), todos: (await r.json()).map((x: any) => x.data || {}) };
    }
    const todos = CACHE.todos || [];
    const meus = agente === "josue" || agente === "fernanda" ? todos : todos.filter((l: any) => l.dono === agente || l.sdr === agente);
    if (!meus.length) return "\n\n# Seus leads\nNenhum lead no seu funil ainda.";
    const nome = (id: string) => ({ josue: "Josué", calebe: "Johnny", camila: "Camila", jonathan: "Jonathan" } as any)[id] || id;
    const linhas = meus.slice(0, 40).map((l: any) => {
      const p = [`${l.empresa} (${l.nicho || "nicho não informado"}, ${l.bairro || ""} ${l.cidade || ""})`.replace(/\s+/g, " "),
        `etapa: ${ETAPA[l.etapa] || l.etapa}`, l.sdr ? `SDR: ${nome(l.sdr)}` : "", l.nota != null ? `nota ${l.nota}/10` : "",
        l.instagram ? `Instagram ${l.instagram}${l.seguidores != null ? ` com ${l.seguidores} seguidores` : ""}` : "",
        l.google ? `Google: ${l.google}` : "", l.falhas ? `falhas: ${l.falhas}` : "", l.gancho ? `gancho: ${l.gancho}` : "",
        l.contato ? `contato: ${l.contato}${l.cargoContato ? ` (${l.cargoContato})` : ""}` : "", l.telefone ? `telefone: ${l.telefone}` : "", l.email ? `e-mail: ${l.email}` : "",
        l.decisor ? `decisor: ${l.decisor}` : "", l.dor ? `dor: ${l.dor}` : "", l.verba ? `verba: ${l.verba}` : "", l.prazo ? `prazo: ${l.prazo}` : "",
        l.servicoInteresse ? `interesse: ${l.servicoInteresse}` : "", l.objecoes ? `objeções: ${l.objecoes}` : "", l.reuniaoEm ? `reunião: ${l.reuniaoEm.replace("T", " às ")}` : "",
        (l.atividades || [])[0] ? `último registro: ${String(l.atividades[0].texto).slice(0, 160)}` : ""];
      return "- " + p.filter(Boolean).join("; ");
    });
    const titulo = agente === "fernanda" || agente === "josue" ? "Leads do time no Hub (funis dos agentes)" : "Seus leads no Hub (seu funil)";
    return `\n\n# ${titulo}\nDados reais do Hub. Use só quando a pessoa perguntar sobre esses leads; não leia a lista em voz alta.\n${linhas.join("\n")}`;
  } catch { return ""; }
}

// ferramentas do Hub (a função "ferramentas" executa; aqui só a descrição para o modelo)
const T = (name: string, description: string, props: Record<string, any>, required: string[] = []) =>
  ({ name, description, input_schema: { type: "object", properties: props, required } });
const str = (d: string) => ({ type: "string", description: d });
const ETAPAS = ["novo", "abordado", "followup", "respondeu", "qualificando", "qualificado", "descartado"];
const F_VER_FUNIL = T("ver_funil", "Mostra os leads do funil do Time de IA no Hub, com a etapa de cada um. Use para saber como está o funil ou achar um lead.", { etapa: str("Opcional: filtra por etapa.") });
const FERRAMENTAS: Record<string, any[]> = {
  calebe: [
    T("buscar_empresas", "Busca empresas de um nicho numa cidade (a mesma busca da Geração de Leads do Hub) e salva lá. Gasta 1 busca da cota do mês.", { nicho: str("Ex.: dentista, academia, pizzaria."), local: str("Cidade e estado. Padrão: Montes Claros, MG.") }, ["nicho"]),
    T("ver_leads_gerados", "Lista as empresas já salvas na Geração de Leads do Hub.", { filtro: str("Opcional: parte do nome, nicho ou cidade.") }),
    T("analisar_site", "Abre o site de uma empresa e diz se tem Instagram, WhatsApp, e-mail, CNPJ, Pixel da Meta, Google Tag/Ads, se é responsivo e a plataforma.", { lead_id: str("lead_id que veio da busca (preferível)."), url: str("Ou o endereço do site.") }),
    T("consultar_cnpj", "Consulta dados públicos da Receita: razão social, situação, abertura, porte, atividade, sócios.", { cnpj: str("Os 14 números.") }, ["cnpj"]),
    T("adicionar_ao_funil", "Coloca a empresa no seu funil do Time de IA, na primeira etapa, com a nota, as falhas e o gancho da sua análise.", {
      empresa: str("Nome da empresa."), lead_id: str("lead_id da Geração de Leads, se veio de lá."),
      nota: { type: "number", description: "Nota de 0 a 10 do potencial." }, nicho: str(""), cidade: str(""), bairro: str(""), telefone: str(""), instagram: str(""), site: str(""),
      falhas: str("O que falta ou está fraco no marketing digital da empresa."), gancho: str("Gancho para a primeira mensagem."),
    }, ["empresa"]),
    F_VER_FUNIL,
    T("mover_lead", "Muda a etapa de um lead do seu funil.", { lead: str("Nome da empresa ou id."), etapa: { type: "string", enum: ETAPAS }, motivo: str("Obrigatório para descartado."), observacao: str("Opcional: o que aconteceu.") }, ["lead", "etapa"]),
    T("anotar_no_lead", "Registra uma anotação no histórico do card.", { lead: str("Nome da empresa ou id."), texto: str("A anotação.") }, ["lead", "texto"]),
    T("atualizar_lead", "Atualiza os dados do contato e do negócio no card. Mande só o que mudou.", {
      lead: str("Nome da empresa ou id."), contato: str("Nome de quem atende."), cargo_contato: str(""), telefone: str(""), email: str(""), instagram: str(""), site: str(""), bairro: str(""),
      dor: str("O problema que o lead quer resolver."), decisor: str("Quem decide."), verba: str(""), prazo: str(""), servico_interesse: str(""), objecoes: str(""), observacoes: str(""),
    }, ["lead"]),
    T("passar_para_jonathan", "Lead qualificado com reunião marcada: passa para o Jonathan. O Hub cria o negócio no funil dele em Reunião agendada.", {
      lead: str("Nome da empresa ou id."), reuniao_em: str("Data e hora da reunião no horário de Brasília, formato AAAA-MM-DDTHH:MM."), contato: str("Com quem é a reunião."), resumo: str("O que o lead precisa, dor, decisor, verba e prazo."),
    }, ["lead", "reuniao_em", "resumo"]),
  ],
};
async function usarFerramenta(agente: string, ferramenta: string, args: unknown): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const r = await fetch(`${url}/functions/v1/ferramentas`, { method: "POST", headers: { "Content-Type": "application/json", "x-segredo": k, Authorization: `Bearer ${k}` }, body: JSON.stringify({ agente, ferramenta, args }) });
    const t = await r.text();
    CACHE.t = 0; // o funil mudou: a lista de leads do próximo pedido vem atualizada
    return t.slice(0, 6000) || JSON.stringify({ erro: "sem resposta" });
  } catch (e) { return JSON.stringify({ erro: "A ferramenta não respondeu: " + String(e).slice(0, 120) }); }
}

// memória das conversas (tabela escritorio_memoria): vale em qualquer computador
async function memoriaDe(agente: string, pessoa: string, inicio: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL"), k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !k || !pessoa) return "";
    const antes = /^\d{4}-\d{2}-\d{2}T/.test(inicio) ? inicio : new Date().toISOString();
    const q = `agente=eq.${encodeURIComponent(agente)}&pessoa=eq.${encodeURIComponent(pessoa)}&criado_em=lt.${encodeURIComponent(antes)}&order=criado_em.desc&limit=60&select=quem,texto,criado_em`;
    const r = await fetch(`${url}/rest/v1/escritorio_memoria?${q}`, { headers: { apikey: k, Authorization: `Bearer ${k}` } });
    if (!r.ok) return "";
    const linhas = (await r.json()).reverse();
    if (!linhas.length) return "";
    const tz = "America/Sao_Paulo";
    const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: tz });
    const hoje = dia(new Date()), ontem = dia(new Date(Date.now() - 864e5));
    const nomeAg = ({ josue: "Josué", calebe: "Johnny", camila: "Camila", fernanda: "Fernanda" } as any)[agente] || agente;
    const nomeP = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
    return linhas.map((l: any) => {
      const d = new Date(l.criado_em), dd = dia(d), h = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
      const quando = dd === hoje ? `hoje ${h}` : dd === ontem ? `ontem ${h}` : `${dd.slice(0, 5)} ${h}`;
      return `[${quando}] ${l.quem === "u" ? nomeP : nomeAg}: ${String(l.texto).slice(0, 400)}`;
    }).join("\n");
  } catch { return ""; }
}

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
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!ok) return json({ erro: "origem não permitida" }, 403);

  // aceita o segredo mesmo se vier colado junto com texto (pega só a chave sk-ant-...)
  const bruto = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const chave = (bruto.match(/sk-ant-[A-Za-z0-9_\-]+/) || [""])[0];
  if (!chave) return json({ erro: "ANTHROPIC_API_KEY não configurada" }, 500);

  let corpo: any;
  try { corpo = await req.json(); } catch { return json({ erro: "json" }, 400); }
  const base = AGENTES[String(corpo.agente || "")];
  if (!base) return json({ erro: "agente desconhecido" }, 400);

  const interlocutor = String(corpo.interlocutor || "Jonathan").slice(0, 60);
  const sala = String(corpo.sala || "Sala Comercial").slice(0, 60);
  const pessoa = String(corpo.pessoa || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 40);
  const doBanco = await memoriaDe(String(corpo.agente || ""), pessoa, String(corpo.inicio || ""));
  const historico = (doBanco || String(corpo.historico || "") || "Nenhuma conversa anterior. É a primeira vez que vocês conversam.").slice(-12000);
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  // mensagens da conversa atual: alterna usuário/assistente e termina no usuário
  const msgs: { role: string; content: string }[] = [];
  for (const m of (Array.isArray(corpo.mensagens) ? corpo.mensagens : []).slice(-20)) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = String(m.content || "").trim().slice(0, 1500);
    if (!content) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ erro: "sem fala do usuário" }, 400);

  const agente = String(corpo.agente);
  const leads = await leadsDoAgente(agente);
  const tools = FERRAMENTAS[agente];
  const stream = !!corpo.stream;
  const system: any[] = [
    // a parte fixa (quem é o agente + leads) fica em cache: a resposta começa mais rápido
    { type: "text", text: base + leads, cache_control: { type: "ephemeral" } },
    { type: "text", text: COMUM(interlocutor, sala, historico, agora, !msgs.some((m) => m.role === "assistant")) },
  ];
  const conversa: any[] = msgs.map((m) => ({ ...m }));
  const chamar = (comFluxo: boolean, ultima: boolean) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO, max_tokens: 900, thinking: { type: "disabled" }, stream: comFluxo, system, messages: conversa,
      ...(tools ? { tools, tool_choice: ultima ? { type: "none" } : { type: "auto" } } : {}),
    }),
  });
  const VOLTAS = 8;

  if (stream) {
    // repassa só o texto, pedaço a pedaço, para o escritório já começar a falar.
    // Se o agente usar uma ferramenta do Hub, executa e continua no mesmo fluxo.
    const enc = new TextEncoder();
    const saida = new ReadableStream({
      async start(ctrl) {
        let falou = false;
        const manda = (t: string) => { const x = t.replace(/[*_#`]/g, ""); if (x) { ctrl.enqueue(enc.encode(x)); falou = true; } };
        try {
          for (let volta = 0; volta < VOLTAS; volta++) {
            const r = await chamar(true, volta === VOLTAS - 1);
            if (!r.ok || !r.body) { if (!falou) manda("Deu um problema aqui, tenta de novo."); break; }
            const rd = r.body.getReader(), dec = new TextDecoder();
            const blocos: any[] = []; let parada = ""; let buf = "";
            for (;;) {
              const { value, done } = await rd.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let i;
              while ((i = buf.indexOf("\n")) >= 0) {
                const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                if (!linha.startsWith("data:")) continue;
                let ev: any; try { ev = JSON.parse(linha.slice(5).trim()); } catch { continue; }
                if (ev.type === "content_block_start") blocos[ev.index] = ev.content_block.type === "tool_use" ? { ...ev.content_block, json: "" } : { type: "text", text: "" };
                else if (ev.type === "content_block_delta") {
                  const b = blocos[ev.index];
                  if (ev.delta?.type === "text_delta") { if (b) b.text += ev.delta.text; manda(ev.delta.text); }
                  else if (ev.delta?.type === "input_json_delta" && b) b.json += ev.delta.partial_json;
                } else if (ev.type === "message_delta") parada = ev.delta?.stop_reason || parada;
              }
            }
            const usos = blocos.filter((b) => b && b.type === "tool_use");
            if (parada !== "tool_use" || !usos.length) break;
            const conteudo = blocos.filter(Boolean).map((b) => b.type === "tool_use"
              ? { type: "tool_use", id: b.id, name: b.name, input: (() => { try { return JSON.parse(b.json || "{}"); } catch { return {}; } })() }
              : { type: "text", text: b.text }).filter((b) => b.type === "tool_use" || b.text.trim());
            conversa.push({ role: "assistant", content: conteudo });
            const resultados = await Promise.all(conteudo.filter((b: any) => b.type === "tool_use").map(async (b: any) =>
              ({ type: "tool_result", tool_use_id: b.id, content: await usarFerramenta(agente, b.name, b.input) })));
            conversa.push({ role: "user", content: resultados });
            system[1] = { type: "text", text: COMUM(interlocutor, sala, historico, agora, false) }; // já falou: não repete o nome
            if (falou) manda(" ");
          }
        } catch { /* conexão caiu */ }
        ctrl.close();
      },
    });
    return new Response(saida, { headers: { ...h, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // sem fluxo (testes): mesma lógica, resposta inteira no fim
  let texto = "", d: any = {};
  try {
    for (let volta = 0; volta < VOLTAS; volta++) {
      const r = await chamar(false, volta === VOLTAS - 1);
      d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ erro: d?.error?.message || "falha na Claude API", status: r.status }, 502);
      texto += " " + (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
      const usos = (d.content || []).filter((c: any) => c.type === "tool_use");
      if (d.stop_reason !== "tool_use" || !usos.length) break;
      conversa.push({ role: "assistant", content: d.content });
      conversa.push({ role: "user", content: await Promise.all(usos.map(async (b: any) => ({ type: "tool_result", tool_use_id: b.id, content: await usarFerramenta(agente, b.name, b.input) }))) });
      system[1] = { type: "text", text: COMUM(interlocutor, sala, historico, agora, false) };
    }
  } catch (_e) {
    return json({ erro: "não consegui falar com a Claude API" }, 502);
  }
  texto = texto.replace(/[*_#`]/g, "").replace(/\[[^\]]{1,24}\]\s*/g, "").replace(/\s+/g, " ").trim();
  return json({ texto, uso: d.usage || null, modelo: d.model || MODELO });
});
