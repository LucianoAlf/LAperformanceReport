/// <reference lib="deno.ns" />
// Extrator semântico de conversas — A5 do Mapa de Sinais.
//
// PARA QUE EXISTE: o que a equipe fala com o cliente no WhatsApp é o dado mais
// rico da escola e não alimentava nada. Em 03/09/2026, olhando o espelho a olho
// nu, havia três cancelamentos declarados parados há 8-12 dias sem ninguém ver:
//   "Não. Para rescindir o contrato"
//   "A última aula dela seria 7/08 referente a julho, depois não iríamos mais"
//   "Eu fiz o pedido pra cancelar. Por enquanto não está fazendo bem pro jammal"
//
// POR QUE NÃO É SQL: a versão determinística ("a última mensagem é do contato")
// dá 248 casos com ~24% de precisão — 23 de 25 amostras aleatórias eram
// "👍"/"Obrigada". Uma lista assim chega na guardiã uma vez e nunca mais é lida.
//
// DIVISÃO DE PODER (mesmo padrão de `classificar-resposta-evasao`):
//   - o modelo DESCREVE (tipo, precisa_resposta, confiança, resumo, trecho);
//   - `decidirSinal()` (função pura, em contract.ts) DECIDE se vira sinal;
//   - a severidade e a orientação vêm de `radar_regras`, nunca do modelo.
// O modelo não escolhe prioridade de retenção e não escreve para o cliente.
//
// O QUE ELE NÃO FAZ: não manda mensagem para ninguém e não cria tarefa. Ele
// grava em `radar_sinais`; a entrega é da camada de destinatários.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  chaveDedup,
  chaveIdempotencia,
  competenciaBrt,
  decidirSinal,
  decidirRetomada,
  type VeredictoConversa,
} from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODELO = "gpt-5.4-mini-2026-03-17";
// Formato `<prompt>-d<decisao>`: o prompt e a funcao pura versionam junto, mas
// mudam por motivos diferentes. Trocar a decisao sem trocar o prompt precisa
// invalidar o ledger do mesmo jeito — senao a conversa ja classificada nunca
// reaproveita a regra nova (foi o caso da Graciele em 03/09).
// v5-r1 (05/09): tipo `retomar_depois` — o BUMERANGUE. Subir a versao e
// obrigatorio: a chave de idempotencia do log a inclui, entao sem o bump as
// conversas ja lidas nunca seriam reavaliadas com o tipo novo e o passado
// ficaria de fora. A dedup do SINAL nao usa a versao, entao reclassificar nao
// duplica item na pauta.
const PROMPT_VERSAO = "v5-r1";
const SOL_EXPORT_URL =
  "https://bvltexmlmydsncfjstbr.supabase.co/functions/v1/exportar-candidatos-atendimento";
const CONCORRENCIA = 8;
const TETO_CLASSIFICACOES = 300;

const SYSTEM =
  `Você lê o final de uma conversa de WhatsApp entre uma escola de música e um
cliente (aluno, responsável ou interessado). A última mensagem foi do CLIENTE e
ninguém da escola respondeu ainda.

Sua tarefa é dizer O QUE ESTÁ ACONTECENDO, escolhendo UM tipo:

- cancelamento_declarado: disse que vai SAIR DA ESCOLA — encerrar a matrícula,
  cancelar ou rescindir o CONTRATO, trancar, não renovar, não continuar no
  curso, ou que a última aula já foi. Vale mesmo dito de passagem.
  ⚠️ Desmarcar, faltar ou remarcar UMA aula NÃO é cancelamento: é
  ausencia_ou_doenca. "Vou desmarcar a aula de amanhã" é falta;
  "vou cancelar o curso" é cancelamento.
- dificuldade_financeira: disse que não vai conseguir pagar, pediu prazo,
  parcelamento, desconto, ou avisou que vai atrasar.
- promessa_sem_desfecho: a ESCOLA prometeu algo (retornar, verificar, enviar,
  confirmar) e a conversa parou sem isso acontecer. Vale inclusive quando o
  cliente aceitou de bom grado e ficou esperando: "obrigada, fico no aguardo"
  depois de "vou verificar com o financeiro" é promessa sem desfecho — quem
  deve o retorno é a escola.
  ⚠️ Só use este tipo quando quem prometeu foi a ESCOLA. Se quem ficou de fazer
  algo foi o CLIENTE (assinar o contrato, mandar o comprovante, escolher o
  horário, confirmar a presença), a bola está com ele e isto NÃO é
  promessa_sem_desfecho — é cortesia ou outro.
- reposicao_pedida: pediu para repor, remarcar ou recuperar uma aula perdida e
  não há confirmação.
- ausencia_ou_doenca: avisou falta, doença, viagem ou impedimento — inclusive
  quando é só um aviso, sem pergunta.
- pergunta_sem_resposta: o cliente está esperando algo CONCRETO da escola —
  uma informação, uma decisão, uma providência — e não se encaixa nos tipos
  acima. Não use este tipo só porque a escola "poderia responder algo".
- retomar_depois: o LEAD adiou COM INTENCAO — disse que volta a falar, ou
  pediu para ser procurado mais para frente. "me chama em janeiro", "depois das
  ferias eu vejo", "daqui a 3 meses a gente resolve", "agora nao da, mas me
  procura no fim do ano".
  ⚠️ A marca e ADIAMENTO COM INTERESSE PRESERVADO. "Nao quero", "achei caro,
  vou procurar outra" e "desisti" NAO sao retomar_depois — sao outro.
  ⚠️ Se ele adiou E citou dinheiro ("ta apertado agora, me chama em janeiro"),
  vale retomar_depois: a acao certa e agendar a volta, nao oferecer
  parcelamento a quem ja disse que so decide depois.
- cortesia: fechamento educado, agradecimento, emoji, "ok", "beleza",
  "combinado". Inclui CONFIRMAÇÃO ou ACEITE de algo que a escola propôs
  ("sim", "pode ser", "confirmado", "ela vai", "tá certo") quando não sobra
  nada pendente do lado da escola.
  ⚠️ Cortesia é o tipo de quem NÃO DEIXOU NADA em aberto. Se a mensagem
  agradece E TAMBÉM carrega uma pendência, ela não é cortesia — veja a regra
  de PRECEDÊNCIA abaixo.
- aviso_operacional: recado de trânsito do dia, sem pendência
  ("estou chegando", "estamos a caminho", "já estou aí").
- spam: propaganda de outra empresa, operadora de telefonia, cobrança de
  terceiro, mensagem automática que não é da escola.
- outro: nada acima.

REGRAS DE JULGAMENTO:
- PRECEDÊNCIA: a mesma mensagem pode ter cortesia E um assunto pendente. Quando
  isso acontece, o PENDENTE VENCE — classifique pelo que ficou em aberto, nunca
  pelo "obrigada" do final. Exemplos que NÃO são cortesia:
    "Obrigada, fico no aguardo então" (a escola prometeu retorno)
      -> promessa_sem_desfecho
    "Oi, bom dia! Mandei mensagem para a professora e não obtive resposta"
      -> pergunta_sem_resposta
    "Ok, a parcela eu pago até o dia 5" -> dificuldade_financeira
    "Tudo bem, então cancela" -> cancelamento_declarado
  Só é cortesia quando, tirado o agradecimento, NÃO SOBRA NADA.
- Julgue pela ÚLTIMA mensagem do cliente, usando as anteriores só como contexto.
- "Obrigada", "👍", "❤️", "Ok", "Beleza" sozinhos são SEMPRE cortesia, ainda que
  a conversa antes fosse séria.
- Falta de ponto de interrogação não significa que não há pergunta: no WhatsApp
  quase ninguém usa.
- precisa_resposta é sobre a ESCOLA dever um retorno — não sobre o assunto ser
  importante.
- DIREÇÃO IMPORTA. Se quem está esperando é a ESCOLA (ela pediu um comprovante,
  um dado, uma confirmação, e a bola está com o cliente), então
  precisa_resposta é FALSE e o tipo é cortesia ou outro. Só sinalize quando
  quem deve alguma coisa é a escola.
- confiança "alta" só sem dúvida razoável. Na dúvida entre média e alta,
  escolha média.
- trecho_chave: copie LITERALMENTE o pedaço da mensagem do cliente que sustenta
  a sua escolha (até 200 caracteres). Se for cortesia ou spam, copie a mensagem.
- prazo_texto: SO quando o tipo for retomar_depois. Copie LITERALMENTE a
  expressao de tempo que a pessoa usou — "em janeiro", "daqui a 3 meses",
  "depois das ferias". NAO converta para data e NAO invente prazo: se ela
  adiou sem dizer quando, deixe vazio. Quem transforma isso em dia e o banco.
- resumo: uma frase curta em português, na terceira pessoa, sem saudação.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["tipo", "precisa_resposta", "confianca", "resumo", "trecho_chave", "prazo_texto"],
  properties: {
    tipo: {
      type: "string",
      enum: [
        "cancelamento_declarado",
        "dificuldade_financeira",
        "promessa_sem_desfecho",
        "reposicao_pedida",
        "ausencia_ou_doenca",
        "pergunta_sem_resposta",
        "retomar_depois",
        "cortesia",
        "aviso_operacional",
        "spam",
        "outro",
      ],
    },
    precisa_resposta: { type: "boolean" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    resumo: { type: "string" },
    trecho_chave: { type: "string" },
    // strict structured output exige toda propriedade em `required`; o modelo
    // devolve "" quando o tipo nao e retomar_depois.
    prazo_texto: { type: "string" },
  },
} as const;

interface Candidato {
  conversa_id: number;
  inbox_id: number;
  inbox_nome: string;
  unidade: string;
  departamento: string;
  contato_nome: string | null;
  telefone: string | null;
  agente_nome: string | null;
  ultimo_message_id: string;
  ultima_msg_em: string;
  horas_sem_resposta: number;
  transcript: Array<{ quem: string; quando: string; texto: string }>;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function chaveOpenAI(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("assistente_ia_config")
    .select("openai_api_key").limit(1).single();
  return data?.openai_api_key ?? Deno.env.get("OPENAI_API_KEY") ?? "";
}

async function tokenDoCofre(
  sb: SupabaseClient,
  nome: string,
): Promise<string> {
  const { data } = await sb.from("integracao_tokens")
    .select("token").eq("nome", nome).maybeSingle();
  return data?.token ?? "";
}

/** Comparação em tempo constante: sem isto, a latência do `!==` vaza o prefixo. */
function tokensBatem(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function conversaEmTexto(c: Candidato): string {
  const linhas = (c.transcript ?? []).map((m) => {
    const quem = m.quem === "contact" ? "CLIENTE" : "ESCOLA";
    return quem + ": " + (m.texto ?? "").trim();
  });
  return "Canal: " + c.inbox_nome + " (" + c.departamento + ", " + c.unidade +
    ")\nSem resposta há " + c.horas_sem_resposta + " horas.\n\n" +
    linhas.join("\n");
}

/**
 * Devolve, das conversas dadas, as que continuam ABERTAS no Chatwoot.
 *
 * Existe porque o espelho da SOL não sabe de resolução (ver o comentário no
 * passo 3b). Sem credencial configurada ou com a API fora do ar, devolve a
 * lista inteira: a falta de resposta não pode virar "todo mundo foi atendido",
 * que sumiria com a pauta em silêncio.
 */
async function filtrarAindaAbertasNoChatwoot(
  ids: number[],
  sb: SupabaseClient,
): Promise<number[]> {
  const url = Deno.env.get("CHATWOOT_URL");
  const conta = Deno.env.get("CHATWOOT_ACCOUNT_ID");
  const token = Deno.env.get("CHATWOOT_API_TOKEN");
  if (!url || !conta || !token || ids.length === 0) return ids;

  const base = url.replace(/\/+$/, "") + "/api/v1/accounts/" + conta;
  const abertas: number[] = [];
  const semResposta: number[] = [];

  await emLotes(ids, 8, async (id) => {
    try {
      const r = await fetch(base + "/conversations/" + id, {
        headers: { api_access_token: token, "User-Agent": "la-radar-sinais" },
      });
      if (!r.ok) return void semResposta.push(id);
      const c = await r.json();
      // `resolved` é a declaração da equipe. `pending`/`snoozed` seguem vivas.
      if (c?.status !== "resolved") abertas.push(id);
    } catch {
      semResposta.push(id);
    }
  });

  if (semResposta.length) {
    // Sem log isto vira "a pauta encolheu sozinha" semanas depois, sem pista.
    await sb.from("automacao_log").insert({
      evento: "mapa_sinais",
      acao: "status_chatwoot_indisponivel",
      status: "warn",
      aluno_nome: "(execucao)",
      detalhes: { conversas: semResposta.slice(0, 50), total: semResposta.length },
    });
  }
  return [...abertas, ...semResposta];
}

// Traduz o nome da unidade que vem na foto (`sol_chatwoot_inboxes.unidade`)
// para o id do LA Report. Cache em memoria: sao tres unidades e o run inteiro
// dura minutos.
let _unidades: Record<string, string> | null = null;
async function unidadeDoInbox(
  sb: SupabaseClient,
  nome: string | null | undefined,
): Promise<string | null> {
  if (!nome) return null;
  if (!_unidades) {
    const { data } = await sb.from("unidades").select("id, nome");
    _unidades = {};
    for (const u of data ?? []) {
      _unidades[String(u.nome).toLowerCase().trim()] = u.id;
    }
  }
  return _unidades[String(nome).toLowerCase().trim()] ?? null;
}

async function classificar(
  c: Candidato,
  apiKey: string,
): Promise<VeredictoConversa> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: conversaEmTexto(c) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "veredito_conversa", strict: true, schema },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      "openai_" + res.status + ": " + (await res.text()).slice(0, 200),
    );
  }
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content) as VeredictoConversa;
}

/**
 * `automacao_log.aluno_nome` é NOT NULL. Omiti-lo faz o INSERT do log de erro
 * falhar — ou seja, justamente o registro da falha some. Aconteceu no primeiro
 * run real (03/09): o placar contava `erro_insert_sinal: 1` e não havia nenhuma
 * linha de erro na tabela para dizer qual era. Por isso o log de erro tem
 * função própria, com o campo sempre preenchido.
 */
async function logErro(sb: SupabaseClient, c: Candidato, erro: string) {
  await sb.from("automacao_log").insert({
    evento: "mapa_sinais",
    acao: "extrator_conversa",
    status: "erro",
    aluno_nome: c.contato_nome ?? "(contato sem nome)",
    unidade_nome: c.unidade,
    detalhes: { conversa_id: c.conversa_id, inbox: c.inbox_nome, erro },
  });
}

/** Concorrência limitada: 300 chamadas de uma vez derrubariam a cota. */
async function emLotes<T, R>(
  itens: T[],
  n: number,
  f: (x: T) => Promise<R>,
): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += n) {
    saida.push(...await Promise.all(itens.slice(i, i + n).map(f)));
  }
  return saida;
}

serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const ensaio = url.searchParams.get("dry_run") === "1";
  const teto = Math.min(
    Number(url.searchParams.get("limite") ?? TETO_CLASSIFICACOES) ||
      TETO_CLASSIFICACOES,
    TETO_CLASSIFICACOES,
  );

  // Porta de entrada. `verify_jwt` sozinho não bastaria: a anon key é pública,
  // e `dry_run=1` não escreve no ledger — ou seja, chamada repetida com a anon
  // key queimaria crédito da OpenAI sem limite. O ledger de idempotência é o
  // freio do caminho normal; este token é o freio do ensaio.
  const [apiKey, tokenSol, tokenProprio] = await Promise.all([
    chaveOpenAI(sb),
    tokenDoCofre(sb, "sol_radar_export"),
    tokenDoCofre(sb, "radar_extrator"),
  ]);
  const oferecido = req.headers.get("x-radar-token") ??
    url.searchParams.get("token") ?? "";
  if (!tokenProprio) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, tokenProprio)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!apiKey) return json({ error: "sem_chave_openai" }, 500);
  if (!tokenSol) return json({ error: "sem_token_sol" }, 500);

  const agora = new Date();

  // TOMAR A VEZ. Neste ambiente UM disparo de pg_cron vira 2-4 execucoes da
  // edge (medido e documentado no CLAUDE.md). Sem trava, as 3 leriam o ledger
  // vazio no mesmo instante e pagariam 3x a conta da OpenAI pelo mesmo
  // trabalho. O UNIQUE parcial de `automacao_log.idempotency_key` e a trava:
  // quem inserir primeiro roda, os outros saem em 200 sem tocar em nada.
  // Janela de 1 hora — rerun manual no mesmo horario e bloqueado de proposito;
  // para ensaiar, use dry_run=1, que nao passa por aqui.
  if (!ensaio) {
    const janela = agora.toISOString().slice(0, 13);
    const { error: claim } = await sb.from("automacao_log").insert({
      evento: "mapa_sinais",
      acao: "extrator_conversa_run",
      status: "ok",
      aluno_nome: "(execucao)",
      idempotency_key: "extrator_conversa_run:" + janela,
      detalhes: { janela, prompt_versao: PROMPT_VERSAO },
    });
    if (claim) {
      return json({ ok: true, ignorado_concorrencia: true, janela });
    }
  }

  // 1) foto das conversas paradas (projeto SOL)
  const resp = await fetch(SOL_EXPORT_URL + "?limite=500", {
    headers: { "x-radar-token": tokenSol },
  });
  if (!resp.ok) return json({ error: "sol_export_" + resp.status }, 502);
  const foto = await resp.json();
  const candidatos: Candidato[] = foto.candidatos ?? [];

  // 1b) A SEGUNDA FOTO — o que faz o sinal SUMIR quando a equipe responde.
  //
  // 🔴 "CLIENTE FALOU POR ÚLTIMO" NÃO É "CLIENTE ESPERANDO" (09/09/2026).
  //
  // Esta marcação rodava AQUI, no passo 1, com a lista crua de candidatos — e
  // a lista crua é `ultimo_autor = 'contact'`. Só que a última palavra do
  // cliente costuma ser o agradecimento que ENCERRA a conversa. Medido, nos
  // 18 sinais que a vigência mantinha vivos indevidamente, a última fala era:
  //   ❤️ · 👍 · 🙏🏻 · 🥰 · "Obrigada" · "Isso" · "Sim" · "ok" · "Sábado"
  // — nove segundos depois de a consultora responder, em vários casos. Foi
  // exatamente o que a Daiana relatou: *"quando puxa é porque eu tô
  // encerrando a conversa"*.
  //
  // O absurdo era de ORDEM, não de regra: no passo 3 o modelo lê o ❤️, decide
  // `cortesia · precisa_resposta:false` e não emite sinal — mas o passo 1 já
  // tinha carimbado o sinal velho como vigente. A mesma rodada julgava "não
  // precisa mais" depois de ter afirmado "ainda precisa". O proxy grosseiro
  // atropelava o juízo fino.
  //
  // Agora a marcação é `marcarFotoJulgada()`, chamada DEPOIS da classificação,
  // com as conversas que o veredito desta rodada diz que ainda esperam.
  // ⚠️ Quem NÃO foi julgado nesta rodada (erro de OpenAI, ou além do teto)
  //    entra na lista assim mesmo: a direção da falha aqui é fail-OPEN — item
  //    velho custa um instante de atenção, item sumido custa um aluno.
  // ⚠️ Segue independendo de haver candidato novo: em dia sem nada a
  //    classificar é justamente quando os sinais velhos precisam ser
  //    reconferidos, e o veredito do ledger cobre esse caso.
  const marcarFotoJulgada = async (aindaEsperam: number[]) => {
    if (ensaio) return;
    const { error: erroFoto } = await sb.rpc("radar_marcar_foto_conversas_v1", {
      p_conversa_ids: aindaEsperam,
      // ⚠️ foto truncada não decide nada: ausência não prova resposta.
      p_truncado: foto.truncado === true,
    });
    if (erroFoto) {
      // Falha aqui NÃO derruba a extração — ela só deixa a pauta um dia mais
      // velha. Mas precisa aparecer: sem log, o sintoma seria "a pauta voltou
      // a cobrar quem já respondeu" semanas depois, sem pista nenhuma.
      await sb.from("automacao_log").insert({
        evento: "mapa_sinais",
        acao: "marcar_foto_conversas_falhou",
        status: "erro",
        aluno_nome: "(execucao)",
        detalhes: { erro: String(erroFoto.message).slice(0, 300) },
      });
    }
  };

  // 2) já classificados: a chave inclui a ÚLTIMA MENSAGEM, então conversa parada
  //    do mesmo jeito não é reclassificada — só volta se o cliente escrever de novo.
  const chaves = candidatos.map((c) =>
    chaveIdempotencia(c.conversa_id, c.ultimo_message_id, PROMPT_VERSAO)
  );
  // 🔴 O `status` vem junto porque ELE É O VEREDITO: gravamos
  // `status: d.emitir ? "ok" : "warn"` logo abaixo. Para a conversa que já foi
  // julgada nesta mesma última mensagem, este é o julgamento vigente — e é o
  // que decide se ela continua na foto. Antes só o `idempotency_key` era lido
  // e o veredito, já gravado, era jogado fora.
  const jaVistas = new Set<string>();
  const veredictoNoLedger = new Map<string, boolean>();
  for (let i = 0; i < chaves.length; i += 200) {
    const { data } = await sb.from("automacao_log")
      .select("idempotency_key, status")
      .in("idempotency_key", chaves.slice(i, i + 200));
    (data ?? []).forEach((r: { idempotency_key: string; status: string }) => {
      jaVistas.add(r.idempotency_key);
      veredictoNoLedger.set(r.idempotency_key, r.status === "ok");
    });
  }
  const pendentes = candidatos.filter((c) =>
    !jaVistas.has(
      chaveIdempotencia(c.conversa_id, c.ultimo_message_id, PROMPT_VERSAO),
    )
  );
  const novos = pendentes.slice(0, teto);

  const placar: Record<string, number> = {};
  const conta = (k: string) => placar[k] = (placar[k] ?? 0) + 1;
  const amostraEnsaio: unknown[] = [];

  // Veredito desta rodada, por conversa: `true` = a escola ainda deve retorno.
  // É o que alimenta a segunda foto lá no fim.
  const aindaEspera = new Map<number, boolean>();

  await emLotes(novos, CONCORRENCIA, async (c) => {
    let v: VeredictoConversa;
    try {
      v = await classificar(c, apiKey);
    } catch (e) {
      conta("erro_openai");
      // ⚠️ Sem veredito não se conclui nada: mantém na foto (fail-open).
      aindaEspera.set(Number(c.conversa_id), true);
      if (!ensaio) await logErro(sb, c, String(e).slice(0, 300));
      return;
    }

    const d = decidirSinal(v);
    conta("tipo:" + v.tipo);
    aindaEspera.set(Number(c.conversa_id), d.emitir);

    // ⚠️ A unidade da PORTA vai junto e desempata SÓ entre leads. A mesma
    // pessoa costuma ter lead em 2 unidades (Kellen: 2021/CG e 13997/Recreio;
    // Suelen: 8922/CG e 9826/Recreio) e a RPC escolhia "o mais novo" — foi
    // assim que duas conversas do inbox `Mila_CG` foram parar na pauta do
    // Recreio em 09/09, uma delas pedindo literalmente aula "em Campo Grande".
    // Para ALUNO a dica é ignorada de propósito: matrícula manda sobre porta.
    const ident = c.telefone
      ? (await sb.rpc("radar_resolver_entidade_por_telefone", {
        p_telefone: c.telefone,
        p_unidade_id: await unidadeDoInbox(sb, c.unidade),
      })).data
      : null;
    const entidadeTipo: string | null = ident?.entidade_tipo ?? null;

    // 🔴 A decisao da retomada e calculada AQUI, antes do `registro`, para que o
    // ENSAIO tambem a mostre. Na 1a versao ela ficava depois do `if (ensaio)
    // return` e o dry_run dizia o tipo mas nao dizia se registraria — validar
    // sem escrever era exatamente o ponto do ensaio.
    const dr = decidirRetomada(v, entidadeTipo);

    const registro = {
      evento: "mapa_sinais",
      acao: "extrator_conversa",
      status: d.emitir ? "ok" : "warn",
      idempotency_key: chaveIdempotencia(
        c.conversa_id,
        c.ultimo_message_id,
        PROMPT_VERSAO,
      ),
      unidade_nome: c.unidade,
      // NOT NULL na tabela — o fallback não é enfeite
      aluno_nome: ident?.nome ?? c.contato_nome ?? "(contato sem nome)",
      detalhes: {
        conversa_id: c.conversa_id,
        inbox: c.inbox_nome,
        departamento: c.departamento,
        agente: c.agente_nome,
        horas_sem_resposta: c.horas_sem_resposta,
        veredito: v,
        decisao: d,
        retomada: dr,
        entidade: ident,
        // o texto avaliado fica junto: sem ele, auditar semanas depois é impossível
        ultima_mensagem: (c.transcript ?? []).at(-1)?.texto ?? null,
      },
    };

    if (ensaio) {
      amostraEnsaio.push(registro.detalhes);
      return;
    }

    // O ledger e gravado DEPOIS do sinal, de proposito. Na ordem inversa, um
    // INSERT que falha deixa a conversa marcada como vista e o sinal se perde
    // para sempre — foi o que aconteceu no primeiro run real (03/09), com
    // `competencia` NOT NULL nao preenchida. Reclassificar custa centavos;
    // perder um cancelamento declarado custa um aluno.
    const encerra = async () => {
      await sb.from("automacao_log").insert(registro);
    };

    // ── BUMERANGUE ────────────────────────────────────────────────────────
    // Vem ANTES do descarte por `!d.emitir`: `retomar_depois` de proposito nao
    // vira sinal do radar (sinal significa "aja agora"), entao chegaria aqui
    // como descartado e a informacao mais valiosa do funil frio se perderia.
    if (dr.registrar && ident?.entidade_id) {
      const { data: rr, error: erroRet } = await sb.rpc(
        "registrar_retomada_de_conversa_v1",
        {
          p_lead_id: ident.entidade_id,
          p_frase: v.trecho_chave,
          p_prazo_texto: v.prazo_texto ?? null,
          p_conversation_id: c.conversa_id,
          p_motivo: null,
        },
      );
      (registro.detalhes as Record<string, unknown>).retomada_gravada =
        erroRet ? { erro: erroRet.message } : rr;
      conta(erroRet ? "retomada:erro" : "retomada:gravada");
      return await encerra();
    }

    if (!d.emitir || !d.regra_codigo) return await encerra();
    if (!entidadeTipo) {
      conta("descartado:entidade_desconhecida");
      return await encerra();
    }

    const { data: regra } = await sb.from("radar_regras")
      .select("severidade_padrao, orientacao_padrao, versao, lastro")
      .eq("codigo", d.regra_codigo).maybeSingle();

    const contexto = (ident.nome ?? c.contato_nome ?? "Contato") + " — " +
      v.resumo + " Escreveu há " + c.horas_sem_resposta +
      "h e ninguém respondeu: \"" + v.trecho_chave + "\"";

    const { error } = await sb.from("radar_sinais").insert({
      entidade_tipo: entidadeTipo,
      entidade_id: ident.entidade_id ?? null,
      // ⚠️ Fallback pelo INBOX quando o telefone nao resolve para aluno/lead.
      //    Sem ele o sinal morre no NOT NULL e a conversa lida some (caso real:
      //    conversa 20629 da LA_Secretaria_Recreio, 07/09). O cadastro do aluno
      //    tem precedencia: aluno de CG que escreve ao inbox do Recreio e CG.
      unidade_id: ident.unidade_id ?? await unidadeDoInbox(sb, c.unidade),
      regra_codigo: d.regra_codigo,
      tipo_sinal: v.tipo,
      severidade: regra?.severidade_padrao ?? "atencao",
      canonico: true,
      origem: "llm_conversa",
      // 04/09: quem PROMETEU e quem tem de cumprir. A Graciele gerou um sinal de
      // promessa feita na `LA_Secretaria_CG` (atribuida a Gabriela Leal) que caiu
      // no relatorio COMERCIAL — a Vitoria recebeu a cobranca de uma conversa que
      // nao era dela e respondeu, com razao, "eu ja atendi isso".
      // O dominio vinha da ENTIDADE (lead -> comercial) e ignorava o departamento
      // da conversa. Com origem `llm_conversa` o departamento manda: a conversa
      // tem dono, e o dono e quem prometeu.
      // ⚠️ Só decide quando o departamento e conhecido; fora disso deixa `null` e
      //    o trigger `radar_guarda_elegibilidade` resolve como antes.
      dominio: c.departamento === "comercial"
        ? "comercial"
        : c.departamento === "secretaria"
        ? (entidadeTipo === "ex_aluno" ? "historico" : "aluno")
        : undefined,
      contexto,
      interpretacao: regra?.lastro ?? null,
      orientacao: regra?.orientacao_padrao ?? null,
      evidencia: {
        conversa_id: c.conversa_id,
        inbox: c.inbox_nome,
        departamento: c.departamento,
        agente_atribuido: c.agente_nome,
        horas_sem_resposta: c.horas_sem_resposta,
        ultima_msg_em: c.ultima_msg_em,
        trecho: v.trecho_chave,
        confianca_modelo: v.confianca,
        modelo: MODELO,
        prompt_versao: PROMPT_VERSAO,
      },
      identificacao: ident.identificacao ?? null,
      detectado_em: agora.toISOString(),
      // NOT NULL. Competência = mês corrente em BRT, não em UTC: das 21h à
      // meia-noite o `now()` do banco já está no dia (e no mês) seguinte.
      competencia: competenciaBrt(agora),
      // Depois de 14 dias, responder é pior que não responder — o sinal deixa
      // de ser acionável e sair da lista é o comportamento certo.
      expira_em: new Date(
        new Date(c.ultima_msg_em).getTime() + 14 * 86400_000,
      ).toISOString(),
      chave_dedup: chaveDedup(
        d.regra_codigo,
        entidadeTipo,
        ident.entidade_id ?? null,
        ident.identificacao?.chave_telefone ?? null,
        c.conversa_id,
        agora,
      ),
      status: "aberto",
      regra_versao: regra?.versao ?? "v1",
    });

    // 23505 = já existe sinal igual nesta semana. É o dedup funcionando.
    if (error && !String(error.code).includes("23505")) {
      conta("erro_insert_sinal");
      await logErro(sb, c, error.message);
      return; // sem ledger: a proxima rodada tenta de novo
    }
    conta(error ? "sinal_duplicado" : "sinal:" + d.regra_codigo);
    await encerra();
  });

  // 3) SEGUNDA FOTO, agora com o veredito na mão (ver 1b).
  //
  // Continua na foto quem, pelo julgamento MAIS RECENTE, ainda espera retorno:
  //   · julgado nesta rodada        → `aindaEspera` (d.emitir)
  //   · julgado antes, e a conversa não andou desde então → veredito do ledger
  //   · não julgado (erro, ou além do teto) → FICA, porque não sabemos
  //
  // ⚠️ O 3º caso é fail-open deliberado e é o oposto da regra do caixa da Sol:
  //    lá, na dúvida, não se mexe em dinheiro; aqui, na dúvida, não se some com
  //    um cliente.
  const peloVeredito = candidatos
    .filter((c) => {
      const daRodada = aindaEspera.get(Number(c.conversa_id));
      if (daRodada !== undefined) return daRodada;
      const doLedger = veredictoNoLedger.get(
        chaveIdempotencia(c.conversa_id, c.ultimo_message_id, PROMPT_VERSAO),
      );
      return doLedger ?? true;
    })
    .map((c) => Number(c.conversa_id));

  // 3b) ÚLTIMO PORTÃO: a conversa ainda está ABERTA no Chatwoot?
  //
  // 🔴 O espelho da SOL só recebe `message_created` — conferido em 09/09/2026,
  // 2.640 eventos em 3 dias e NENHUM outro tipo. O `conversa_status` que a
  // `vw_atendimento_candidatos_sinal` filtra vem de dentro do payload da
  // ÚLTIMA MENSAGEM, então ele congela ali: conversa resolvida DEPOIS da última
  // mensagem continua candidata para sempre. Foi o caso da Débora (conv 20184,
  // resolvida, cobrada por 14 dias) e da Nilza (20732).
  //
  // RESOLVER é o gesto pelo qual a equipe declara o desfecho — é a informação
  // mais forte que existe sobre "acabou", e é dela mesma. Ignorá-la é cobrar
  // quem trabalhou certo.
  //
  // ⚠️ Pergunta à FONTE, e só sobre quem sobreviveu ao veredito (37 de 259 hoje):
  //    N pequeno e limitado pela lista curta, não pela foto inteira.
  // ⚠️ Chatwoot fora do ar mantém todo mundo (fail-open) — mesma direção do
  //    resto deste passo. Não confundir com a regra do caixa da Sol, onde a
  //    dúvida trava; aqui a dúvida custa atenção, lá custa dinheiro.
  const aindaEsperam = await filtrarAindaAbertasNoChatwoot(peloVeredito, sb);
  await marcarFotoJulgada(aindaEsperam);

  return json({
    ok: true,
    ensaio,
    candidatos_na_foto: candidatos.length,
    // 🔴 A distância entre estes dois números É o defeito que este passo
    // conserta: eram as conversas mantidas na pauta por terem o cliente
    // falando por último, mesmo já julgadas como "não precisa resposta".
    ainda_esperam_pelo_veredito: aindaEsperam.length,
    // Os tres sao coisas diferentes e antes estavam somados num numero so,
    // que dizia "154 ja classificados" no primeiro run, com o ledger vazio.
    ja_no_ledger: candidatos.length - pendentes.length,
    cortados_pelo_teto: pendentes.length - novos.length,
    classificados_agora: novos.length,
    placar,
    ...(ensaio ? { amostra: amostraEnsaio.slice(0, 40) } : {}),
  });
});
