/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4.1-mini";

interface RelatorioGerencialRequest {
  unidade: string;
  ano: number;
  mes: number;
}

interface RelatorioGerencialCanonico {
  schema_version: number;
  status: string;
  unidade: {
    id: string;
    nome: string;
    codigo?: string;
    gerente?: string;
    hunter?: string;
    administrativo?: string[];
  };
  competencia: {
    ano: number;
    mes: number;
    inicio?: string;
    fim?: string;
    fuso?: string;
  };
  administrativo: Record<string, any>;
  comercial: Record<string, any>;
  rankings: Record<string, any>;
  metas: {
    operacionais?: Record<string, unknown>;
    mensais?: Record<string, unknown>;
    fideliza?: Record<string, unknown>;
    matriculador?: Record<string, unknown>;
  };
  comparativos?: {
    disponibilidade?: "disponivel" | "indisponivel";
    status?: string;
    motivo?: string;
    fingerprint?: string;
    mes_anterior?: Record<string, unknown>;
    ano_anterior?: Record<string, unknown>;
  };
}

interface CoberturaCursoInteresse {
  total_leads: number;
  detalhamento_disponivel: number;
  detalhamento_indisponivel: number;
  curso_declarado_informado: number;
  curso_declarado_ausente: number;
  percentual_detalhamento_disponivel?: number;
  percentual_curso_declarado_ausente?: number;
  fonte: string;
  versao_regra: string;
}

interface NarrativaGerencial {
  resumo_executivo: string;
  conquistas: string[];
  pontos_atencao: string[];
  plano_acao: string[];
  mensagem_final: string;
}

const mesesPorExtenso: Record<number, string> = {
  1: "Janeiro",
  2: "Fevereiro",
  3: "Março",
  4: "Abril",
  5: "Maio",
  6: "Junho",
  7: "Julho",
  8: "Agosto",
  9: "Setembro",
  10: "Outubro",
  11: "Novembro",
  12: "Dezembro",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function numero(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numeroOpcional(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lista(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function lerCaminho(value: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, chave) => {
    if (!atual || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[chave];
  }, value);
}

function contratoGerencialValido(dados: RelatorioGerencialCanonico): boolean {
  const numerosObrigatorios = [
    "administrativo.resumo.alunos_ativos",
    "administrativo.resumo.alunos_pagantes",
    "administrativo.resumo.alunos_nao_pagantes",
    "administrativo.resumo.bolsistas_integrais",
    "administrativo.resumo.bolsistas_parciais",
    "administrativo.resumo.novos_alunos",
    "administrativo.resumo.matriculas_ativas",
    "administrativo.resumo.matriculas_base",
    "administrativo.resumo.matriculas_banda",
    "administrativo.resumo.matriculas_adicionais",
    "administrativo.resumo.alunos_com_exatamente_2_cursos",
    "administrativo.resumo.alunos_com_exatamente_3_cursos",
    "administrativo.resumo.alunos_com_4_ou_mais_cursos",
    "administrativo.indicadores_financeiros.mrr_atual",
    "administrativo.indicadores_financeiros.faturado_emusys",
    "administrativo.indicadores_financeiros.faturamento_realizado",
    "administrativo.indicadores_financeiros.ticket_medio",
    "administrativo.indicadores_financeiros.ltv_medio",
    "administrativo.indicadores_financeiros.tempo_permanencia",
    "administrativo.indicadores_retencao.churn_rate",
    "administrativo.indicadores_retencao.inadimplencia",
    "administrativo.indicadores_retencao.inadimplentes",
    "administrativo.indicadores_retencao.total_evasoes",
    "administrativo.indicadores_retencao.nao_renovacoes",
    "administrativo.indicadores_retencao.mrr_perdido",
    "administrativo.indicadores_retencao.taxa_renovacao",
    "administrativo.indicadores_retencao.renovacoes_previstas",
    "administrativo.indicadores_retencao.renovacoes_realizadas",
    "administrativo.indicadores_retencao.reajuste_medio",
    "administrativo.trancamentos_detalhados.total_alunos",
    "administrativo.trancamentos_detalhados.total_matriculas",
    "comercial.resumo.leads",
    "comercial.resumo.experimentais",
    "comercial.resumo.faltas",
    "comercial.resumo.visitas",
    "comercial.resumo.matriculas",
    "comercial.resumo.taxa_lead_exp",
    "comercial.resumo.taxa_exp_mat",
    "comercial.resumo.conversoes_exp_mat",
    "comercial.resumo.taxa_lead_mat",
    "comercial.resumo.total_passaportes",
    "comercial.resumo.total_parcelas",
    "comercial.resumo.ticket_medio_passaporte",
    "comercial.resumo.ticket_medio_parcela",
  ];
  const listasObrigatorias = [
    "administrativo.trancamentos_detalhados.itens",
    "administrativo.evasoes",
    "administrativo.nao_renovacoes",
    "administrativo.avisos_previos",
    "comercial.alertas",
    "comercial.leads_por_curso",
    "comercial.leads_por_canal",
    "comercial.matriculas_por_canal",
    "comercial.matriculas_por_curso",
  ];

  const cobertura = lerCaminho(dados, "comercial.cobertura_curso_interesse") as
    | Partial<CoberturaCursoInteresse>
    | undefined;
  const totalLeads = numeroOpcional(cobertura?.total_leads);
  const detalhamentoDisponivel = numeroOpcional(
    cobertura?.detalhamento_disponivel,
  );
  const detalhamentoIndisponivel = numeroOpcional(
    cobertura?.detalhamento_indisponivel,
  );
  const cursosInformados = numeroOpcional(cobertura?.curso_declarado_informado);
  const cursosAusentes = numeroOpcional(cobertura?.curso_declarado_ausente);
  const coberturaValida = totalLeads !== null && totalLeads >= 0 &&
    detalhamentoDisponivel !== null && detalhamentoDisponivel >= 0 &&
    detalhamentoIndisponivel !== null && detalhamentoIndisponivel >= 0 &&
    cursosInformados !== null && cursosInformados >= 0 &&
    cursosAusentes !== null && cursosAusentes >= 0 &&
    detalhamentoDisponivel + detalhamentoIndisponivel === totalLeads &&
    cursosInformados + cursosAusentes === detalhamentoDisponivel &&
    typeof cobertura?.fonte === "string" && cobertura.fonte.length > 0 &&
    typeof cobertura?.versao_regra === "string" && cobertura.versao_regra.length > 0;
  const comparativos = dados.comparativos;
  const comparativoExplicito = comparativos?.disponibilidade === "disponivel" ||
    comparativos?.disponibilidade === "indisponivel";
  const oficiais = dados.rankings?.oficiais;
  const oficiaisValidos = oficiais == null ||
    (typeof oficiais === "object" && !Array.isArray(oficiais));

  return numerosObrigatorios.every((caminho) =>
    numeroOpcional(lerCaminho(dados, caminho)) !== null
  ) &&
    listasObrigatorias.every((caminho) =>
      Array.isArray(lerCaminho(dados, caminho))
    ) && coberturaValida && comparativoExplicito && oficiaisValidos;
}

function moeda(value: unknown): string {
  return numero(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function percentual(value: unknown, casas = 1): string {
  return `${numero(value).toFixed(casas).replace(".", ",")}%`;
}

function formatarNumero(value: unknown, casas = 1): string {
  const n = numero(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(casas).replace(".", ",");
}

function barra(progresso: number, tamanho = 10): string {
  const seguro = Math.max(0, Math.min(100, progresso));
  const preenchido = Math.round((seguro / 100) * tamanho);
  return "▓".repeat(preenchido) + "░".repeat(tamanho - preenchido);
}

function progressoMeta(
  atual: number,
  meta: number,
  menorMelhor = false,
): number {
  if (!Number.isFinite(meta) || meta <= 0) return 0;
  if (!menorMelhor) return (atual / meta) * 100;
  if (atual <= meta) return 100;
  return Math.max(0, (meta / Math.max(atual, 0.0001)) * 100);
}

function statusMeta(progresso: number): string {
  return progresso >= 100 ? "✅" : progresso >= 70 ? "⚠️" : "❌";
}

function linhaMeta(
  rotulo: string,
  atualRaw: unknown,
  metaRaw: unknown,
  formato: "numero" | "percentual" | "moeda" = "numero",
  menorMelhor = false,
  casas = 1,
): string {
  const atual = numeroOpcional(atualRaw);
  const meta = numeroOpcional(metaRaw);
  if (atual === null) return `• ${rotulo}: dado não disponível\n`;
  if (meta === null || meta <= 0) return `• ${rotulo}: meta não cadastrada\n`;

  const progresso = progressoMeta(atual, meta, menorMelhor);
  const formatar = (valor: number) => {
    if (formato === "moeda") return `R$ ${moeda(valor)}`;
    if (formato === "percentual") return percentual(valor, casas);
    return formatarNumero(valor);
  };
  return `${barra(progresso)} ${Math.round(progresso)}% ${rotulo} (${
    formatar(atual)
  }/${formatar(meta)}) ${statusMeta(progresso)}\n`;
}

function linhasRanking(
  itens: unknown,
  detalhe: (item: any) => string,
): string {
  const ranking = lista(itens).slice(0, 3);
  if (!ranking.length) return "Sem dados suficientes.\n";
  return ranking.map((item, index) =>
    `${index + 1}. ${
      item?.professor || item?.professor_nome || "Não informado"
    } - ${detalhe(item)}`
  ).join("\n") + "\n";
}

function linhasDestaquesParciais(
  bloco: unknown,
  detalhe: (item: any) => string,
): string {
  if (!bloco || typeof bloco !== "object") return "Sem dados suficientes.\n";
  const dados = bloco as Record<string, unknown>;
  const itens = lista(dados.itens ?? dados.valores).slice(0, 3);
  if (!itens.length) return "Sem dados suficientes.\n";
  const cobertura = String(dados.cobertura || "amostra não informada");
  const regra = String(dados.regra || "regra não informada");
  return `Amostra: ${cobertura}\nRegra: ${regra}\n` +
    itens.map((item) =>
      `• ${item?.professor || item?.professor_nome || "Não informado"} - ${detalhe(item)}`
    ).join("\n") + "\n";
}

function linhasRankingMensal(
  bloco: unknown,
  detalhe: (item: any) => string,
): string {
  if (!bloco || typeof bloco !== "object") return "Sem dados suficientes.\n";
  const dados = bloco as Record<string, unknown>;
  const itens = lista(dados.itens ?? dados.valores).slice(0, 3);
  const cobertura = dados.cobertura
    ? `Cobertura: ${String(dados.cobertura)}\n`
    : "";
  const regra = dados.regra ? `Regra: ${String(dados.regra)}\n` : "";
  if (!itens.length) return `${cobertura}${regra}Sem dados suficientes.\n`;
  return `${cobertura}${regra}` + itens.map((item, index) =>
    `${index + 1}. ${item?.professor || item?.professor_nome || "Não informado"} - ${detalhe(item)}`
  ).join("\n") + "\n";
}

function linhasDistribuicao(
  itens: unknown,
  limite = 5,
  ignorar: string[] = [],
): string {
  const bloqueados = new Set(
    ignorar.map((item) => item.toLocaleLowerCase("pt-BR")),
  );
  const selecionados = lista(itens)
    .filter((item) =>
      !bloqueados.has(String(item?.nome || "").toLocaleLowerCase("pt-BR"))
    )
    .slice(0, limite);
  if (!selecionados.length) return "Sem dados suficientes.\n";
  return selecionados
    .map((item, index) =>
      `${index + 1}. ${item?.nome || "Não informado"} - ${
        numero(item?.quantidade)
      }`
    )
    .join("\n") + "\n";
}

function contarMotivos(
  itens: any[],
): Array<{ motivo: string; quantidade: number }> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const bruto = String(item?.motivo || "Não informado").trim() ||
      "Não informado";
    const chave = normalizarControle(bruto).replace(/\s+/g, " ");
    const motivo = chave === "dificuldade financeira"
      ? "Dificuldade financeira"
      : chave === "mudanca de endereco"
      ? "Mudança de endereço"
      : chave === "troca de unidade"
      ? "Troca de unidade"
      : chave === "desistencia"
      ? "Desistência"
      : bruto;
    mapa.set(motivo, (mapa.get(motivo) || 0) + 1);
  }
  return [...mapa.entries()]
    .map(([motivo, quantidade]) => ({ motivo, quantidade }))
    .sort((a, b) =>
      b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo, "pt-BR")
    );
}

function normalizarControle(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const termosTecnicos = [
  "canonico",
  "metrica",
  "versao",
  "hash",
  "schema",
  "snapshot",
  "fonte",
  "api",
  "rpc",
  "payload",
  "endpoint",
  "legad",
  "conciliacao",
  "camada de dados",
  "banco de dados",
  "banco",
  "bloqueio seguro",
  "sistema",
  "consulta tecnica",
  "integracao",
  "sql",
  "query",
  "servidor",
  "openai",
  "gemini",
];

const palavrasNumericas = new Set([
  "zero",
  "dois",
  "duas",
  "tres",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
  "cem",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
  "mil",
  "milhao",
  "milhoes",
  "bilhao",
  "bilhoes",
  "primeiro",
  "primeira",
  "segundo",
  "segunda",
  "terceiro",
  "terceira",
  "quarto",
  "quarta",
  "quinto",
  "quinta",
  "sexto",
  "sexta",
  "setimo",
  "setima",
  "oitavo",
  "oitava",
  "nono",
  "nona",
  "decimo",
  "decima",
  "metade",
  "terco",
  "terca",
  "real",
  "reais",
  "centavo",
  "centavos",
]);

export function narrativaPublicavel(value: unknown): value is string {
  const texto = String(value || "").trim();
  if (texto.length < 8 || texto.length > 360) return false;
  if (/[0-9%]/.test(texto) || /R\$/i.test(texto)) return false;
  const normalizado = normalizarControle(texto);
  if (termosTecnicos.some((termo) => normalizado.includes(termo))) return false;
  if (/\bpor\s+cento\b/.test(normalizado)) return false;

  const palavras = normalizado.split(/[^a-z]+/).filter(Boolean);
  if (palavras.some((palavra) => palavrasNumericas.has(palavra))) return false;
  if (
    /\b(?:um|uma)\s+(?:por cento|reais?|centavos?|alunos?|matriculas?|leads?|experimentais?|meses?|dias?|cursos?)\b/
      .test(normalizado)
  ) {
    return false;
  }
  return true;
}

const termosTemporaisSemComparativo = [
  "aument",
  "redu",
  "crescimento",
  "queda",
  "melhora",
  "piora",
  "proxim",
  "previst",
  "evoluc",
  "compar",
];

export function narrativaTemporalmenteSegura(
  value: unknown,
  comparativos?: RelatorioGerencialCanonico["comparativos"],
): value is string {
  if (!narrativaPublicavel(value)) return false;
  const disponibilidade = comparativos?.disponibilidade ??
    (comparativos?.status === "disponivel" ? "disponivel" : "indisponivel");
  if (disponibilidade === "disponivel") return true;
  const normalizado = normalizarControle(value);
  return !termosTemporaisSemComparativo.some((termo) =>
    normalizado.includes(termo)
  );
}

function filtrarListaNarrativa(
  value: unknown,
  fallback: string[],
  comparativos?: RelatorioGerencialCanonico["comparativos"],
): string[] {
  const itens = lista(value).filter((item) =>
    narrativaTemporalmenteSegura(item, comparativos)
  ).slice(0, 5);
  return itens.length ? itens : fallback;
}

function fallbackNarrativa(
  dados: RelatorioGerencialCanonico,
): NarrativaGerencial {
  const retencao = dados.administrativo?.indicadores_retencao || {};
  const comercial = dados.comercial?.resumo || {};
  const metasOperacionais = dados.metas?.operacionais || {};
  const alertas = lista(dados.comercial?.alertas);
  const renovacaoAbaixo = numero(retencao.taxa_renovacao) <
    numero(metasOperacionais.taxa_renovacao, Infinity);
  const matriculasAbaixo =
    numero(comercial.matriculas) < numero(metasOperacionais.matriculas, Infinity);
  const comparativos = dados.comparativos;
  const comparativoDisponivel = comparativos?.disponibilidade === "disponivel";

  return {
    resumo_executivo:
      `A unidade ${dados.unidade.nome} encerrou o mês com uma leitura integrada de gestão, retenção e desempenho comercial.`,
    conquistas: [
      "O fechamento reúne visão financeira, base de alunos, funil comercial e desempenho da equipe.",
      "As conversões do mês estão disponíveis para acompanhamento gerencial.",
      comparativoDisponivel
        ? "Os rankings oficiais reúnem os resultados publicáveis da equipe pedagógica."
        : "Os dados pedagógicos disponíveis ficam identificados para acompanhamento gerencial.",
    ],
    pontos_atencao: [
      renovacaoAbaixo
        ? "A renovação requer acompanhamento dos casos pendentes."
        : "A renovação registrada deve continuar acompanhada pela equipe.",
      matriculasAbaixo
        ? "O volume de matrículas requer ação comercial dedicada."
        : "O volume de matrículas deve continuar na rotina de acompanhamento.",
      alertas.length
        ? "Há cadastros comerciais que precisam ser completados pela equipe."
        : "A qualidade dos cadastros comerciais deve permanecer na rotina de conferência.",
    ],
    plano_acao: [
      "Acompanhar renovações pendentes e avisos prévios com responsáveis definidos.",
      "Priorizar o retorno aos leads e a confirmação das aulas experimentais.",
      "Revisar os trancamentos que dependem de decisão gerencial.",
    ],
    mensagem_final:
      "O relatório consolida os principais resultados do mês e direciona as prioridades da próxima gestão.",
  };
}

const narrativaSchema = {
  type: "object",
  properties: {
    resumo_executivo: { type: "string" },
    conquistas: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    },
    pontos_atencao: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    },
    plano_acao: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    },
    mensagem_final: { type: "string" },
  },
  required: [
    "resumo_executivo",
    "conquistas",
    "pontos_atencao",
    "plano_acao",
    "mensagem_final",
  ],
  additionalProperties: false,
};

function resumoParaIA(
  dados: RelatorioGerencialCanonico,
): Record<string, unknown> {
  const admin = dados.administrativo || {};
  const comercial = dados.comercial || {};
  return {
    unidade: dados.unidade.nome,
    competencia: dados.competencia,
    alunos: admin.resumo,
    financeiro: admin.indicadores_financeiros,
    retencao: admin.indicadores_retencao,
    comercial: comercial.resumo,
    quantidade_alertas_comerciais: lista(comercial.alertas).length,
    quantidade_trancamentos_para_atencao:
      lista(admin.trancamentos_detalhados?.itens)
        .filter((item) => item?.faixa_politica !== "contratual").length,
    metas: dados.metas,
    comparativos: dados.comparativos,
    rankings_status: dados.rankings?.oficiais &&
      typeof dados.rankings.oficiais === "object" &&
      !Array.isArray(dados.rankings.oficiais)
      ? dados.rankings.oficiais
      : { status: "parcial" },
  };
}

async function gerarNarrativa(
  dados: RelatorioGerencialCanonico,
): Promise<NarrativaGerencial> {
  const fallback = fallbackNarrativa(dados);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return fallback;

  const system =
    `Voce escreve somente a parte qualitativa de um relatorio gerencial de escola de musica.
Responda em portugues do Brasil, com linguagem executiva, humana e pronta para WhatsApp.
Nao escreva numeros, percentuais, valores monetarios, fracoes, nomes de alunos ou termos de implementacao.
Nao mencione fonte, sistema, banco, API, RPC, payload, snapshot, camada, conciliacao, versao ou metrica legada.
Nao calcule indicadores. Use os dados apenas para escolher prioridades e redigir analises qualitativas.
Quando o comparativo estiver indisponivel, nao afirme aumento, reducao, crescimento, queda, melhora, piora ou proximidade de meta temporal.
Retorne somente o JSON solicitado.`;

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(resumoParaIA(dados)) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "narrativa_relatorio_gerencial",
            strict: true,
            schema: narrativaSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error("Falha ao gerar narrativa gerencial", response.status);
      return fallback;
    }

    const body = await response.json();
    const parsed = JSON.parse(body?.choices?.[0]?.message?.content || "{}");
    return {
      resumo_executivo: narrativaTemporalmenteSegura(
        parsed?.resumo_executivo,
        dados.comparativos,
      )
        ? parsed.resumo_executivo
        : fallback.resumo_executivo,
      conquistas: filtrarListaNarrativa(
        parsed?.conquistas,
        fallback.conquistas,
        dados.comparativos,
      ),
      pontos_atencao: filtrarListaNarrativa(
        parsed?.pontos_atencao,
        fallback.pontos_atencao,
        dados.comparativos,
      ),
      plano_acao: filtrarListaNarrativa(
        parsed?.plano_acao,
        fallback.plano_acao,
        dados.comparativos,
      ),
      mensagem_final: narrativaTemporalmenteSegura(
        parsed?.mensagem_final,
        dados.comparativos,
      )
        ? parsed.mensagem_final
        : fallback.mensagem_final,
    };
  } catch (error) {
    console.error(
      "Falha ao processar narrativa gerencial",
      error instanceof Error ? error.message : String(error),
    );
    return fallback;
  }
}

function listaNarrativa(itens: string[]): string {
  return itens.map((item) => `• ${item}`).join("\n") + "\n";
}

function rotuloFaixaTrancamento(faixa: unknown): string {
  switch (faixa) {
    case "fora_politica":
      return "fora da política";
    case "extensao_gerencial":
      return "em extensão gerencial";
    case "data_ausente":
      return "com data de início ausente";
    default:
      return "em acompanhamento";
  }
}

function dataGeracao(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()).replace(",", " às");
}

function narrativaCompletaSegura(
  narrativa: NarrativaGerencial,
  comparativos?: RelatorioGerencialCanonico["comparativos"],
): boolean {
  return narrativaTemporalmenteSegura(narrativa.resumo_executivo, comparativos) &&
    narrativa.conquistas.every((item) =>
      narrativaTemporalmenteSegura(item, comparativos)
    ) &&
    narrativa.pontos_atencao.every((item) =>
      narrativaTemporalmenteSegura(item, comparativos)
    ) &&
    narrativa.plano_acao.every((item) =>
      narrativaTemporalmenteSegura(item, comparativos)
    ) &&
    narrativaTemporalmenteSegura(narrativa.mensagem_final, comparativos);
}

export async function montarRelatorio(
  dados: RelatorioGerencialCanonico,
  narrativaInformada?: NarrativaGerencial,
): Promise<string> {
  const admin = dados.administrativo || {};
  const administrativoResumo = admin.resumo || {};
  const financeiro = admin.indicadores_financeiros || {};
  const retencao = admin.indicadores_retencao || {};
  const trancamentosDetalhados = admin.trancamentos_detalhados || {};
  const comercial = dados.comercial || {};
  const comercialResumo = comercial.resumo || {};
  const metasOperacionais = dados.metas?.operacionais || {};
  const metasFideliza = dados.metas?.fideliza || {};
  const metasMatriculador = dados.metas?.matriculador || {};
  const rankings = dados.rankings || {};
  const narrativa = narrativaInformada &&
      narrativaCompletaSegura(narrativaInformada, dados.comparativos)
    ? narrativaInformada
    : await gerarNarrativa(dados);
  const mesNome = mesesPorExtenso[numero(dados.competencia?.mes)] ||
    String(dados.competencia?.mes || "");

  const renovacoesPrevistas = numero(retencao.renovacoes_previstas);
  const renovacoesRealizadas = numero(retencao.renovacoes_realizadas);
  const naoRenovacoes = numero(
    retencao.nao_renovacoes ?? administrativoResumo.nao_renovacoes,
  );
  const renovacoesPendentes = Math.max(
    0,
    renovacoesPrevistas - renovacoesRealizadas - naoRenovacoes,
  );
  const evasoesOperacionais = lista(admin.evasoes);
  const naoRenovacoesLista = lista(admin.nao_renovacoes);
  const contagemEvasoes = {
    interrompido: 0,
    segundoCurso: 0,
    bolsista: 0,
    banda: 0,
    transferencia: 0,
  };
  for (const item of evasoesOperacionais) {
    const tipo = normalizarControle(item?.tipo_evasao);
    if (tipo.includes("2_curso") || tipo.includes("segundo_curso")) {
      contagemEvasoes.segundoCurso += 1;
    } else if (tipo.includes("bolsista")) contagemEvasoes.bolsista += 1;
    else if (tipo.includes("banda")) contagemEvasoes.banda += 1;
    else if (tipo.includes("transfer")) contagemEvasoes.transferencia += 1;
    else contagemEvasoes.interrompido += 1;
  }
  const motivosEvasao = contarMotivos([
    ...evasoesOperacionais,
    ...naoRenovacoesLista,
  ]);
  const trancamentos = lista(trancamentosDetalhados.itens);
  const trancamentosContratuais =
    trancamentos.filter((item) => item?.faixa_politica === "contratual").length;
  const trancamentosExtensao =
    trancamentos.filter((item) => item?.faixa_politica === "extensao_gerencial")
      .length;
  const trancamentosFora =
    trancamentos.filter((item) => item?.faixa_politica === "fora_politica")
      .length;
  const trancamentosSemData =
    trancamentos.filter((item) => item?.faixa_politica === "data_ausente")
      .length;
  const trancamentosAtencao = trancamentos.filter((item) =>
    item?.faixa_politica !== "contratual"
  ).slice(0, 5);
  const alertas = lista(comercial.alertas);
  const avisosPrevios = numero(
    administrativoResumo.avisos_previos ?? lista(admin.avisos_previos).length,
  );
  const totalBolsistas = numero(administrativoResumo.bolsistas_integrais) +
    numero(administrativoResumo.bolsistas_parciais);

  let relatorio = "";
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━\n";
  relatorio += "📊 *RELATÓRIO GERENCIAL - LA MUSIC*\n\n";
  relatorio += `🏢 *${
    String(dados.unidade.nome || "Unidade").toUpperCase()
  }*\n`;
  relatorio += `📅 *${
    String(mesNome).toUpperCase()
  }/${dados.competencia.ano}*\n`;
  relatorio += `👤 *Gerente: ${dados.unidade.gerente || "Não informado"}*\n`;
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━\n\n";
  relatorio += `${narrativa.resumo_executivo}\n\n`;

  relatorio +=
    "───────────────────────\n💰 *FINANCEIRO*\n───────────────────────\n";
  // Três números distintos, na ordem em que a pergunta muda: quanto a base
  // vale -> quanto virou fatura -> quanto entrou. Antes, "MRR da competência"
  // e "Faturamento previsto" repetiam o MESMO valor e o rótulo do MRR prometia
  // "pago + em aberto", que é conta de fatura e não de contrato — foi o que
  // levou a unidade a comparar com o Emusys e concluir que o relatório estava
  // errado. O mesmo ajuste foi feito no relatório administrativo.
  relatorio += `• MRR / Base contratual: *R$ ${moeda(financeiro.mrr_atual)}*\n`;
  relatorio += `• Faturado no Emusys (pago + em aberto): *R$ ${
    moeda(financeiro.faturado_emusys)
  }*\n`;
  relatorio += `• Recebido na competência (pago): *R$ ${
    moeda(financeiro.faturamento_realizado)
  }*\n`;
  relatorio += `• Ticket médio da base ativa: *R$ ${
    moeda(financeiro.ticket_medio)
  }*\n`;
  relatorio += `• Total de novas parcelas: *R$ ${
    moeda(comercialResumo.total_parcelas)
  }*\n`;
  relatorio += `• Ticket médio das novas parcelas: *R$ ${
    moeda(comercialResumo.ticket_medio_parcela)
  }*\n`;
  relatorio += `• Total de passaportes: *R$ ${
    moeda(comercialResumo.total_passaportes)
  }*\n`;
  relatorio += `• Ticket médio dos passaportes: *R$ ${
    moeda(comercialResumo.ticket_medio_passaporte)
  }*\n`;
  relatorio += `• Inadimplência: *${percentual(retencao.inadimplencia)}* (${
    numero(retencao.inadimplentes)
  } alunos)\n`;
  relatorio += `• MRR perdido: *R$ ${moeda(retencao.mrr_perdido)}*\n\n`;

  relatorio +=
    "───────────────────────\n👥 *BASE DE ALUNOS*\n───────────────────────\n";
  relatorio += `• Ativos: *${numero(administrativoResumo.alunos_ativos)}*\n`;
  relatorio += `• Pagantes: *${
    numero(administrativoResumo.alunos_pagantes)
  }*\n`;
  relatorio += `• Não pagantes: *${
    numero(administrativoResumo.alunos_nao_pagantes)
  }*\n`;
  relatorio += `• Bolsistas: *${totalBolsistas}*\n`;
  relatorio += `• Novos no mês: *${
    numero(administrativoResumo.novos_alunos)
  }*\n`;
  relatorio += `• Permanência média: *${
    formatarNumero(financeiro.tempo_permanencia)
  } meses*\n`;
  relatorio += `• LTV médio: *R$ ${moeda(financeiro.ltv_medio)}*\n\n`;

  relatorio += "📚 *MATRÍCULAS*\n";
  relatorio += `• Ativas: *${
    numero(administrativoResumo.matriculas_ativas)
  }*\n`;
  relatorio += `• Base de alunos: *${
    numero(administrativoResumo.matriculas_base)
  }*\n`;
  relatorio += `• Em banda: *${
    numero(administrativoResumo.matriculas_banda)
  }*\n`;
  relatorio += `• Adicionais: *${
    numero(administrativoResumo.matriculas_adicionais)
  }*\n`;
  relatorio += `• Alunos com dois cursos: *${
    numero(administrativoResumo.alunos_com_exatamente_2_cursos)
  }*\n`;
  relatorio += `• Alunos com três cursos: *${
    numero(administrativoResumo.alunos_com_exatamente_3_cursos)
  }*\n`;
  relatorio += `• Alunos com quatro ou mais cursos: *${
    numero(administrativoResumo.alunos_com_4_ou_mais_cursos)
  }*\n\n`;

  relatorio +=
    "───────────────────────\n⏸️ *TRANCAMENTOS*\n───────────────────────\n";
  relatorio += `• No fechamento: *${
    numero(trancamentosDetalhados.total_alunos)
  } alunos / ${numero(trancamentosDetalhados.total_matriculas)} matrículas*\n`;
  relatorio += `• Período contratual: *${trancamentosContratuais}*\n`;
  relatorio += `• Extensão gerencial: *${trancamentosExtensao}*\n`;
  relatorio += `• Fora da política: *${trancamentosFora}*\n`;
  relatorio += `• Data de início ausente: *${trancamentosSemData}*\n`;
  if (trancamentosAtencao.length) {
    relatorio += "\n*Casos para acompanhamento:*\n";
    relatorio += trancamentosAtencao.map((item) => {
      const dias = numeroOpcional(item?.dias_trancado);
      const tempo = dias === null ? "tempo não calculável" : `${dias} dias`;
      return `• ${item?.aluno_nome || "Aluno não informado"} — ${tempo}, ${
        rotuloFaixaTrancamento(item?.faixa_politica)
      }`;
    }).join("\n") + "\n";
  }
  relatorio += "\n";

  relatorio +=
    "───────────────────────\n📈 *FUNIL COMERCIAL*\n───────────────────────\n";
  relatorio += `• Leads: *${numero(comercialResumo.leads)}*\n`;
  relatorio += `• Experimentais realizadas: *${
    numero(comercialResumo.experimentais)
  }*\n`;
  relatorio += `• Faltas em experimentais: *${
    numero(comercialResumo.faltas)
  }*\n`;
  relatorio += `• Visitas: *${numero(comercialResumo.visitas)}*\n`;
  relatorio += `• Matrículas: *${numero(comercialResumo.matriculas)}*\n`;
  relatorio += `• Lead → Experimental: *${
    percentual(comercialResumo.taxa_lead_exp)
  }* (${numero(comercialResumo.experimentais)}/${
    numero(comercialResumo.leads)
  })\n`;
  relatorio += `• Experimental → Matrícula: *${
    percentual(comercialResumo.taxa_exp_mat)
  }* (${numero(comercialResumo.conversoes_exp_mat)}/${
    numero(comercialResumo.experimentais)
  })\n`;
  relatorio += `• Lead → Matrícula: *${
    percentual(comercialResumo.taxa_lead_mat)
  }* (${numero(comercialResumo.matriculas)}/${
    numero(comercialResumo.leads)
  })\n\n`;

  relatorio += "🎯 *INTERESSES MAIS PROCURADOS*\n";
  const coberturaCurso = comercial.cobertura_curso_interesse as
    | Partial<CoberturaCursoInteresse>
    | undefined;
  if (coberturaCurso) {
    const total = numero(coberturaCurso.total_leads);
    const disponivel = numero(coberturaCurso.detalhamento_disponivel);
    const indisponivel = numero(coberturaCurso.detalhamento_indisponivel);
    const informado = numero(coberturaCurso.curso_declarado_informado);
    const ausente = numero(coberturaCurso.curso_declarado_ausente);
    const percentualDisponivel = coberturaCurso.percentual_detalhamento_disponivel ??
      (total > 0 ? (disponivel / total) * 100 : 0);
    relatorio += `• Cobertura do detalhamento: *${percentual(percentualDisponivel, 2)}* (${disponivel}/${total} leads)\n`;
    relatorio += `• Detalhamento histórico indisponível: *${indisponivel}*\n`;
    relatorio += `• Curso de interesse informado: *${informado}*\n`;
    relatorio += `• Curso de interesse ausente: *${ausente}*\n`;
  }
  relatorio += linhasDistribuicao(comercial.leads_por_curso, 5, [
    "Sem curso",
    "Não informado",
  ]);
  relatorio += "\n📱 *LEADS POR CANAL*\n";
  relatorio += linhasDistribuicao(comercial.leads_por_canal, 5);
  relatorio += "\n📱 *MATRÍCULAS POR CANAL*\n";
  relatorio += linhasDistribuicao(comercial.matriculas_por_canal, 5);
  relatorio += "\n📚 *MATRÍCULAS POR CURSO*\n";
  relatorio += linhasDistribuicao(comercial.matriculas_por_curso, 5);
  relatorio += "\n";

  if (alertas.length) {
    const semCurso = lista(comercial.leads_por_curso)
      .find((item) =>
        ["sem curso", "não informado"].includes(
          String(item?.nome || "").toLocaleLowerCase("pt-BR"),
        )
      );
    relatorio += "⚠️ *QUALIDADE DOS CADASTROS*\n";
    relatorio += `• Alertas para correção: *${alertas.length}*\n`;
    if (semCurso) {
      relatorio += `• Leads sem curso de interesse: *${
        numero(semCurso.quantidade)
      }*\n`;
    }
    relatorio += "\n";
  }

  relatorio +=
    "───────────────────────\n📉 *RETENÇÃO*\n───────────────────────\n";
  relatorio += `• Churn: *${percentual(retencao.churn_rate, 2)}*\n`;
  relatorio += `• Total de saídas: *${numero(retencao.total_evasoes)}*\n`;
  relatorio += `  - Interrompidos: *${contagemEvasoes.interrompido}*\n`;
  relatorio +=
    `  - Interrompido segundo curso: *${contagemEvasoes.segundoCurso}*\n`;
  relatorio += `  - Interrompido bolsista: *${contagemEvasoes.bolsista}*\n`;
  relatorio += `  - Interrompido banda: *${contagemEvasoes.banda}*\n`;
  relatorio += `  - Transferência: *${contagemEvasoes.transferencia}*\n`;
  relatorio += `  - Não renovações: *${naoRenovacoes}*\n`;
  relatorio +=
    `• Renovações: *${renovacoesRealizadas}/${renovacoesPrevistas}* (${
      percentual(retencao.taxa_renovacao)
    })\n`;
  relatorio += `• Renovações pendentes: *${renovacoesPendentes}*\n`;
  relatorio += `• Reajuste médio: *${
    percentual(retencao.reajuste_medio, 2)
  }*\n`;
  relatorio += `• Avisos prévios para o próximo mês: *${avisosPrevios}*\n\n`;

  if (motivosEvasao.length) {
    relatorio += "🔴 *PRINCIPAIS MOTIVOS DE SAÍDA*\n";
    relatorio += motivosEvasao.slice(0, 5)
      .map((item) => `• ${item.motivo}: *${item.quantidade}*`)
      .join("\n") + "\n\n";
  }

  relatorio +=
    "───────────────────────\n🏆 *RANKINGS OFICIAIS*\n───────────────────────\n";
  const rankingsMensais = rankings.mensais &&
      typeof rankings.mensais === "object" &&
      !Array.isArray(rankings.mensais) &&
      (rankings.mensais as Record<string, unknown>)
    ? rankings.mensais as Record<string, unknown>
    : {};
  const rankingMensalAtivo = Object.values(rankingsMensais).some((bloco) =>
    bloco && typeof bloco === "object" && !Array.isArray(bloco) &&
    (bloco as Record<string, unknown>).status === "oficial" &&
    (bloco as Record<string, unknown>).tipo === "fechamento_mensal"
  );
  const rankingsOficiais = rankings.oficiais &&
      typeof rankings.oficiais === "object" &&
      !Array.isArray(rankings.oficiais) &&
      (rankings.oficiais as Record<string, unknown>).status === "oficial"
    ? rankings.oficiais as Record<string, unknown>
    : {};
  const renderRanking = (chave: string, detalhe: (item: any) => string) =>
    rankingMensalAtivo
      ? linhasRankingMensal(rankingsMensais[chave], detalhe)
      : linhasRanking(rankingsOficiais[chave], detalhe);
  relatorio = relatorio.replace(
    "🏆 *RANKINGS OFICIAIS*",
    rankingMensalAtivo
      ? "🏆 *RANKINGS DO FECHAMENTO MENSAL*"
      : "🏆 *RANKINGS OFICIAIS*",
  );
  relatorio += "🥇 *TOP PROFESSORES EM PERMANÊNCIA*\n";
  relatorio += renderRanking(
    "retencao",
    (item) => `${formatarNumero(item?.tempo_medio_permanencia)} meses`,
  );
  relatorio += "\n🎯 *TOP PROFESSORES MATRICULADORES*\n";
  relatorio += renderRanking(
    "matriculadores",
    (item) => {
      const totalMatriculas = numero(item?.matriculas);
      return `${totalMatriculas} ${
        totalMatriculas === 1 ? "matrícula" : "matrículas"
      }`;
    },
  );
  relatorio += "\n📊 *TOP PRESENÇA MÉDIA*\n";
  relatorio += renderRanking(
    "presenca",
    (item) => percentual(item?.presenca_media),
  );
  relatorio += "\n👥 *TOP MÉDIA DE ALUNOS POR TURMA*\n";
  relatorio += renderRanking(
    "media_turma",
    (item) => `${formatarNumero(item?.media_alunos_turma)} alunos/turma`,
  );
  const destaquesParciais = rankings.destaques_mensais_parciais &&
      typeof rankings.destaques_mensais_parciais === "object" &&
      !Array.isArray(rankings.destaques_mensais_parciais)
    ? rankings.destaques_mensais_parciais as Record<string, unknown>
    : {};
  const temDestaquesParciais = Object.values(destaquesParciais).some((item) =>
    item && typeof item === "object" &&
      lista((item as Record<string, unknown>).itens ?? (item as Record<string, unknown>).valores).length > 0
  );
  if (temDestaquesParciais && !rankingMensalAtivo) {
    relatorio += "\n🎯 *DESTAQUES MENSAIS PARCIAIS (NÃO OFICIAIS)*\n";
    if (destaquesParciais.retencao) {
      relatorio += "Permanência:\n" + linhasDestaquesParciais(
        destaquesParciais.retencao,
        (item) => `${formatarNumero(item?.tempo_medio_permanencia)} meses`,
      );
    }
    if (destaquesParciais.matriculadores) {
      relatorio += "Matrículas:\n" + linhasDestaquesParciais(
        destaquesParciais.matriculadores,
        (item) => `${numero(item?.matriculas)} matrículas`,
      );
    }
    if (destaquesParciais.presenca) {
      relatorio += "Presença:\n" + linhasDestaquesParciais(
        destaquesParciais.presenca,
        (item) => percentual(item?.presenca_media),
      );
    }
    if (destaquesParciais.media_turma) {
      relatorio += "Média de alunos por turma:\n" + linhasDestaquesParciais(
        destaquesParciais.media_turma,
        (item) => `${formatarNumero(item?.media_alunos_turma)} alunos/turma`,
      );
    }
  }
  relatorio += "\n";

  relatorio +=
    "───────────────────────\n⚖️ *COMPARATIVOS*\n───────────────────────\n";
  const comparativoDisponivel = dados.comparativos?.disponibilidade === "disponivel" ||
    (dados.comparativos?.disponibilidade == null &&
      dados.comparativos?.status === "disponivel");
  if (comparativoDisponivel) {
    relatorio += "Comparação disponível com competências equivalentes.\n\n";
  } else {
    const motivo = dados.comparativos?.motivo === "fechamento_anterior_incompativel"
      ? "fechamento anterior incompatível"
      : "não há fechamento equivalente disponível";
    relatorio += `Comparação não disponível para este período com os mesmos critérios de fechamento (${motivo}).\n\n`;
  }

  relatorio +=
    "───────────────────────\n🎯 *METAS DO MÊS*\n───────────────────────\n";
  relatorio += "📊 *GESTÃO*\n";
  relatorio += linhaMeta(
    "Alunos pagantes",
    administrativoResumo.alunos_pagantes,
    metasOperacionais.alunos_pagantes,
  );
  relatorio += linhaMeta(
    "Churn",
    retencao.churn_rate,
    metasOperacionais.churn_rate,
    "percentual",
    true,
  );
  relatorio += linhaMeta(
    "Renovação",
    retencao.taxa_renovacao,
    metasOperacionais.taxa_renovacao,
    "percentual",
  );
  relatorio += linhaMeta(
    "Inadimplência",
    retencao.inadimplencia,
    metasOperacionais.inadimplencia,
    "percentual",
    true,
  );
  relatorio += linhaMeta(
    "Reajuste",
    retencao.reajuste_medio,
    metasOperacionais.reajuste_medio,
    "percentual",
    false,
    2,
  );
  relatorio += "\n📈 *COMERCIAL*\n";
  relatorio += linhaMeta("Leads", comercialResumo.leads, metasOperacionais.leads);
  relatorio += "• Experimentais realizadas: meta equivalente não cadastrada\n";
  relatorio += linhaMeta(
    "Matrículas",
    comercialResumo.matriculas,
    metasOperacionais.matriculas,
  );
  relatorio += linhaMeta(
    "Ticket das novas parcelas",
    comercialResumo.ticket_medio_parcela,
    metasOperacionais.ticket_parcela,
    "moeda",
  );
  relatorio += linhaMeta(
    "Lead → Experimental",
    comercialResumo.taxa_lead_exp,
    metasOperacionais.taxa_lead_exp,
    "percentual",
  );
  relatorio += linhaMeta(
    "Experimental → Matrícula",
    comercialResumo.taxa_exp_mat,
    metasOperacionais.taxa_exp_mat,
    "percentual",
  );
  relatorio += linhaMeta(
    "Lead → Matrícula",
    comercialResumo.taxa_lead_mat,
    metasOperacionais.taxa_conversao,
    "percentual",
  );
  relatorio += "\n";

  relatorio +=
    "───────────────────────\n🏆 *PROGRAMA FIDELIZA+ LA*\n───────────────────────\n";
  relatorio += linhaMeta(
    "Churn premiado",
    retencao.churn_rate,
    metasFideliza.meta_churn_maximo,
    "percentual",
    true,
  );
  relatorio += linhaMeta(
    "Inadimplência",
    retencao.inadimplencia,
    metasFideliza.meta_inadimplencia_maxima,
    "percentual",
    true,
  );
  relatorio += linhaMeta(
    "Max renovação",
    retencao.taxa_renovacao,
    metasFideliza.meta_renovacao_minima,
    "percentual",
  );
  relatorio += linhaMeta(
    "Reajuste campeão",
    retencao.reajuste_medio,
    metasFideliza.meta_reajuste_minimo,
    "percentual",
    false,
    2,
  );
  if (
    metasFideliza.valor_lojinha != null && metasFideliza.meta_lojinha != null
  ) {
    relatorio += linhaMeta(
      "Mestres da lojinha",
      metasFideliza.valor_lojinha,
      metasFideliza.meta_lojinha,
      "moeda",
    );
  }
  relatorio += "\n";

  relatorio +=
    "───────────────────────\n🎯 *PROGRAMA MATRICULADOR+ LA*\n───────────────────────\n";
  relatorio += `*Hunter: ${dados.unidade.hunter || "Não informado"}*\n\n`;
  relatorio += linhaMeta(
    "Lead → Experimental",
    comercialResumo.taxa_lead_exp,
    metasMatriculador.meta_taxa_lead_exp,
    "percentual",
  );
  relatorio += linhaMeta(
    "Experimental → Matrícula",
    comercialResumo.taxa_exp_mat,
    metasMatriculador.meta_taxa_exp_mat,
    "percentual",
  );
  relatorio += linhaMeta(
    "Lead → Matrícula",
    comercialResumo.taxa_lead_mat,
    metasMatriculador.meta_taxa_lead_mat,
    "percentual",
  );
  relatorio += linhaMeta(
    "Volume no mês",
    comercialResumo.matriculas,
    metasMatriculador.meta_volume,
  );
  relatorio += linhaMeta(
    "Ticket das novas parcelas",
    comercialResumo.ticket_medio_parcela,
    metasMatriculador.meta_ticket,
    "moeda",
  );
  relatorio += "\n";

  relatorio +=
    "───────────────────────\n✅ *CONQUISTAS DO MÊS*\n───────────────────────\n";
  relatorio += listaNarrativa(narrativa.conquistas) + "\n";
  relatorio +=
    "───────────────────────\n⚠️ *PONTOS DE ATENÇÃO*\n───────────────────────\n";
  relatorio += listaNarrativa(narrativa.pontos_atencao) + "\n";
  relatorio +=
    "───────────────────────\n🎯 *PLANO DE AÇÃO*\n───────────────────────\n";
  relatorio += listaNarrativa(narrativa.plano_acao) + "\n";
  relatorio +=
    "───────────────────────\n💬 *MENSAGEM FINAL*\n───────────────────────\n";
  relatorio += `${narrativa.mensagem_final}\n\n`;
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━\n";
  relatorio += `📅 Gerado em: ${dataGeracao()}\n`;
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━";

  return relatorio;
}

function uuidValido(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

if (import.meta.main) {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json({ success: false, error: "Método não permitido." }, 405);
    }

    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization) {
        return json({ success: false, error: "Sessão não informada." }, 401);
      }

      const body = await req.json() as Partial<RelatorioGerencialRequest>;
      if (
        !uuidValido(body.unidade) || !Number.isInteger(body.ano) ||
        !Number.isInteger(body.mes) ||
        numero(body.ano) < 2020 || numero(body.ano) > 2100 ||
        numero(body.mes) < 1 || numero(body.mes) > 12
      ) {
        return json({
          success: false,
          error: "Unidade ou competência inválida.",
        }, 400);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) {
        console.error("Configuração Supabase ausente na edge gerencial");
        return json({
          success: false,
          error: "Serviço temporariamente indisponível.",
        }, 500);
      }

      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: authData, error: authError } = await supabase.auth
        .getUser();
      if (authError || !authData.user) {
        return json(
          { success: false, error: "Sessão inválida ou expirada." },
          401,
        );
      }

      const { data, error } = await supabase.rpc(
        "get_relatorio_gerencial_canonico_v1",
        {
          p_unidade_id: body.unidade,
          p_ano: body.ano,
          p_mes: body.mes,
        },
      );

      if (error) {
        console.error(
          "Falha ao ler fechamento gerencial",
          error.code,
          error.message,
        );
        const indisponivel = /NAO_FECHADO|DIVERGENTE|COMPETENCIA/i.test(
          error.message || "",
        );
        return json({
          success: false,
          error: indisponivel
            ? "O fechamento completo desta competência ainda não está disponível."
            : "Não foi possível gerar o relatório gerencial.",
        }, indisponivel ? 409 : 500);
      }

      if (
        !data || data.status !== "fechado" ||
        numero(data.schema_version) !== 1 ||
        !contratoGerencialValido(data as RelatorioGerencialCanonico)
      ) {
        return json({
          success: false,
          error: "O fechamento gerencial retornou um formato inválido.",
        }, 500);
      }

      const relatorio = await montarRelatorio(
        data as RelatorioGerencialCanonico,
      );
      return json({
        success: true,
        relatorio,
        status: data.status,
        schema_version: data.schema_version,
      });
    } catch (error) {
      console.error(
        "Erro inesperado no relatório gerencial",
        error instanceof Error ? error.message : String(error),
      );
      return json({
        success: false,
        error: "Não foi possível gerar o relatório gerencial.",
      }, 500);
    }
  });
}
