export type ComparabilidadeDisponibilidade = 'disponivel' | 'indisponivel';

export type ComparabilidadeMotivo =
  | 'fechamentos_equivalentes'
  | 'fechamento_anterior_ausente'
  | 'snapshot_nao_fechado'
  | 'unidade_incompativel'
  | 'dominio_incompativel'
  | 'grao_incompativel'
  | 'populacao_incompativel'
  | 'regra_incompativel'
  | 'competencia_incompativel'
  | 'cobertura_insuficiente'
  | 'fingerprint_incompativel';

export interface ComparabilidadeSnapshot {
  status?: string | null;
  unidadeId?: string | null;
  dominio?: string | null;
  grao?: string | null;
  populacao?: string | null;
  regra?: string | null;
  competencia?: string | null;
  semanticaCompetencia?: string | null;
  cobertura?: number | null;
  coberturaMinima?: number | null;
  politicaCobertura?: Record<string, unknown> | null;
}

export interface ComparabilidadeResultado {
  disponibilidade: ComparabilidadeDisponibilidade;
  motivo: ComparabilidadeMotivo;
  fingerprintAtual: string;
  fingerprintAnterior: string | null;
}

function ordenarJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenarJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, ordenarJson(item)]),
    );
  }
  return value;
}

function numero(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function componentes(snapshot: ComparabilidadeSnapshot): Record<string, unknown> {
  return {
    unidade: snapshot.unidadeId ?? null,
    dominio: snapshot.dominio ?? null,
    grao: snapshot.grao ?? null,
    populacao: snapshot.populacao ?? null,
    regra: snapshot.regra ?? null,
    semantica_competencia: snapshot.semanticaCompetencia ?? null,
    politica_cobertura: snapshot.politicaCobertura ?? {
      minima: numero(snapshot.coberturaMinima, 100),
    },
  };
}

/** Fingerprint estavel: a competencia do mes muda, a semantica do fechamento nao. */
export function fingerprintComparabilidade(
  snapshot: ComparabilidadeSnapshot,
): string {
  return JSON.stringify(ordenarJson(componentes(snapshot)));
}

function resultado(
  motivo: ComparabilidadeMotivo,
  atual: ComparabilidadeSnapshot,
  anterior: ComparabilidadeSnapshot | null,
): ComparabilidadeResultado {
  return {
    disponibilidade: motivo === 'fechamentos_equivalentes' ? 'disponivel' : 'indisponivel',
    motivo,
    fingerprintAtual: fingerprintComparabilidade(atual),
    fingerprintAnterior: anterior ? fingerprintComparabilidade(anterior) : null,
  };
}

function coberturaSuficiente(snapshot: ComparabilidadeSnapshot): boolean {
  const atual = numero(snapshot.cobertura, Number.NaN);
  const minima = numero(snapshot.coberturaMinima, 100);
  return Number.isFinite(atual) && atual >= minima;
}

export function classificarComparabilidade(
  atual: ComparabilidadeSnapshot,
  anterior: ComparabilidadeSnapshot | null | undefined,
): ComparabilidadeResultado {
  if (!anterior) return resultado('fechamento_anterior_ausente', atual, null);
  if (atual.status !== 'fechado' || anterior.status !== 'fechado') {
    return resultado('snapshot_nao_fechado', atual, anterior);
  }
  if (atual.unidadeId !== anterior.unidadeId) {
    return resultado('unidade_incompativel', atual, anterior);
  }
  if (atual.dominio !== anterior.dominio) {
    return resultado('dominio_incompativel', atual, anterior);
  }
  if (atual.grao !== anterior.grao) return resultado('grao_incompativel', atual, anterior);
  if (atual.populacao !== anterior.populacao) {
    return resultado('populacao_incompativel', atual, anterior);
  }
  if (atual.regra !== anterior.regra) return resultado('regra_incompativel', atual, anterior);
  if (atual.semanticaCompetencia !== anterior.semanticaCompetencia) {
    return resultado('competencia_incompativel', atual, anterior);
  }
  if (!coberturaSuficiente(atual) || !coberturaSuficiente(anterior)) {
    return resultado('cobertura_insuficiente', atual, anterior);
  }
  if (fingerprintComparabilidade(atual) !== fingerprintComparabilidade(anterior)) {
    return resultado('fingerprint_incompativel', atual, anterior);
  }
  return resultado('fechamentos_equivalentes', atual, anterior);
}
