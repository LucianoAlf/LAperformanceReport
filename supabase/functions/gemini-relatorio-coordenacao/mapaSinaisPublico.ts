export interface SinalBrutoCoordenacao {
  professor_id: number;
  professor: string;
  sinal: string;
  severidade: string;
  evidencias?: Record<string, unknown>;
}

export interface PrioridadePublica {
  professor_id: number;
  professor: string;
  severidade: "alto" | "medio";
  capacidade_fisica_excedida: boolean;
  agrupamentos_fisicos: number;
  carteira: number | null;
  p75_unidade: number | null;
  retencao: number | null;
  meta_retencao: number | null;
  presenca: number | null;
  meta_presenca: number | null;
  direcionamento: string;
}

export interface OportunidadePublica {
  professor_id: number;
  professor: string;
  tipo: "distribuicao" | "expansao_sustentavel";
  carteira: number;
  p50_unidade: number;
  retencao: number | null;
  presenca: number | null;
  disponibilidade_cadastrada: boolean;
}

export interface ProjecaoMapaSinaisPublico {
  prioridades: PrioridadePublica[];
  oportunidades: OportunidadePublica[];
  qualidade_capacidade: {
    professores_afetados: number;
    agrupamentos_estimados: number;
  };
  total_sinais_publicos: number;
}

const SINAIS_CONHECIDOS = new Set([
  "possivel_sobrecarga",
  "expansao_sustentavel",
  "oportunidade_distribuicao",
  "concentracao_operacional",
  "capacidade_estimada_conferir",
  "maturacao",
]);

function evidenciasDe(sinal: SinalBrutoCoordenacao): Record<string, unknown> {
  return sinal.evidencias && typeof sinal.evidencias === "object" ? sinal.evidencias : {};
}

function validarIdentidade(sinal: SinalBrutoCoordenacao): void {
  if (!Number.isInteger(sinal.professor_id) || sinal.professor_id <= 0 || !sinal.professor?.trim()) {
    throw new Error("Sinal pedagógico conhecido sem identidade válida do professor.");
  }
}

function numeroOuNull(valor: unknown): number | null {
  const numero = Number(valor);
  return valor !== null && valor !== undefined && valor !== "" && Number.isFinite(numero) ? numero : null;
}

function abaixo(valor: number | null, meta: number | null): boolean {
  return valor !== null && meta !== null && valor < meta;
}

function construirPrioridades(
  sinais: readonly SinalBrutoCoordenacao[],
): PrioridadePublica[] {
  const grupos = new Map<number, SinalBrutoCoordenacao[]>();

  for (const sinal of sinais) {
    if (sinal.sinal !== "possivel_sobrecarga" && sinal.sinal !== "concentracao_operacional") continue;

    validarIdentidade(sinal);
    const evidencia = evidenciasDe(sinal);
    const carteira = numeroOuNull(evidencia.carteira);
    const p75 = numeroOuNull(evidencia.p75_unidade);
    const retencao = numeroOuNull(evidencia.retencao);
    const metaRetencao = numeroOuNull(evidencia.meta_retencao);
    const presenca = numeroOuNull(evidencia.presenca);
    const metaPresenca = numeroOuNull(evidencia.meta_presenca);
    const fisica = evidencia.capacidade_fisica_excedida === true;
    const turmasFisicas = Array.isArray(evidencia.turmas) ? evidencia.turmas : [];
    const publicavel = sinal.sinal === "concentracao_operacional"
      ? fisica && turmasFisicas.length > 0
      : carteira !== null && p75 !== null && carteira > p75 &&
        (abaixo(retencao, metaRetencao) || abaixo(presenca, metaPresenca) || fisica);

    if (!publicavel) continue;
    grupos.set(sinal.professor_id, [...(grupos.get(sinal.professor_id) || []), sinal]);
  }

  return [...grupos.values()].map((grupo) => {
    const risco = grupo.find((item) => item.sinal === "possivel_sobrecarga");
    const fisico = grupo.find((item) => item.sinal === "concentracao_operacional");
    const evidencia = risco ? evidenciasDe(risco) : {};
    const turmas = fisico ? evidenciasDe(fisico).turmas : [];
    return {
      professor_id: grupo[0].professor_id,
      professor: grupo[0].professor,
      severidade: fisico ? "alto" : "medio",
      capacidade_fisica_excedida: Boolean(fisico),
      agrupamentos_fisicos: Array.isArray(turmas) ? turmas.length : 0,
      carteira: numeroOuNull(evidencia.carteira),
      p75_unidade: numeroOuNull(evidencia.p75_unidade),
      retencao: numeroOuNull(evidencia.retencao),
      meta_retencao: numeroOuNull(evidencia.meta_retencao),
      presenca: numeroOuNull(evidencia.presenca),
      meta_presenca: numeroOuNull(evidencia.meta_presenca),
      direcionamento: fisico
        ? "conferir ocupação física e redistribuir turmas quando necessário"
        : "revisar distribuição de carteira e rotina pedagógica",
    } satisfies PrioridadePublica;
  }).sort((a, b) => {
    const severidade = Number(b.severidade === "alto") - Number(a.severidade === "alto");
    if (severidade !== 0) return severidade;
    const fisica = Number(b.capacidade_fisica_excedida) - Number(a.capacidade_fisica_excedida);
    if (fisica !== 0) return fisica;
    const sinaisA = Number(abaixo(a.retencao, a.meta_retencao)) + Number(abaixo(a.presenca, a.meta_presenca));
    const sinaisB = Number(abaixo(b.retencao, b.meta_retencao)) + Number(abaixo(b.presenca, b.meta_presenca));
    if (sinaisA !== sinaisB) return sinaisB - sinaisA;
    const deficitRetencaoA = (a.meta_retencao ?? 0) - (a.retencao ?? a.meta_retencao ?? 0);
    const deficitRetencaoB = (b.meta_retencao ?? 0) - (b.retencao ?? b.meta_retencao ?? 0);
    if (deficitRetencaoA !== deficitRetencaoB) return deficitRetencaoB - deficitRetencaoA;
    const deficitPresencaA = (a.meta_presenca ?? 0) - (a.presenca ?? a.meta_presenca ?? 0);
    const deficitPresencaB = (b.meta_presenca ?? 0) - (b.presenca ?? b.meta_presenca ?? 0);
    if (deficitPresencaA !== deficitPresencaB) return deficitPresencaB - deficitPresencaA;
    const distanciaA = (a.carteira ?? 0) - (a.p75_unidade ?? a.carteira ?? 0);
    const distanciaB = (b.carteira ?? 0) - (b.p75_unidade ?? b.carteira ?? 0);
    if (distanciaA !== distanciaB) return distanciaB - distanciaA;
    return a.professor.localeCompare(b.professor, "pt-BR", { sensitivity: "base" });
  }).slice(0, 5);
}

function construirOportunidades(
  sinais: readonly SinalBrutoCoordenacao[],
  prioridades: readonly PrioridadePublica[],
): OportunidadePublica[] {
  const bloqueados = new Set(prioridades.map((item) => item.professor_id));
  const porProfessor = new Map<number, OportunidadePublica>();

  for (const sinal of sinais) {
    if (sinal.sinal !== "oportunidade_distribuicao" && sinal.sinal !== "expansao_sustentavel") continue;

    validarIdentidade(sinal);
    if (bloqueados.has(sinal.professor_id)) continue;

    const evidencia = evidenciasDe(sinal);
    const carteira = numeroOuNull(evidencia.carteira);
    const p50 = numeroOuNull(evidencia.p50_unidade);
    if (carteira === null || p50 === null) continue;

    const distribuicao = sinal.sinal === "oportunidade_distribuicao";
    if (distribuicao && (carteira >= p50 || evidencia.disponibilidade_cadastrada !== true)) continue;
    if (!distribuicao && carteira < p50) continue;

    porProfessor.set(sinal.professor_id, {
      professor_id: sinal.professor_id,
      professor: sinal.professor,
      tipo: distribuicao ? "distribuicao" : "expansao_sustentavel",
      carteira,
      p50_unidade: p50,
      retencao: numeroOuNull(evidencia.retencao),
      presenca: numeroOuNull(evidencia.presenca),
      disponibilidade_cadastrada: evidencia.disponibilidade_cadastrada === true,
    });
  }

  return [...porProfessor.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "distribuicao" ? -1 : 1;
    const distanciaA = Math.abs(a.carteira - a.p50_unidade);
    const distanciaB = Math.abs(b.carteira - b.p50_unidade);
    if (distanciaA !== distanciaB) return distanciaB - distanciaA;
    return a.professor.localeCompare(b.professor, "pt-BR", { sensitivity: "base" });
  }).slice(0, 3);
}

function pt(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function plural(total: number, singular: string, plural: string): string {
  return total === 1 ? singular : plural;
}

export function formatarPrioridadesPublicas(projecao: ProjecaoMapaSinaisPublico): string {
  if (projecao.prioridades.length === 0) return "• Nenhuma prioridade pedagógica registrada neste período.";

  return projecao.prioridades.map((item, indice) => {
    const linhas = [`${indice + 1}. *${item.professor}*`];
    if (item.capacidade_fisica_excedida) {
      linhas.push(
        `   • Ocupação acima da capacidade física cadastrada: *${item.agrupamentos_fisicos}* ${plural(item.agrupamentos_fisicos, "agrupamento", "agrupamentos")}.`,
      );
    }
    if (item.carteira !== null && item.p75_unidade !== null) {
      linhas.push(`   • Carteira: *${pt(item.carteira)}* | Referência superior da unidade: *${pt(item.p75_unidade)}*`);
    }
    if (abaixo(item.presenca, item.meta_presenca)) {
      linhas.push(`   • Presença: *${pt(item.presenca!)}%* | Referência: *${pt(item.meta_presenca!)}%*`);
    }
    if (abaixo(item.retencao, item.meta_retencao)) {
      linhas.push(`   • Retenção: *${pt(item.retencao!)}%* | Referência: *${pt(item.meta_retencao!)}%*`);
    }
    linhas.push(`   • Direcionamento: ${item.direcionamento}`);
    return linhas.join(String.fromCharCode(10));
  }).join(`${String.fromCharCode(10)}${String.fromCharCode(10)}`);
}

export function formatarOportunidadesPublicas(projecao: ProjecaoMapaSinaisPublico): string {
  if (projecao.oportunidades.length === 0) {
    return "• Nenhuma oportunidade de distribuição registrada neste período.";
  }

  return projecao.oportunidades.map((item) => item.tipo === "distribuicao"
    ? `• *${item.professor}* — carteira ${pt(item.carteira)}, abaixo da referência ${pt(item.p50_unidade)}, com disponibilidade cadastrada.`
    : `• *${item.professor}* — expansão sustentável com carteira ${pt(item.carteira)}, presença ${item.presenca === null ? "não calculável" : `${pt(item.presenca)}%`} e retenção ${item.retencao === null ? "não calculável" : `${pt(item.retencao)}%`}.`
  ).join(String.fromCharCode(10));
}

export function formatarQualidadeCapacidade(projecao: ProjecaoMapaSinaisPublico): string {
  const { professores_afetados, agrupamentos_estimados } = projecao.qualidade_capacidade;
  if (professores_afetados === 0) {
    return "• Leitura de capacidade: nenhuma pendência cadastral identificada.";
  }

  return [
    `• Leitura de capacidade: *${agrupamentos_estimados}* ${plural(agrupamentos_estimados, "agrupamento de ocupação", "agrupamentos de ocupação")} de *${professores_afetados}* ${plural(professores_afetados, "professor", "professores")} usam apenas referência estimada.`,
    "• Complementar os vínculos de turma e sala para permitir a leitura de capacidade física.",
    "• Essa pendência não representa sobrecarga e não altera nota ou prioridade pedagógica.",
  ].join(String.fromCharCode(10));
}

export function listarCodigosSinaisDesconhecidos(
  sinais: readonly SinalBrutoCoordenacao[],
): string[] {
  return [...new Set(sinais.map((item) => item.sinal).filter((codigo) => !SINAIS_CONHECIDOS.has(codigo)))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function projetarMapaSinaisPublico(
  sinais: readonly SinalBrutoCoordenacao[],
): ProjecaoMapaSinaisPublico {
  if (!Array.isArray(sinais)) throw new Error("Mapa de sinais canônico indisponível.");

  const capacidade = sinais.filter((sinal) => sinal.sinal === "capacidade_estimada_conferir");
  const professores = new Set<number>();
  let agrupamentos = 0;

  for (const sinal of capacidade) {
    validarIdentidade(sinal);
    const turmas = evidenciasDe(sinal).turmas;
    if (!Array.isArray(turmas)) {
      throw new Error("Não foi possível contar os agrupamentos de capacidade estimada.");
    }
    professores.add(sinal.professor_id);
    agrupamentos += turmas.length;
  }

  const prioridades = construirPrioridades(sinais);
  const oportunidades = construirOportunidades(sinais, prioridades);
  return {
    prioridades,
    oportunidades,
    qualidade_capacidade: {
      professores_afetados: professores.size,
      agrupamentos_estimados: agrupamentos,
    },
    total_sinais_publicos: prioridades.length + oportunidades.length,
  };
}
