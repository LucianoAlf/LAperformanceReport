/// <reference lib="deno.ns" />

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  formatarOportunidadesPublicas,
  formatarPrioridadesPublicas,
  formatarQualidadeCapacidade,
  listarCodigosSinaisDesconhecidos,
  projetarMapaSinaisPublico,
  type ProjecaoMapaSinaisPublico,
} from "./mapaSinaisPublico.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonUtf8Headers = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const TERMOS_PUBLICOS_BLOQUEADOS = [
  "RPC",
  "snapshot",
  "migration",
  "camada canônica",
  "camada canonica",
  "read model",
  "(1/2)",
  "(2/2)",
] as const;

type JsonRecord = Record<string, unknown>;

interface RelatorioCoordenacaoRequest {
  unidade?: string | null;
  ano?: number;
  mes?: number;
  dados?: { periodo?: { unidade_id?: string | null; ano?: number; mes?: number } };
}

interface MetricaProfessor {
  valor?: number | null;
  numerador?: number | null;
  denominador?: number | null;
  nota?: number | null;
  meta?: number | null;
  amostra?: number | null;
  codigo_evidencia?: string | null;
  motivo?: string | null;
  confianca?: string | null;
  papel?: string | null;
  peso_original?: number | null;
  peso_efetivo?: number | null;
}

interface ProfessorContrato {
  professor_id: number;
  nome: string;
  score?: number | null;
  cobertura?: number | null;
  classificacao?: string | null;
  confianca?: string | null;
  estado_publicacao?: string | null;
  ranking_habilitado?: boolean;
  estado_evidencia: string;
  metricas: Record<string, MetricaProfessor>;
}

interface SinalContrato {
  professor_id: number;
  professor: string;
  sinal: string;
  severidade: string;
  evidencias?: JsonRecord;
}

interface RelatorioCoordenacaoCanonico {
  schema_version: number;
  periodo: {
    unidade_id: string | null;
    unidade_nome: string;
    ano: number;
    mes: number;
    coordenadores?: string[];
    contexto_operacional?: string;
  };
  resumo_equipe: JsonRecord;
  professores: ProfessorContrato[];
  mapa_sinais: SinalContrato[];
  retencao_permanencia: JsonRecord;
  presenca: JsonRecord;
  experimentais: JsonRecord;
  carteira_carga: JsonRecord;
  saidas_retencao: JsonRecord & {
    evasoes_validas?: number;
    nao_renovacoes_validas?: number;
    saidas_validas_total?: number;
    saidas_atribuiveis_professor?: number;
  };
  agenda_treinamentos: JsonRecord & { catalogo?: Array<{ nome: string; descricao?: string; foco?: string }> };
  qualidade_dados: JsonRecord;
  ranking_oficial: Array<{ nome: string; score: number; cobertura?: number; classificacao?: string }> | null;
}

interface NarrativaCoordenacao {
  resumo: string;
  conquistas: string[];
  pontos_atencao: string[];
  treinamentos: Array<{ professor?: string; treinamento: string; motivo: string }>;
  plano_acao: string[];
}

const meses = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const metricasOrdenadas = ["retencao", "permanencia", "conversao", "media_turma", "presenca"];

const rotulosMetricas: Record<string, string> = {
  retencao: "Retenção atribuível",
  permanencia: "Permanência com o professor",
  conversao: "Conversão de experimentais",
  media_turma: "Média de alunos por turma",
  numero_alunos: "Carteira",
  presenca: "Presença dos alunos",
};

const rotulosEvidencia: Record<string, string> = {
  avaliacao_oficial: "avaliação oficial do ciclo",
  avaliacao_parcial: "simulação parcial, ainda não oficial",
  professor_em_maturacao: "professor em maturação",
  amostra_insuficiente: "amostra insuficiente",
  sem_experimental_periodo: "não realizou aula experimental no período",
  cobertura_presenca_insuficiente: "cobertura de presença insuficiente",
  calendario_sem_aulas_elegiveis: "calendário sem aulas elegíveis",
  segmentacao_incompleta: "vínculo ou segmentação incompletos",
  fonte_canonica_indisponivel: "dados oficiais do período indisponíveis",
  metrica_nao_aplicavel: "indicador não aplicável",
  evidencia_pendente: "evidência pendente",
  evidencia_valida: "evidência suficiente",
  valida: "evidência suficiente",
};

function numero(valor: unknown, casas = 1): string {
  if (valor === null || valor === undefined || valor === "") return "não calculável";
  const convertido = Number(valor);
  if (!Number.isFinite(convertido)) return "não calculável";
  return convertido.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function inteiro(valor: unknown): string {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido.toLocaleString("pt-BR") : "0";
}

function percentual(valor: unknown): string {
  return valor === null || valor === undefined ? "não calculável" : `${numero(valor, 1)}%`;
}

function listaOuNenhum(itens: string[], fallback: string): string {
  return itens.length > 0 ? itens.map((item) => `• ${item}`).join("\n") : `• ${fallback}`;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizarTextoPublico(texto: string): string {
  let seguro = String(texto || "").replace(/\bget_[a-z0-9_]+\b/gi, "dados oficiais");
  for (const termo of TERMOS_PUBLICOS_BLOQUEADOS) {
    seguro = seguro.replace(new RegExp(escaparRegex(termo), "gi"), "dados oficiais");
  }
  return seguro.trim();
}

function assertPublicReportSafe(texto: string): void {
  const normalizado = texto.toLocaleLowerCase("pt-BR");
  const vazamentos = [
    ...TERMOS_PUBLICOS_BLOQUEADOS.filter((termo) => normalizado.includes(termo.toLocaleLowerCase("pt-BR"))),
    ...(normalizado.match(/\bget_[a-z0-9_]+\b/g) || []),
  ];
  if (vazamentos.length > 0) {
    throw new Error("O texto público contém linguagem interna e foi bloqueado antes do envio.");
  }
}

function narrativaDeterministica(
  dados: RelatorioCoordenacaoCanonico,
  mapaPublico: ProjecaoMapaSinaisPublico,
): NarrativaCoordenacao {
  const resumo = dados.resumo_equipe;
  const total = inteiro(resumo.total_professores);
  const comScore = inteiro(resumo.com_score);
  const pendentes = inteiro(resumo.com_evidencia_pendente);

  return {
    resumo: `A equipe tem ${total} professores ativos; ${comScore} possuem nota disponível e ${pendentes} precisam completar evidências. O período deve ser lido como diagnóstico pedagógico, com foco em apoio e evolução.`,
    conquistas: [
      `${inteiro(resumo.saudaveis)} professores aparecem em faixa saudável entre os que possuem evidência suficiente.`,
      `${inteiro(dados.presenca.professores_com_evidencia)} professores possuem presença observável no período.`,
    ],
    pontos_atencao: mapaPublico.prioridades.slice(0, 3)
      .map((item) => `${item.professor}: revisar as evidências pedagógicas destacadas no mapa priorizado.`),
    treinamentos: [],
    plano_acao: [
      "Revisar primeiro as prioridades pedagógicas com evidências concretas.",
      "Tratar pendências cadastrais na qualidade dos dados, sem convertê-las em julgamento do professor.",
      "Acompanhar carteira, presença e retenção em conjunto, sem usar um indicador isolado como julgamento.",
    ],
  };
}

function normalizarNarrativa(valor: unknown, fallback: NarrativaCoordenacao): NarrativaCoordenacao {
  if (!valor || typeof valor !== "object") return fallback;
  const bruto = valor as Record<string, unknown>;
  const strings = (entrada: unknown): string[] => Array.isArray(entrada)
    ? entrada.filter((item): item is string => typeof item === "string").map(sanitizarTextoPublico).filter(Boolean).slice(0, 5)
    : [];
  const treinamentos = Array.isArray(bruto.treinamentos)
    ? bruto.treinamentos.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        professor: typeof item.professor === "string" ? sanitizarTextoPublico(item.professor) : undefined,
        treinamento: sanitizarTextoPublico(String(item.treinamento || "")),
        motivo: sanitizarTextoPublico(String(item.motivo || "")),
      }))
      .filter((item) => item.treinamento && item.motivo)
      .slice(0, 5)
    : [];

  return {
    resumo: typeof bruto.resumo === "string" ? sanitizarTextoPublico(bruto.resumo) : fallback.resumo,
    conquistas: strings(bruto.conquistas).length > 0 ? strings(bruto.conquistas) : fallback.conquistas,
    pontos_atencao: strings(bruto.pontos_atencao).length > 0 ? strings(bruto.pontos_atencao) : fallback.pontos_atencao,
    treinamentos,
    plano_acao: strings(bruto.plano_acao).length > 0 ? strings(bruto.plano_acao) : fallback.plano_acao,
  };
}

async function fetchOpenAIComRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let resposta: Response | null = null;
  for (let tentativa = 0; tentativa <= maxRetries; tentativa += 1) {
    resposta = await fetch(url, options);
    if (resposta.ok || resposta.status !== 429 || tentativa === maxRetries) return resposta;
    await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** tentativa));
  }
  return resposta || new Response(null, { status: 500 });
}

async function gerarNarrativa(
  dados: RelatorioCoordenacaoCanonico,
  mapaPublico: ProjecaoMapaSinaisPublico,
  apiKey: string | undefined,
): Promise<NarrativaCoordenacao> {
  const fallback = narrativaDeterministica(dados, mapaPublico);
  if (!apiKey) return fallback;

  const catalogo = (dados.agenda_treinamentos.catalogo || []).map((item) => ({
    nome: item.nome,
    foco: item.foco,
  }));
  const entrada = {
    periodo: {
      unidade: dados.periodo.unidade_nome,
      competencia: `${dados.periodo.ano}-${String(dados.periodo.mes).padStart(2, "0")}`,
      contexto: dados.periodo.contexto_operacional,
    },
    resumo_equipe: dados.resumo_equipe,
    mapa_sinais_publico: {
      prioridades: mapaPublico.prioridades,
      oportunidades: mapaPublico.oportunidades,
    },
    qualidade_dados: dados.qualidade_dados,
    catalogo_treinamentos: catalogo,
  };

  try {
    const resposta = await fetchOpenAIComRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini-2026-03-17",
        temperature: 0.2,
        max_completion_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Você redige uma leitura pedagógica breve e empática para a Coordenação de uma escola de música.",
              "Use somente os sinais recebidos. Não calcule números, notas, médias, taxas, classificações ou rankings.",
              "Não invente fatos nem recomende punição. Sugira treinamentos apenas do catálogo recebido.",
              "Prioridades, oportunidades, limites e ordenação já estão prontos na projeção pública; não promova, remova ou reclassifique professores.",
              "Pontos de atenção e treinamentos podem mencionar somente professores presentes em prioridades; oportunidades servem apenas à redistribuição ou conquista.",
              "Responda JSON com: resumo, conquistas[], pontos_atencao[], treinamentos[{professor,treinamento,motivo}], plano_acao[].",
            ].join(" "),
          },
          { role: "user", content: JSON.stringify(entrada) },
        ],
      }),
    });
    if (!resposta.ok) return fallback;
    const payload = await resposta.json();
    const texto = payload?.choices?.[0]?.message?.content;
    if (typeof texto !== "string") return fallback;
    return normalizarNarrativa(JSON.parse(texto), fallback);
  } catch (error) {
    console.error("Falha ao gerar narrativa pedagógica; usando texto determinístico:", error);
    return fallback;
  }
}

function descreverMetrica(chave: string, metrica: MetricaProfessor | undefined): string {
  const rotulo = rotulosMetricas[chave] || chave;
  if (!metrica || metrica.valor === null || metrica.valor === undefined) {
    const motivo = rotulosEvidencia[metrica?.codigo_evidencia || ""]
      || metrica?.motivo
      || "evidência pendente";
    return `${rotulo}: ${motivo}`;
  }

  const unidade = chave === "permanencia" ? " meses" : chave === "media_turma" ? " aluno(s)/turma" : "%";
  const amostra = metrica.amostra !== null && metrica.amostra !== undefined
    ? ` | Amostra: ${inteiro(metrica.amostra)}`
    : "";
  const peso = metrica.papel === "nota" && metrica.peso_efetivo !== null && metrica.peso_efetivo !== undefined
    ? ` | Peso efetivo: ${numero(metrica.peso_efetivo, 1)}%`
    : "";
  return `${rotulo}: ${numero(metrica.valor, 1)}${unidade}${amostra}${peso}`;
}

function renderizarRelatorio(
  dados: RelatorioCoordenacaoCanonico,
  narrativa: NarrativaCoordenacao,
  mapaPublico: ProjecaoMapaSinaisPublico,
): string {
  const periodo = dados.periodo;
  const resumo = dados.resumo_equipe;
  const coordenadores = periodo.coordenadores?.length ? periodo.coordenadores.join(" e ") : "Coordenação Pedagógica";
  const competenciaEmAndamento = dados.professores.some(
    (professor) => professor.estado_publicacao === "em_andamento",
  );
  const contexto = periodo.contexto_operacional === "recesso_parcial"
    ? "Julho teve recesso parcial. Os dados operacionais estão fechados; as notas servem ao acompanhamento pedagógico, enquanto ranking e premiação aguardam o fechamento oficial do ciclo. A ausência de aulas elegíveis não penaliza o professor."
    : competenciaEmAndamento
      ? "Leitura do mês em andamento. As notas acompanham as evidências já registradas e evoluem com a operação."
      : "O período segue calendário regular e cada indicador respeita sua evidência disponível.";

  const professoresComAmostraMinima = dados.experimentais.professores_com_amostra_minima
    ?? dados.experimentais.professores_com_amostra;
  const professoresComConversaoPontuando = dados.experimentais.professores_com_conversao_pontuando
    ?? dados.experimentais.professores_com_amostra;
  const professoresOrdenados = [...dados.professores].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  );
  const professores = professoresOrdenados.flatMap((professor, indice) => {
    const score = professor.score === null || professor.score === undefined
      ? `Sem nota — ${rotulosEvidencia[professor.estado_evidencia] || professor.estado_evidencia}`
      : `${numero(professor.score, 1)} pontos | Cobertura: ${percentual(professor.cobertura)}`;
    const pilares = metricasOrdenadas.map((metrica) => `   • ${descreverMetrica(metrica, professor.metricas?.[metrica])}`);
    const carteira = professor.metricas?.numero_alunos?.valor;
    const carteiraLinha = carteira === null || carteira === undefined
      ? "   • Carteira: evidência pendente (não altera a nota)"
      : `   • Carteira: ${inteiro(carteira)} aluno(s) (diagnóstico; não altera a nota)`;
    return [
      `${indice + 1}) *${professor.nome}*`,
      `   • Health Score V3: ${score}`,
      ...pilares,
      carteiraLinha,
      "",
    ];
  });

  const ranking = dados.ranking_oficial && dados.ranking_oficial.length > 0
    ? dados.ranking_oficial.map((item, indice) => `${indice + 1}. ${item.nome} — ${numero(item.score, 1)} pontos`)
    : ["Ranking e premiações permanecem reservados ao ciclo oficial fechado."];

  const treinamentosIa = narrativa.treinamentos.map((item) => {
    const pessoa = item.professor ? `${item.professor} → ` : "";
    return `${pessoa}*${item.treinamento}*: ${item.motivo}`;
  });
  const gerado = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", " às");

  const linhas = [
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📊 *RELATÓRIO COORDENAÇÃO PEDAGÓGICA*",
    `🏢 *${periodo.unidade_nome.toUpperCase()}*`,
    `📅 *${meses[periodo.mes].toUpperCase()}/${periodo.ano}*`,
    `👥 Coordenadores: ${coordenadores}`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `> ${narrativa.resumo}`,
    "",
    "🧭 *CONTEXTO DO PERÍODO*",
    "───────────────────────",
    contexto,
    "",
    "👨‍🏫 *VISÃO GERAL DA EQUIPE*",
    "───────────────────────",
    `• Professores ativos: *${inteiro(resumo.total_professores)}*`,
    `• Professores com nota disponível: *${inteiro(resumo.com_score)}*`,
    `• Em maturação: *${inteiro(resumo.em_maturacao)}*`,
    `• Com evidência pendente: *${inteiro(resumo.com_evidencia_pendente)}*`,
    `• Faixa saudável: *${inteiro(resumo.saudaveis)}*`,
    `• Faixa de atenção: *${inteiro(resumo.atencao)}*`,
    `• Faixa crítica: *${inteiro(resumo.criticos)}*`,
    `• Média das notas visíveis: *${numero(resumo.score_medio_visivel, 1)}*`,
    "",
    "🚦 *PRIORIDADES PEDAGÓGICAS*",
    "───────────────────────",
    formatarPrioridadesPublicas(mapaPublico),
    "",
    "🌱 *OPORTUNIDADES DE DISTRIBUIÇÃO*",
    "───────────────────────",
    formatarOportunidadesPublicas(mapaPublico),
    "",
    "👥 *PROFESSORES DA EQUIPE*",
    "───────────────────────",
    ...professores,
    "🔄 *RETENÇÃO E PERMANÊNCIA*",
    "───────────────────────",
    `• Professores com retenção observável: *${inteiro(dados.retencao_permanencia.professores_com_retencao)}*`,
    `• Retenção média observada: *${percentual(dados.retencao_permanencia.retencao_media)}*`,
    `• Professores com permanência observável: *${inteiro(dados.retencao_permanencia.professores_com_permanencia)}*`,
    `• Permanência média: *${numero(dados.retencao_permanencia.permanencia_media_meses, 1)} meses*`,
    `• Evasões válidas na unidade: *${inteiro(dados.saidas_retencao.evasoes_validas)}*`,
    `• Não renovações válidas na unidade: *${inteiro(dados.saidas_retencao.nao_renovacoes_validas)}*`,
    `• Saídas válidas totais: *${inteiro(dados.saidas_retencao.saidas_validas_total)}*`,
    `• Saídas atribuíveis ao professor: *${inteiro(dados.saidas_retencao.saidas_atribuiveis_professor)}*`,
    "",
    "📅 *PRESENÇA E COBERTURA*",
    "───────────────────────",
    `• Professores com evidência: *${inteiro(dados.presenca.professores_com_evidencia)}*`,
    `• Presença média observada: *${percentual(dados.presenca.presenca_media)}*`,
    `• Registros elegíveis: *${inteiro(dados.presenca.eventos_elegiveis)}*`,
    `• Pendências de evidência: *${inteiro(dados.presenca.pendencias)}*`,
    "",
    "🎸 *EXPERIMENTAIS*",
    "───────────────────────",
    `• Professores com amostra mínima observada: *${inteiro(professoresComAmostraMinima)}*`,
    `• Conversão compondo a nota histórica: *${inteiro(professoresComConversaoPontuando)}*`,
    `• Sem experimental no período: *${inteiro(dados.experimentais.professores_sem_experimental)}*`,
    `• Com amostra insuficiente: *${inteiro(dados.experimentais.professores_com_amostra_insuficiente)}*`,
    `• Conversão observada da equipe: *${percentual(dados.experimentais.taxa_conversao_observada)}*`,
    "",
    "🎒 *CARTEIRA E CARGA PEDAGÓGICA*",
    "───────────────────────",
    `• Alunos acompanhados nas carteiras: *${inteiro(dados.carteira_carga.alunos_na_carteira)}*`,
    `• Média por professor com carteira observada: *${numero(dados.carteira_carga.media_por_professor, 1)}*`,
    `• Sinais públicos de carga ou distribuição: *${inteiro(mapaPublico.total_sinais_publicos)}*`,
    "• A carteira contextualiza a operação e não aumenta nem reduz a nota.",
    "",
    "🏆 *RANKING DO CICLO*",
    "───────────────────────",
    ...ranking,
    "",
    "📚 *AGENDA E TREINAMENTOS*",
    "───────────────────────",
    `• Treinamentos agendados: *${inteiro(dados.agenda_treinamentos.treinamentos_agendados)}*`,
    `• Reuniões agendadas: *${inteiro(dados.agenda_treinamentos.reunioes_agendadas)}*`,
    `• Checkpoints: *${inteiro(dados.agenda_treinamentos.checkpoints_agendados)}*`,
    `• Concluídos: *${inteiro(dados.agenda_treinamentos.concluidos)}*`,
    "",
    "🎓 *SUGESTÕES DE TREINAMENTO*",
    listaOuNenhum(treinamentosIa, "Nenhum treinamento prioritário sugerido neste período."),
    "",
    "🔎 *QUALIDADE DOS DADOS*",
    "───────────────────────",
    `• Professores sem dados oficiais disponíveis: *${inteiro(dados.qualidade_dados.professores_sem_fonte)}*`,
    "• Ausência de evidência aparece com o motivo real e nunca é tratada como nota zero.",
    formatarQualidadeCapacidade(mapaPublico),
    "",
    "✅ *CONQUISTAS DO MÊS*",
    "───────────────────────",
    listaOuNenhum(narrativa.conquistas, "Evolução será acompanhada após completar as evidências do período."),
    "",
    "⚠️ *PONTOS DE ATENÇÃO*",
    "───────────────────────",
    listaOuNenhum(narrativa.pontos_atencao, "Nenhum ponto crítico adicional identificado."),
    "",
    "🎯 *PLANO DE AÇÃO PEDAGÓGICO*",
    "───────────────────────",
    listaOuNenhum(narrativa.plano_acao, "Manter acompanhamento pedagógico regular."),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━",
    `📅 Gerado em: ${gerado}`,
    "━━━━━━━━━━━━━━━━━━━━━━",
  ];

  const relatorio = sanitizarTextoPublico(linhas.join("\n"));
  assertPublicReportSafe(relatorio);
  return relatorio;
}

function extrairFiltros(body: RelatorioCoordenacaoRequest): { unidade: string | null; ano: number; mes: number } {
  const legacyPeriodo = body?.dados?.periodo;
  const unidade = body?.unidade ?? legacyPeriodo?.unidade_id ?? null;
  const ano = Number(body?.ano ?? legacyPeriodo?.ano);
  const mes = Number(body?.mes ?? legacyPeriodo?.mes);
  if (unidade !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(unidade)) {
    throw new Error("Unidade inválida.");
  }
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error("Competência inválida.");
  }
  return { unidade, ano, mes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authorization = req.headers.get("authorization");
    if (!authorization) {
      return new Response(JSON.stringify({ success: false, error: "Sessão inválida." }), {
        status: 401,
        headers: jsonUtf8Headers,
      });
    }

    const body: RelatorioCoordenacaoRequest = await req.json();
    const filtros = extrairFiltros(body);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Serviço temporariamente indisponível.");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("get_relatorio_coordenacao_canonico_v2", {
      p_unidade_id: filtros.unidade,
      p_ano: filtros.ano,
      p_mes: filtros.mes,
    });
    if (error) {
      console.error("Falha ao consultar dados pedagógicos oficiais:", error.code, error.message);
      throw new Error("Não foi possível reunir os dados pedagógicos desta competência.");
    }
    const contrato = data as RelatorioCoordenacaoCanonico;
    if (!contrato || contrato.schema_version !== 2 || !Array.isArray(contrato.professores)) {
      throw new Error("Os dados pedagógicos retornaram incompletos.");
    }
    if (!Array.isArray(contrato.mapa_sinais)) {
      throw new Error("O mapa pedagógico retornou incompleto.");
    }

    const mapaPublico = projetarMapaSinaisPublico(contrato.mapa_sinais);
    const codigosDesconhecidos = listarCodigosSinaisDesconhecidos(contrato.mapa_sinais);
    if (codigosDesconhecidos.length > 0) {
      console.warn("Códigos de sinais não publicados:", codigosDesconhecidos.join(", "));
    }
    const narrativa = await gerarNarrativa(contrato, mapaPublico, Deno.env.get("OPENAI_API_KEY"));
    const relatorio = renderizarRelatorio(contrato, narrativa, mapaPublico);
    return new Response(JSON.stringify({ success: true, relatorio }), {
      status: 200,
      headers: jsonUtf8Headers,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro inesperado ao gerar o relatório.";
    console.error("Erro no relatório da Coordenação:", mensagem);
    return new Response(JSON.stringify({ success: false, error: mensagem }), {
      status: 500,
      headers: jsonUtf8Headers,
    });
  }
});
