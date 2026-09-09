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
import {
  ordenarProfessoresPorScoreVisivel,
  scoreVisivelProfessor,
} from "../_shared/ordenacaoProfessoresRelatorio.ts";
import {
  contarProfessoresSemDadosOficiais,
  descreverContextoOperacionalRelatorio,
  formatarQuantidadeCarteira,
} from "../_shared/apresentacaoRelatorioCoordenacao.ts";
import { fetchJsonWithDeadline } from "../_shared/fetchJsonDeadline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonUtf8Headers = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const TEMPO_LIMITE_IA_MS = 12_000;

const TERMOS_PUBLICOS_BLOQUEADOS = [
  "RPC",
  "snapshot",
  "migration",
  "auditoria",
  "canônico",
  "canonico",
  "canônica",
  "canonica",
  "pilar",
  "pilares",
  "camada canônica",
  "camada canonica",
  "read model",
  "(1/2)",
  "(2/2)",
] as const;

type JsonRecord = Record<string, unknown>;

interface RelatorioCoordenacaoRequest {
  documento_id?: string;
  unidade?: string | null;
  ano?: number;
  mes?: number;
  periodicidade?: "mensal" | "ciclo";
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
  score_observado?: number | null;
  score_comparavel?: number | null;
  cobertura?: number | null;
  classificacao?: string | null;
  confianca?: string | null;
  estado_publicacao?: string | null;
  ranking_habilitado?: boolean;
  estado_evidencia: string;
  pilares_validos?: number | null;
  pilares_esperados?: number | null;
  comparabilidade_estado?: "comparavel" | "em_maturacao" | "sem_base_operacional";
  comparabilidade_motivo?: string | null;
  competencia_referencia?: string | null;
  score_referencia?: number | null;
  classificacao_referencia?: string | null;
  metricas: Record<string, MetricaProfessor>;
  operacional?: {
    matriculas_comerciais?: number | null;
  };
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
  documento?: {
    id: string;
    versao: number;
    hash: string;
    status: string;
    gerado_em: string;
  };
  periodo: {
    unidade_id: string | null;
    unidade_nome: string;
    ano: number;
    mes: number;
    inicio?: string;
    fim?: string;
    periodicidade?: "mensal" | "ciclo";
    ciclo_codigo?: string;
    label?: string;
    estado_publicacao?: string;
    publicacao_oficial?: boolean;
    ranking_habilitado?: boolean;
    ciclo_estado?: string | null;
    data_corte?: string;
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
    mrr_perdido_total?: number;
    mrr_perdido_atribuivel?: number;
    valores_mrr_pendentes?: number;
    valores_mrr_atribuiveis_pendentes?: number;
  };
  agenda_treinamentos: JsonRecord & { catalogo?: Array<{ nome: string; descricao?: string; foco?: string }> };
  qualidade_dados: JsonRecord;
  ranking_oficial: Array<{ professor_id: number; nome: string; score: number; cobertura?: number; classificacao?: string }> | null;
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

// Motivos crus que vazam do banco → linguagem de coordenador.
// Regra: coordenador não sabe o que é "canônico", "evidência", "pilar".
function normalizarMotivo(motivo: string): string {
  const m = motivo.toLowerCase();
  if (m.includes("pilar") || m.includes("auditoria")) return "informações insuficientes no período";
  if (m.includes("nenhuma evidencia canonica emitida")) return "dados do período indisponíveis";
  if (m.includes("unidade em auditoria")) return "indicador pausado neste período (auditoria da unidade)";
  if (m.includes("cobertura semantica inferior") || m.includes("cobertura de presença insuficiente")) return "cobertura de presença abaixo do mínimo exigido";
  if (m.includes("disponibilidade canonica ausente") || m.includes("disponibilidade canônica ausente")) return "cadastro de agenda do professor pendente (dias/horários)";
  if (m.includes("amostra minima de 3 experimentais")) return "poucas aulas experimentais no período (mínimo: 3)";
  if (m.includes("nenhuma experimental confirmada")) return "nenhuma aula experimental confirmada no período";
  if (m.includes("base minima de 10 vinculos")) return "carteira pequena para medir (mínimo: 10 vínculos)";
  if (m.includes("nenhum vinculo encerrado elegivel")) return "sem vínculos encerrados elegíveis no histórico";
  if (m.includes("metrica sem linha")) return "dados do período indisponíveis";
  if (m.includes("vinculo professor-unidade com menos de seis meses")) return "vínculo recente com a unidade (menos de 6 meses)";
  if (m.includes("carteira canonica zerada")) return "sem alunos na carteira no período";
  if (m.includes("nenhum evento confiavel")) return "sem aulas registradas no período";
  if (m.includes("recesso")) return "sem aulas no período por recesso";
  return motivo;
}

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
  fonte_canonica_sem_evidencia: "dados do período indisponíveis",
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
  if (valor === null || valor === undefined || valor === "") return "não informado";
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido.toLocaleString("pt-BR") : "não informado";
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
  seguro = seguro
    .replace(/\bcan[oô]nic(?:o|a|os|as)?\b/gi, "oficial")
    .replace(/\bauditoria\b/gi, "verificação")
    .replace(/\bsnapshots?\b/gi, "atualização")
    .replace(/\bmigrations?\b/gi, "atualização")
    .replace(/\bpilares?\b/gi, "indicadores");
  for (const termo of TERMOS_PUBLICOS_BLOQUEADOS) {
    seguro = seguro.replace(new RegExp(escaparRegex(termo), "gi"), "dados oficiais");
  }
  return seguro.trim();
}

function termosDeNegocioPreservados(
  dados: RelatorioCoordenacaoCanonico,
  mapaPublico: ProjecaoMapaSinaisPublico,
  narrativa: NarrativaCoordenacao,
): string[] {
  return [
    dados.periodo.unidade_nome,
    dados.periodo.label,
    dados.periodo.ciclo_codigo,
    ...(dados.periodo.coordenadores || []),
    ...dados.professores.map((professor) => professor.nome),
    ...(dados.ranking_oficial || []).map((professor) => professor.nome),
    ...mapaPublico.prioridades.map((item) => item.professor),
    ...mapaPublico.oportunidades.map((item) => item.professor),
    ...(dados.agenda_treinamentos.catalogo || []).map((item) => item.nome),
    ...narrativa.treinamentos.flatMap((item) => [item.professor, item.treinamento]),
  ].filter((valor): valor is string => typeof valor === "string" && valor.trim().length > 0);
}

function assertPublicReportSafe(texto: string, termosPermitidos: string[] = []): void {
  const textoParaValidacao = [...new Set(termosPermitidos)]
    .sort((a, b) => b.length - a.length)
    .reduce(
      (acumulado, termo) => acumulado.replace(new RegExp(escaparRegex(termo), "giu"), "[dado]"),
      texto,
    );
  const normalizado = textoParaValidacao.toLocaleLowerCase("pt-BR");
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
  const comparaveis = inteiro(resumo.comparaveis);
  const emMaturacao = inteiro(resumo.em_maturacao);

  const planoAcao = [
    "Revisar primeiro as prioridades pedagógicas com evidências concretas.",
    "Acompanhar carteira, presença e retenção em conjunto, sem usar um indicador isolado como julgamento.",
  ];
  if (mapaPublico.qualidade_capacidade.professores_afetados > 0) {
    planoAcao.splice(
      1,
      0,
      "Completar os vínculos de turma e sala indicados na qualidade dos dados, sem convertê-los em julgamento do professor.",
    );
  }

  return {
    resumo: `A equipe tem ${total} professores ativos; ${comparaveis} possuem Health Score comparável e ${emMaturacao} estão em maturação. O período deve ser lido como diagnóstico pedagógico, com foco em apoio e evolução.`,
    conquistas: [
      `${inteiro(resumo.saudaveis)} professores aparecem em faixa saudável entre os que possuem evidência suficiente.`,
      `${inteiro(dados.presenca.professores_com_evidencia)} professores possuem presença observável no período.`,
    ],
    pontos_atencao: mapaPublico.prioridades
      .map((item) => `${item.professor}: revisar as evidências pedagógicas destacadas no mapa priorizado.`),
    treinamentos: [],
    plano_acao: planoAcao,
  };
}

function chaveTexto(valor: string): string {
  return valor.trim().toLocaleLowerCase("pt-BR");
}

function completarTreinamentosPorPrioridade(
  candidatos: Array<{ professor: string; treinamento: string; motivo: string }>,
  prioridades: ProjecaoMapaSinaisPublico["prioridades"],
  catalogo: Array<{ nome: string; foco?: string }>,
): Array<{ professor: string; treinamento: string; motivo: string }> {
  const treinamentosPorProfessor = new Map<string, { professor: string; treinamento: string; motivo: string }>();
  for (const candidato of candidatos) {
    const chave = chaveTexto(candidato.professor);
    if (!treinamentosPorProfessor.has(chave)) treinamentosPorProfessor.set(chave, candidato);
  }

  for (const [indice, prioridade] of prioridades.entries()) {
    const chave = chaveTexto(prioridade.professor);
    if (treinamentosPorProfessor.has(chave) || catalogo.length === 0) continue;
    const textoDirecionamento = chaveTexto(prioridade.direcionamento);
    const preferido = catalogo.find((item) => {
      const nome = chaveTexto(item.nome);
      if (textoDirecionamento.includes("carteira") || textoDirecionamento.includes("turma")) {
        return nome.includes("turma");
      }
      if (textoDirecionamento.includes("presença") || textoDirecionamento.includes("rotina")) {
        return nome.includes("tempo") || nome.includes("engajamento");
      }
      return false;
    }) || catalogo[indice % catalogo.length];
    treinamentosPorProfessor.set(chave, {
      professor: prioridade.professor,
      treinamento: preferido.nome,
      motivo: sanitizarTextoPublico(prioridade.direcionamento),
    });
  }

  return prioridades
    .map((prioridade) => treinamentosPorProfessor.get(chaveTexto(prioridade.professor)))
    .filter((item): item is { professor: string; treinamento: string; motivo: string } => Boolean(item))
    .slice(0, 5);
}

function normalizarNarrativa(
  valor: unknown,
  fallback: NarrativaCoordenacao,
  prioridadesPermitidas: ProjecaoMapaSinaisPublico["prioridades"],
  catalogoPermitido: Array<{ nome: string; foco?: string }>,
): NarrativaCoordenacao {
  if (!valor || typeof valor !== "object") return fallback;
  const bruto = valor as Record<string, unknown>;
  const prioridadesPorNome = new Map(
    prioridadesPermitidas.map((item) => [chaveTexto(item.professor), item]),
  );
  const treinamentosPorNome = new Map(
    catalogoPermitido.map((item) => [chaveTexto(item.nome), item.nome]),
  );
  const treinamentosValidos = Array.isArray(bruto.treinamentos)
    ? bruto.treinamentos.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => {
        const prioridade = typeof item.professor === "string"
          ? prioridadesPorNome.get(chaveTexto(item.professor))
          : undefined;
        const treinamento = typeof item.treinamento === "string"
          ? treinamentosPorNome.get(chaveTexto(item.treinamento))
          : undefined;
        if (!prioridade) return { professor: undefined, treinamento, motivo: "" };
        return {
          professor: prioridade.professor,
          treinamento,
          motivo: sanitizarTextoPublico(prioridade.direcionamento),
        };
      })
      .filter((item): item is { professor: string; treinamento: string; motivo: string } =>
        Boolean(item.professor && item.treinamento && item.motivo))
    : [];
  const treinamentos = completarTreinamentosPorPrioridade(
    treinamentosValidos,
    prioridadesPermitidas,
    catalogoPermitido,
  );

  return {
    resumo: fallback.resumo,
    conquistas: fallback.conquistas,
    pontos_atencao: fallback.pontos_atencao,
    treinamentos,
    plano_acao: fallback.plano_acao,
  };
}

async function gerarNarrativa(
  dados: RelatorioCoordenacaoCanonico,
  mapaPublico: ProjecaoMapaSinaisPublico,
  apiKey: string | undefined,
): Promise<NarrativaCoordenacao> {
  // A IA seleciona nomes do catálogo, sem receber descrições/focos livres
  // que possam carregar orçamento ou outros dados financeiros.
  const catalogo = (dados.agenda_treinamentos.catalogo || []).map((item) => ({
    nome: item.nome,
  }));
  const fallbackBase = narrativaDeterministica(dados, mapaPublico);
  const fallback = {
    ...fallbackBase,
    treinamentos: completarTreinamentosPorPrioridade([], mapaPublico.prioridades, catalogo),
  };
  if (!apiKey) return fallback;
  const entrada = {
    prioridades: mapaPublico.prioridades.map((item) => ({
      professor: item.professor,
      direcionamento: item.direcionamento,
    })),
    catalogo_treinamentos: catalogo,
  };

  try {
    const resposta = await fetchJsonWithDeadline("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini-2026-03-17",
        temperature: 0.2,
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Você sugere treinamentos pedagógicos para uma escola de música.",
              "Use somente professores da lista de prioridades e nomes exatos do catálogo recebido.",
              "Não escreva números, notas, médias, taxas, classificações, rankings ou fatos novos.",
              "Não recomende punição e não altere nomes.",
              "Responda JSON apenas com treinamentos[{professor,treinamento}].",
            ].join(" "),
          },
          { role: "user", content: JSON.stringify(entrada) },
        ],
      }),
    }, { timeoutMs: TEMPO_LIMITE_IA_MS, maxRetries: 2 });
    if (!resposta.ok) return fallback;
    const payload = resposta.payload as JsonRecord;
    const texto = payload?.choices?.[0]?.message?.content;
    if (typeof texto !== "string") return fallback;
    return normalizarNarrativa(
      JSON.parse(texto),
      fallback,
      mapaPublico.prioridades,
      catalogo,
    );
  } catch (error) {
    console.error("Falha ao gerar narrativa pedagógica; usando texto determinístico:", error);
    return fallback;
  }
}

function descreverMetrica(chave: string, metrica: MetricaProfessor | undefined): string {
  const rotulo = rotulosMetricas[chave] || chave;
  if (!metrica || metrica.valor === null || metrica.valor === undefined) {
    const motivo = rotulosEvidencia[metrica?.codigo_evidencia || ""]
      || (metrica?.motivo ? normalizarMotivo(metrica.motivo) : undefined)
      || "dados do período indisponíveis";
    return `${rotulo}: ${motivo}`;
  }

  const unidade = chave === "permanencia" ? " meses" : chave === "media_turma" ? " aluno(s)/turma" : "%";
  const amostra = metrica.amostra !== null && metrica.amostra !== undefined
    ? ` | Amostra: ${inteiro(metrica.amostra)}`
    : "";
  const peso = metrica.papel === "nota" && metrica.peso_efetivo !== null && metrica.peso_efetivo !== undefined
    ? ` | Peso na nota: ${numero(metrica.peso_efetivo, 1)}%`
    : "";
  return `${rotulo}: ${numero(metrica.valor, 1)}${unidade}${amostra}${peso}`;
}

// 2026-09-03 (Quintela): o coordenador quer ver quem lidera CADA indicador,
// não só o Health Score. Leitura por indicador com amostra à vista — e a placa
// deixa claro que não é premiação (essa só sai do ciclo oficial fechado).
interface IndicadorRanking {
  chave: string;
  rotulo: string;
  metricaChave?: string;
  extrairValor?: (professor: ProfessorContrato) => number | null;
  detalhe: (valor: number, amostra: number | null) => string;
}

function numeroRankingOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numeroConvertido = Number(valor);
  return Number.isFinite(numeroConvertido) ? numeroConvertido : null;
}

const indicadoresRanking: IndicadorRanking[] = [
  { chave: "numero_alunos", rotulo: "👥 MAIOR CARTEIRA", detalhe: (v) => `${formatarQuantidadeCarteira(v)} alunos na carteira` },
  { chave: "media_turma", rotulo: "🎸 MÉDIA DE ALUNOS POR TURMA", detalhe: (v, a) => `${numero(v, 1)} alunos/turma${a ? ` (${inteiro(a)} turmas)` : ""}` },
  { chave: "permanencia", rotulo: "🕰 PERMANÊNCIA DOS ALUNOS", detalhe: (v, a) => `${numero(v, 1)} meses${a ? ` (${inteiro(a)} vínculos)` : ""}` },
  { chave: "retencao", rotulo: "🔄 RETENÇÃO DE ALUNOS", detalhe: (v, a) => `${percentual(v)}${a ? ` (${inteiro(a)} vínculos)` : ""}` },
  { chave: "presenca", rotulo: "📅 PRESENÇA DOS ALUNOS", detalhe: (v, a) => `${percentual(v)}${a ? ` (${inteiro(a)} chamadas)` : ""}` },
  {
    chave: "matriculador",
    rotulo: "🎓 MATRICULADOR",
    extrairValor: (professor) => numeroRankingOuNull(professor.operacional?.matriculas_comerciais),
    detalhe: (v) => `${inteiro(v)} matrículas`,
  },
  { chave: "conversao", rotulo: "🎯 CONVERSÃO DE EXPERIMENTAIS", detalhe: (v, a) => `${percentual(v)}${a ? ` (${inteiro(a)} experimentais)` : ""}` },
];

const LIMITE_DESTAQUES_POR_INDICADOR = 10;

function renderizarRankingsPorIndicador(professores: ProfessorContrato[]): string[] {
  const linhas: string[] = [];
  for (const indicador of indicadoresRanking) {
    const ranqueados = professores
      .map((p) => ({
        nome: p.nome,
        valor: indicador.extrairValor
          ? indicador.extrairValor(p)
          : numeroRankingOuNull(p.metricas?.[indicador.chave]?.valor),
        amostra: p.metricas?.[indicador.metricaChave ?? indicador.chave]?.amostra ?? null,
      }))
      .filter((p) => {
        if (p.valor === null || p.valor === undefined) return false;
        if (indicador.chave === "matriculador") return Number(p.valor) > 0;
        return Number(p.amostra) > 0;
      })
      .sort((a, b) => Number(b.valor) - Number(a.valor) || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, LIMITE_DESTAQUES_POR_INDICADOR);

    if (!ranqueados.length) {
      linhas.push(`${indicador.rotulo}: sem destaques disponíveis para este indicador no período.`);
      continue;
    }
    linhas.push(`${indicador.rotulo}`);
    for (const [indice, item] of ranqueados.entries()) {
      linhas.push(`${indice + 1}. ${item.nome} — ${indicador.detalhe(Number(item.valor), item.amostra)}`);
    }
    linhas.push("");
  }
  return linhas;
}

function isCicloOficialCompleto(dados: RelatorioCoordenacaoCanonico): boolean {
  if (
    dados.periodo.periodicidade !== "ciclo"
    || dados.periodo.ciclo_estado !== "fechado"
    || dados.periodo.publicacao_oficial !== true
    || dados.periodo.ranking_habilitado !== true
  ) return false;

  const comparaveis = dados.professores.filter(
    (professor) => professor.comparabilidade_estado === "comparavel"
      && scoreVisivelProfessor(professor) !== null,
  );
  const esperados = Number(dados.resumo_equipe.comparaveis);
  return Number.isInteger(esperados)
    && esperados > 0
    && comparaveis.length === esperados
    && comparaveis.every(
      (professor) => professor.estado_publicacao === "oficial"
        && professor.ranking_habilitado === true,
    )
    && Array.isArray(dados.ranking_oficial)
    && dados.ranking_oficial.length === esperados
    && new Set(dados.ranking_oficial.map((p) => p.professor_id)).size === esperados
    && comparaveis.every((p) => dados.ranking_oficial.some(
      (r) => r.professor_id === p.professor_id && numeroRankingOuNull(r.score) === scoreVisivelProfessor(p),
    ));
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
    (professor) => professor.estado_publicacao === "em_andamento"
      || professor.estado_publicacao === "ciclo_em_acompanhamento",
  );
  const cicloOficial = isCicloOficialCompleto(dados);
  const avisoCiclo = periodo.periodicidade !== "ciclo"
    ? ""
    : cicloOficial
      ? " Dados operacionais estão fechados."
      : " Ranking e premiação aguardam o fechamento oficial do ciclo.";
  const avisoRecesso = String(periodo.contexto_operacional || "")
    .toLocaleLowerCase("pt-BR")
    .includes("recesso")
    ? " O período inclui recesso; indicadores sem aulas elegíveis são apresentados sem nota zero."
    : "";
  const contextoPeriodo = periodo.periodicidade === "ciclo"
    ? `${cicloOficial ? "Ciclo oficial" : "Ciclo em acompanhamento"} ${periodo.label || periodo.ciclo_codigo || "selecionado"}. Os fatos são acumulados pelos numeradores e denominadores do período.${avisoCiclo}${avisoRecesso}`
    : competenciaEmAndamento
      ? "Leitura do mês em andamento, com as evidências exclusivas da competência selecionada."
      : "Visão mensal com as evidências exclusivas da competência selecionada.";
  const contexto = descreverContextoOperacionalRelatorio({
    periodicidade: periodo.periodicidade === "ciclo" ? "ciclo" : "mensal",
    contextoOperacional: periodo.contexto_operacional,
    cicloOficial,
    competenciaEmAndamento,
    contextoPeriodo,
  });
  const professoresSemDadosOficiais = contarProfessoresSemDadosOficiais({
    resumoSemBaseOperacional: resumo.sem_base_operacional,
    qualidadeProfessoresSemFonte: dados.qualidade_dados.professores_sem_fonte,
    professores: dados.professores,
  });

  const professoresComAmostraMinima = dados.experimentais.professores_com_amostra_minima
    ?? dados.experimentais.professores_com_amostra;
  const professoresComConversaoPontuando = dados.experimentais.professores_conversao_pontuando;
  const professoresOrdenados = ordenarProfessoresPorScoreVisivel(dados.professores);
  const professores = professoresOrdenados.flatMap((professor, indice) => {
    if (professor.comparabilidade_estado === "sem_base_operacional") {
      const motivo = normalizarMotivo(
        professor.comparabilidade_motivo || "dados insuficientes no período",
      );
      return [
        `${indice + 1}) *${professor.nome}*`,
        `   • Sem nota no período — ${motivo}.`,
        "   • Permanece na lista da equipe e não recebeu nota zero.",
        "",
      ];
    }

    const score = professor.comparabilidade_estado === "comparavel"
      ? `Health Score V3: ${numero(professor.score_comparavel, 1)} pontos | Indicadores usados na nota: ${inteiro(professor.pilares_validos)}/${inteiro(professor.pilares_esperados)} | cobertura dos aplicáveis: ${percentual(professor.cobertura)}`
      : professor.comparabilidade_estado === "em_maturacao"
        ? `Desempenho observado: ${numero(professor.score_observado, 1)} | resultado em acompanhamento`
        : "Sem nota no período";
    const referencia = professor.comparabilidade_estado !== "comparavel"
      && professor.score_referencia !== null
      && professor.score_referencia !== undefined
      ? `   • Referência comparável anterior: ${numero(professor.score_referencia, 1)} (${professor.competencia_referencia || "competência anterior"}); não compõe a leitura atual`
      : null;
    const pilares = metricasOrdenadas.map((metrica) => `   • ${descreverMetrica(metrica, professor.metricas?.[metrica])}`);
    const carteira = professor.metricas?.numero_alunos?.valor;
    const carteiraLinha = carteira === null || carteira === undefined
      ? "   • Carteira: sem alunos atribuídos no período (informativo)"
      : `   • Carteira: ${formatarQuantidadeCarteira(carteira)} aluno(s) — informativo, não pesa na nota`;
    return [
      `${indice + 1}) *${professor.nome}*`,
      `   • ${score}`,
      ...(referencia ? [referencia] : []),
      ...pilares,
      carteiraLinha,
      "",
    ];
  });

  const professoresComScore = professoresOrdenados
    .filter((p) => !cicloOficial || p.comparabilidade_estado === "comparavel")
    .map((professor) => ({ professor, score: scoreVisivelProfessor(professor) }))
    .filter((item): item is { professor: ProfessorContrato; score: number } => item.score !== null);
  const professoresSemScore = professoresOrdenados
    .filter((professor) => scoreVisivelProfessor(professor) === null);
  const ranking = [
    ...professoresComScore.map((item, indice) =>
      `${indice + 1}. ${item.professor.nome} — ${numero(item.score, 1)} pontos`
    ),
    ...(cicloOficial ? professoresOrdenados.filter(
      (p) => p.comparabilidade_estado !== "comparavel" && scoreVisivelProfessor(p) !== null,
    ).map((p) => `Fora da classificação: ${p.nome} — desempenho observado ${numero(scoreVisivelProfessor(p), 1)}; em acompanhamento.`) : []),
    ...(professoresSemScore.length > 0
      ? [
        "",
        `Sem nota no recorte: ${professoresSemScore.map((professor) => professor.nome).join(", ")}.`,
      ]
      : []),
    professoresComScore.length === 0 && professoresSemScore.length === 0
      ? "Nenhum professor ativo encontrado."
      : cicloOficial
        ? "A lista acima segue a mesma ordem e os mesmos estados exibidos no painel."
        : "Esta é a ordem diagnóstica do painel; não representa premiação oficial.",
  ];

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
    `📅 *${periodo.periodicidade === "ciclo"
      ? `CICLO ${String(periodo.label || periodo.ciclo_codigo || "").toUpperCase()}`
      : `EVIDÊNCIAS DO MÊS — ${meses[periodo.mes].toUpperCase()}/${periodo.ano}`}*`,
    `🗓 Período: ${periodo.inicio || "não informado"} até ${periodo.fim || "não informado"}`,
    `👥 Coordenadores: ${coordenadores}`,
    ...(dados.documento?.versao
      ? [`📄 Documento: versão ${dados.documento.versao} — ${dados.documento.status === "retificado" ? "relatório retificado" : dados.documento.status === "preview" ? "relatório em acompanhamento" : "relatório publicado"}`]
      : []),
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
    `• Professores comparáveis: *${inteiro(resumo.comparaveis)}*`,
    `• Em maturação: *${inteiro(resumo.em_maturacao)}*`,
    `• Sem nota no período: *${inteiro(resumo.sem_base_operacional)}*`,
    `• Faixa saudável: *${inteiro(resumo.saudaveis)}*`,
    `• Faixa de atenção: *${inteiro(resumo.atencao)}*`,
    `• Faixa crítica: *${inteiro(resumo.criticos)}*`,
    `• Média do Health Score comparável: *${numero(resumo.score_medio_comparavel, 1)}*`,
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
    "🏅 *DESTAQUE POR INDICADOR*",
    "───────────────────────",
    "_Leitura interna por indicador (não é premiação — premiações seguem o ciclo oficial fechado)._",
    "",
    ...renderizarRankingsPorIndicador(dados.professores),
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
    "📅 *PRESENÇA DOS ALUNOS*",
    "───────────────────────",
    `• Professores da equipe atual com eventos elegíveis: *${inteiro(dados.presenca.professores_com_evidencia_equipe ?? dados.presenca.professores_com_evidencia)} de ${inteiro(resumo.total_professores)}*`,
    `• Professores com eventos elegíveis no período: *${inteiro(dados.presenca.professores_com_evidencia)}*`,
    `• Presença média observada: *${percentual(dados.presenca.presenca_media)}*`,
    `• Ocorrências usadas no percentual: *${inteiro(dados.presenca.eventos_elegiveis)}*`,
    `• Ocorrências fora do percentual: *${inteiro(dados.presenca.ocorrencias_fora_calculo)}*`,
    `• Ocorrências com informação incompleta: *${inteiro(dados.presenca.ocorrencias_incompletas)}*`,
    `• Ocorrências com divergência entre registros: *${inteiro(dados.presenca.ocorrencias_com_conflito)}*`,
    '_As sinalizações podem se sobrepor; o percentual usa somente eventos elegíveis pela regra do período._',
    ...(Array.isArray(dados.presenca.vinculos_historicos) && dados.presenca.vinculos_historicos.length > 0 ? [
      '',
      '📚 *VÍNCULOS HISTÓRICOS NO PERÍODO*',
      '_Incluídos nos totais de presença; não pertencem à equipe atual deste recorte nem à sua classificação._',
      ...dados.presenca.vinculos_historicos.map((professor: JsonRecord) =>
        `• ${professor.nome} — ${professor.valor == null ? 'sem eventos elegíveis' : `${percentual(professor.valor)} | Presenças: ${inteiro(professor.numerador)}/${inteiro(professor.denominador)}`}`),
    ] : []),
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
    `• Alunos acompanhados nas carteiras: *${formatarQuantidadeCarteira(dados.carteira_carga.alunos_na_carteira)}*`,
    `• Média por professor com carteira observada: *${numero(dados.carteira_carga.media_por_professor, 1)}*`,
    `• Turmas operacionais registradas: *${inteiro(dados.carteira_carga.total_turmas_operacionais)}*`,
    `• Turmas usadas nas médias individuais: *${inteiro(dados.carteira_carga.turmas_usadas_na_media_individual)}*`,
    `• Sinais públicos de carga ou distribuição: *${inteiro(mapaPublico.total_sinais_publicos)}*`,
    "• Os dois totais de turmas usam universos diferentes. A carteira contextualiza a operação e não aumenta nem reduz a nota.",
    "",
    cicloOficial ? "🏆 *RANKING DO CICLO — ORDEM DO PAINEL*" : "📋 *ORDEM DIAGNÓSTICA DO PAINEL*",
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
    `• Professores sem dados oficiais disponíveis: *${inteiro(professoresSemDadosOficiais)}*`,
    "• Ausência de evidência aparece com o motivo real e nunca é tratada como nota zero.",
    formatarQualidadeCapacidade(mapaPublico),
    "",
    periodo.periodicidade === "ciclo" ? "✅ *CONQUISTAS DO CICLO*" : "✅ *CONQUISTAS DO MÊS*",
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

  const relatorio = linhas.join("\n");
  assertPublicReportSafe(
    relatorio,
    termosDeNegocioPreservados(dados, mapaPublico, narrativa),
  );
  return relatorio;
}

function extrairFiltros(body: RelatorioCoordenacaoRequest): {
  unidade: string | null;
  ano: number;
  mes: number;
  periodicidade: "mensal" | "ciclo";
} {
  const legacyPeriodo = body?.dados?.periodo;
  const unidade = body?.unidade ?? legacyPeriodo?.unidade_id ?? null;
  const ano = Number(body?.ano ?? legacyPeriodo?.ano);
  const mes = Number(body?.mes ?? legacyPeriodo?.mes);
  const periodicidade = body?.periodicidade === "ciclo" ? "ciclo" : "mensal";
  if (unidade !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(unidade)) {
    throw new Error("Unidade inválida.");
  }
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error("Competência inválida.");
  }
  return { unidade, ano, mes, periodicidade };
}

export { renderizarRelatorio, gerarNarrativa };

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
    const documentoId = typeof body.documento_id === "string"
      ? body.documento_id.trim()
      : "";
    if (
      documentoId
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentoId)
    ) {
      throw new Error("Documento do relatório inválido.");
    }
    const { data, error } = await (documentoId
      ? supabase.rpc("get_relatorio_coordenacao_documento_v4_por_id", {
        p_documento_id: documentoId,
      })
      : supabase.rpc("get_relatorio_coordenacao_documento_v4", {
        p_unidade_id: filtros.unidade,
        p_ano: filtros.ano,
        p_mes: filtros.mes,
        p_periodicidade: filtros.periodicidade,
      }));
    if (error) {
      console.error("Falha ao consultar dados pedagógicos oficiais:", error.code, error.message);
      throw new Error("Não foi possível reunir os dados pedagógicos desta competência.");
    }
    const contrato = data as RelatorioCoordenacaoCanonico;
    if (!contrato || contrato.schema_version !== 4 || !Array.isArray(contrato.professores)) {
      throw new Error("Os dados pedagógicos retornaram incompletos.");
    }
    if (
      (documentoId && contrato.documento?.id !== documentoId)
      || contrato.periodo.unidade_id !== filtros.unidade
      || contrato.periodo.ano !== filtros.ano
      || contrato.periodo.mes !== filtros.mes
      || contrato.periodo.periodicidade !== filtros.periodicidade
    ) {
      throw new Error("O documento não corresponde ao período selecionado.");
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
    return new Response(JSON.stringify({
      success: true,
      relatorio,
      documento_id: contrato.documento?.id,
      documento_versao: contrato.documento?.versao,
      documento_hash: contrato.documento?.hash,
    }), {
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
