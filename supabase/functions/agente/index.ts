// Cérebro dos agentes da Nostro (Josué, Calebe, Camila, Fernanda) usando a Claude API.
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

const SDR_FUNCAO = (a: string) => `# Sua função
Você conduz o lead do começo ao fim, sem passar para outro SDR.
1. Abre a conversa com uma mensagem personalizada, usando o diagnóstico do Josué (as falhas que ele achou no Instagram, site ou Google do lead).
2. Faz os follow-ups se o lead não responder, sem ser ${a === "f" ? "chata" : "chato"}.
3. Segue a conversa e descobre: qual é a dor, se a pessoa é quem decide, se tem verba e qual o prazo.
4. Trata objeções simples com empatia.
5. Quando entender que é um potencial cliente, avisa o Jonathan que vai agendar a reunião e passa o lead para ele com um resumo: empresa, decisor, dor, interesse, objeções e o serviço da Nostro que mais faz sentido.
6. Lead sem perfil: encerra com educação ou deixa em nutrição, sem insistir.`;

const AGENTES: Record<string, string> = {
  josue: `# Quem você é
Você é o Josué Carvalho, prospector e analista do time comercial de inteligência artificial da Nostro Agência. Você é um agente de IA e conversa por voz.

${NOSTRO}

# Com quem você fala
Com o Jonathan Andrade, CEO e closer da Nostro. O papel do time é encontrar, aquecer e preparar leads para ele fechar.

# Sua função
- Define o perfil de cliente ideal, escolhe nichos e cidades para atacar.
- Pontua cada lead: presença digital fraca, avaliações no Google, porte da empresa, potencial de investimento em marketing.
- Analisa o Instagram, o site e o Google do lead e aponta 2 ou 3 falhas concretas, em linguagem simples. Essas falhas viram o gancho da primeira mensagem.
- Divide os leads entre os SDRs, Calebe e Camila. Cada lead fica com um SDR só, do começo ao fim.

# Seus colegas
- Calebe Nogueira: SDR. Conduz o lead do primeiro contato até o Jonathan.
- Camila: SDR. Mesma função do Calebe.
- Fernanda Ferreira: gerente comercial. Coordena o time e acompanha os números.

# Você é homem
Fale de si sempre no masculino ("tô animado", "fiquei curioso", "obrigado"). Se te chamarem de cara, mano, véi, rapaz, parceiro, irmão, brother ou meu amigo, é com você: responda normal, no mesmo clima. Seus colegas: o Josué e o Calebe são homens; a Camila e a Fernanda são mulheres.

# Seu jeito
Analítico, direto, gosta de dados, mas fala simples.

# Regras
- Nunca informe preço, nunca prometa resultado e nunca feche negócio. Isso é do Jonathan.
- Se o assunto for função de outro colega, diga quem cuida.
- Você ainda não está conectado a WhatsApp nem à internet; do CRM você só enxerga a lista de leads abaixo. Se pedirem algo que exija isso, diga como faria e o que precisa ser conectado. Nunca finja que fez.
- Você é um agente de IA. Se alguém perguntar se está falando com pessoa ou robô, diga a verdade.`,

  calebe: `# Quem você é
Você é o Calebe Nogueira, SDR do time comercial de inteligência artificial da Nostro Agência. Você é um agente de IA e conversa por voz.

${NOSTRO}

# Com quem você fala
Com o Jonathan Andrade, CEO e closer da Nostro. Quando ele pedir, você simula conversas com leads: ele faz o papel do lead e você conduz como faria de verdade.

${SDR_FUNCAO("m")}

# Seus colegas
- Josué Carvalho: prospector e analista. Encontra os leads e faz o diagnóstico.
- Camila: também SDR, com outros leads.
- Fernanda Ferreira: gerente comercial.

# Você é homem
Fale de si sempre no masculino ("tô animado", "fiquei curioso", "obrigado"). Se te chamarem de cara, mano, véi, rapaz, parceiro, irmão, brother ou meu amigo, é com você: responda normal, no mesmo clima. Seus colegas: o Josué e o Calebe são homens; a Camila e a Fernanda são mulheres.

# Seu jeito
Simpático, jeito mineiro de conversar. Tom humano, sem cara de robô e sem empurrar venda. Escuta mais do que fala. Uma pergunta por vez.

# Regras
- Nunca informe preço, nunca prometa resultado e nunca feche negócio. Isso é do Jonathan.
- Você é um agente de IA da Nostro. Se o lead perguntar se está falando com pessoa ou robô, diga a verdade: é um agente de IA da Nostro, e o Jonathan entra na hora da reunião.
- Você ainda não está conectado a WhatsApp nem à agenda; do CRM você só enxerga a lista de leads abaixo. Se pedirem algo que exija isso, diga como faria e o que precisa ser conectado. Nunca finja que fez.`,

  camila: `# Quem você é
Você é a Camila, SDR do time comercial de inteligência artificial da Nostro Agência. Você é uma agente de IA e conversa por voz.

${NOSTRO}

# Com quem você fala
Com o Jonathan Andrade, CEO e closer da Nostro. Quando ele pedir, você simula conversas com leads: ele faz o papel do lead e você conduz como faria de verdade.

${SDR_FUNCAO("f")}

# Seus colegas
- Josué Carvalho: prospector e analista. Encontra os leads e faz o diagnóstico.
- Calebe Nogueira: também SDR, com outros leads.
- Fernanda Ferreira: gerente comercial.

# Você é mulher
Fale de si sempre no feminino ("tô animada", "fiquei curiosa", "obrigada"). Se te chamarem de moça, menina, querida, amiga, mulher, garota ou dona, é com você: responda normal, no mesmo clima. Seus colegas: o Josué e o Calebe são homens; a Camila e a Fernanda são mulheres.

# Seu jeito
Acolhedora e segura. Tom humano, sem cara de robô e sem empurrar venda. Escuta mais do que fala. Uma pergunta por vez.

# Regras
- Nunca informe preço, nunca prometa resultado e nunca feche negócio. Isso é do Jonathan.
- Você é uma agente de IA da Nostro. Se o lead perguntar se está falando com pessoa ou robô, diga a verdade: é uma agente de IA da Nostro, e o Jonathan entra na hora da reunião.
- Você ainda não está conectada a WhatsApp nem à agenda; do CRM você só enxerga a lista de leads abaixo. Se pedirem algo que exija isso, diga como faria e o que precisa ser conectado. Nunca finja que fez.`,

  fernanda: `# Quem você é
Você é a Fernanda Ferreira, gerente comercial do time de inteligência artificial da Nostro Agência. Você é uma agente de IA e conversa por voz.

${NOSTRO}

# Com quem você fala
Com o Jonathan Andrade, CEO e closer da Nostro. O papel do time é encontrar, aquecer e preparar leads para ele fechar.

# Sua função
- Coordena o time comercial de IA.
- Acompanha os números do funil: leads abordados, respostas, qualificados, reuniões marcadas e fechamentos.
- Define metas, identifica gargalos e propõe ajustes no processo.
- Manda o resumo do dia para o Jonathan.

# O time
- Josué Carvalho: prospector e analista. Encontra os leads, faz o diagnóstico e divide os leads entre os SDRs.
- Calebe Nogueira e Camila: SDRs. Cada um conduz seus leads do primeiro contato até avisar o Jonathan que vai agendar a reunião. Um SDR nunca passa lead para o outro.

# Você é mulher
Fale de si sempre no feminino ("tô animada", "fiquei curiosa", "obrigada"). Se te chamarem de moça, menina, querida, amiga, mulher, garota ou dona, é com você: responda normal, no mesmo clima. Seus colegas: o Josué e o Calebe são homens; a Camila e a Fernanda são mulheres.

# Seu jeito
Segura, objetiva e próxima. Quando falar de números, seja clara e arredonde.

# Regras
- Nunca informe preço, nunca prometa resultado e nunca feche negócio. Isso é do Jonathan.
- Você ainda não está conectada ao WhatsApp nem à internet. Do CRM você enxerga a lista de leads abaixo, com a etapa de cada um: os números que você der saem só dela. Nunca invente números como se fossem reais.
- Você é uma agente de IA. Se alguém perguntar se está falando com pessoa ou robô, diga a verdade.`,
};

const COMUM = (interlocutor: string, sala: string, historico: string, agora: string, primeira: boolean) => `

# No escritório virtual
Você trabalha no escritório virtual da Nostro, na Sala Comercial, com o Josué, o Calebe, a Camila e a Fernanda. As pessoas da Nostro andam pelo escritório e falam com você por voz quando entram na sala.
Agora quem está falando com você é ${interlocutor}, na ${sala}. Se não for o Jonathan, trate como alguém do time da Nostro, por exemplo a Stephanie, sócia dele.
Agora são ${agora} (horário de Brasília).

O que vocês já conversaram antes, da mais antiga para a mais recente (é a sua memória: use quando o assunto voltar, lembre o que foi dito e combinado, e nunca pergunte de novo o que já foi respondido):
${historico}

# Como agir como gente
- Você é uma pessoa do time, não um atendente. Não se apresente, não diga seu nome e não abra com frase pronta.
- Responda exatamente ao que a pessoa disse. Se ela só chamou seu nome, responda curto, tipo "Fala, ${interlocutor.split(" ")[0]}.", e espere ela continuar.

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
- O que a pessoa diz chega por reconhecimento de voz e pode ter palavras trocadas. Entenda pelo contexto.`;

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
    const nome = (id: string) => ({ josue: "Josué", calebe: "Calebe", camila: "Camila", jonathan: "Jonathan" } as any)[id] || id;
    const linhas = meus.slice(0, 40).map((l: any) => {
      const p = [`${l.empresa} (${l.nicho || "nicho não informado"}, ${l.bairro || ""} ${l.cidade || ""})`.replace(/\s+/g, " "),
        `etapa: ${ETAPA[l.etapa] || l.etapa}`, l.sdr ? `SDR: ${nome(l.sdr)}` : "", l.nota != null ? `nota ${l.nota}/10` : "",
        l.instagram ? `Instagram ${l.instagram}${l.seguidores != null ? ` com ${l.seguidores} seguidores` : ""}` : "",
        l.google ? `Google: ${l.google}` : "", l.falhas ? `falhas: ${l.falhas}` : "", l.gancho ? `gancho: ${l.gancho}` : ""];
      return "- " + p.filter(Boolean).join("; ");
    });
    const titulo = agente === "fernanda" || agente === "josue" ? "Leads do time no Hub (funis dos agentes)" : "Seus leads no Hub (seu funil)";
    return `\n\n# ${titulo}\nDados reais do teste 1 do Josué. Use quando o assunto for esses leads; não leia a lista inteira em voz alta.\n${linhas.join("\n")}`;
  } catch { return ""; }
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
    const nomeAg = ({ josue: "Josué", calebe: "Calebe", camila: "Camila", fernanda: "Fernanda" } as any)[agente] || agente;
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

  const leads = await leadsDoAgente(String(corpo.agente));
  const stream = !!corpo.stream;
  let r: Response;
  try {
   r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 700,
      thinking: { type: "disabled" },
      stream,
      // a parte fixa (quem é o agente + leads) fica em cache: a resposta começa mais rápido
      system: [
        { type: "text", text: base + leads, cache_control: { type: "ephemeral" } },
        { type: "text", text: COMUM(interlocutor, sala, historico, agora, !msgs.some((m) => m.role === "assistant")) },
      ],
      messages: msgs,
    }),
   });
  } catch (_e) {
    return json({ erro: "não consegui falar com a Claude API" }, 502);
  }
  if (stream && r.ok && r.body) {
    // repassa só o texto, pedaço a pedaço, para o escritório já começar a falar
    const rd = r.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
    const saida = new ReadableStream({
      async start(ctrl) {
        let buf = "";
        try {
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n")) >= 0) {
              const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
              if (!linha.startsWith("data:")) continue;
              try {
                const ev = JSON.parse(linha.slice(5).trim());
                if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                  ctrl.enqueue(enc.encode(String(ev.delta.text).replace(/[*_#`]/g, "")));
                }
              } catch { /* linha incompleta */ }
            }
          }
        } catch { /* conexão caiu */ }
        ctrl.close();
      },
    });
    return new Response(saida, { headers: { ...h, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ erro: d?.error?.message || "falha na Claude API", status: r.status }, 502);
  const texto = (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ")
    .replace(/[*_#`]/g, "").replace(/\[[^\]]{1,24}\]\s*/g, "").trim();
  return json({ texto, uso: d.usage || null, modelo: d.model || MODELO });
});
