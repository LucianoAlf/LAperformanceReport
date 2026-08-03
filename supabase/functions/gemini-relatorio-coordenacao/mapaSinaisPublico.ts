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

  const prioridades: PrioridadePublica[] = [];
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
