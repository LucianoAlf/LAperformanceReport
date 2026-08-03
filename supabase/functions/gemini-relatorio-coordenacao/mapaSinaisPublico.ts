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
  const oportunidades: OportunidadePublica[] = [];
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
