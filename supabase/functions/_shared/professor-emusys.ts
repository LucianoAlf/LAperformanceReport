export interface EmusysProfessorRef {
  id?: number | null;
  nome?: string | null;
  presenca?: string | null;
}

export interface ProfessorAulaResolvido {
  emusysProfessorId: number | null;
  professorId: number | null;
  semAcompanhamento: boolean;
}

interface ProfessorUnidadeRow {
  professor_id: number;
  emusys_id: number | null;
  emusys_ativo: boolean | null;
  validacao_status: string | null;
  identidade_historica_valida: boolean | null;
  professores: { ativo: boolean | null } | Array<{ ativo: boolean | null }> | null;
}

function professorLocalAtivo(row: ProfessorUnidadeRow): boolean {
  const professor = Array.isArray(row.professores)
    ? row.professores[0]
    : row.professores;
  return professor?.ativo === true;
}

export async function carregarMapaProfessoresEmusys(
  supabase: any,
  unidadeId: string,
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from('professores_unidades')
    .select(`
      professor_id,
      emusys_id,
      emusys_ativo,
      validacao_status,
      identidade_historica_valida,
      professores:professor_id (ativo)
    `)
    .eq('unidade_id', unidadeId)
    .not('emusys_id', 'is', null);

  if (error) {
    throw new Error(`Erro ao carregar vinculos de professores: ${error.message}`);
  }

  const mapa = new Map<number, number>();
  for (const row of (data || []) as ProfessorUnidadeRow[]) {
    const emusysId = Number(row.emusys_id);
    if (!Number.isInteger(emusysId) || emusysId <= 0) continue;

    const vinculoOperacional = row.emusys_ativo === true
      && row.validacao_status !== 'ignorado'
      && professorLocalAtivo(row);
    const identidadeHistorica = row.identidade_historica_valida === true;

    if (vinculoOperacional || identidadeHistorica) {
      mapa.set(emusysId, Number(row.professor_id));
    }
  }

  return mapa;
}

export function resolverProfessorDaAula(
  professores: EmusysProfessorRef[] | null | undefined,
  mapaProfessores: Map<number, number>,
): ProfessorAulaResolvido {
  const rawId = professores?.[0]?.id;
  const emusysProfessorId = rawId == null ? null : Number(rawId);

  if (!Number.isInteger(emusysProfessorId) || emusysProfessorId == null || emusysProfessorId < 0) {
    return {
      emusysProfessorId: null,
      professorId: null,
      semAcompanhamento: false,
    };
  }

  if (emusysProfessorId === 0) {
    return {
      emusysProfessorId: 0,
      professorId: null,
      semAcompanhamento: true,
    };
  }

  return {
    emusysProfessorId,
    professorId: mapaProfessores.get(emusysProfessorId) ?? null,
    semAcompanhamento: false,
  };
}
