import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ProfessorCursoModalidade = 'individual' | 'turma';

export interface ProfessorCursoModalidadeExcecaoRow {
  excecaoId: string;
  tipo: string;
  acionavel: boolean;
  unidadeId: string;
  unidadeNome: string;
  professorId: number | null;
  professorNome: string | null;
  emusysProfessorId: number | null;
  cursoId: number | null;
  cursoNome: string | null;
  emusysDisciplinaId: number | null;
  disciplinaNome: string | null;
  modalidade: ProfessorCursoModalidade | null;
  motivo: string;
  sugestao: string | null;
  estado: string;
  evidencias: Record<string, unknown>;
}

interface ReconciliationFilters {
  unidadeId?: string | null;
  professorId?: number | null;
}

export interface ProfessorCursoModalidadeSyncSummary {
  unidadeId: string;
  unidadeNome: string | null;
  disciplinas: number;
  atribuicoes: number;
}

interface UseProfessorCursoModalidadeReconciliacaoReturn {
  rows: ProfessorCursoModalidadeExcecaoRow[];
  loading: boolean;
  syncingUnitId: string | null;
  includeAudit: boolean;
  error: string | null;
  setIncludeAudit: (value: boolean) => void;
  refresh: () => Promise<void>;
  syncUnit: (unidadeId: string) => Promise<ProfessorCursoModalidadeSyncSummary>;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseRow(value: unknown): ProfessorCursoModalidadeExcecaoRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const excecaoId = nullableString(row.excecao_id);
  const tipo = nullableString(row.tipo);
  const unidadeId = nullableString(row.unidade_id);
  const unidadeNome = nullableString(row.unidade_nome);
  const modalidade = nullableString(row.modalidade);

  if (!excecaoId || !tipo || !unidadeId || !unidadeNome) return null;
  if (modalidade !== null && modalidade !== 'individual' && modalidade !== 'turma') return null;

  return {
    excecaoId,
    tipo,
    acionavel: row.acionavel === true,
    unidadeId,
    unidadeNome,
    professorId: nullableInteger(row.professor_id),
    professorNome: nullableString(row.professor_nome),
    emusysProfessorId: nullableInteger(row.emusys_professor_id),
    cursoId: nullableInteger(row.curso_id),
    cursoNome: nullableString(row.curso_nome),
    emusysDisciplinaId: nullableInteger(row.emusys_disciplina_id),
    disciplinaNome: nullableString(row.disciplina_nome),
    modalidade: modalidade as ProfessorCursoModalidade | null,
    motivo: nullableString(row.motivo) || tipo,
    sugestao: nullableString(row.sugestao),
    estado: nullableString(row.estado) || 'pendente',
    evidencias: row.evidencias && typeof row.evidencias === 'object' && !Array.isArray(row.evidencias)
      ? row.evidencias as Record<string, unknown>
      : {},
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Nao foi possivel atualizar as excecoes do Emusys.';
}

export function useProfessorCursoModalidadeReconciliacao({
  unidadeId = null,
  professorId = null,
}: ReconciliationFilters = {}): UseProfessorCursoModalidadeReconciliacaoReturn {
  const [rows, setRows] = useState<ProfessorCursoModalidadeExcecaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingUnitId, setSyncingUnitId] = useState<string | null>(null);
  const [includeAudit, setIncludeAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_professor_curso_modalidade_excecoes_v2',
        {
          p_unidade_id: unidadeId || null,
          p_professor_id: professorId || null,
          p_incluir_auditoria: includeAudit,
        },
      );
      if (rpcError) throw rpcError;
      if (requestId !== requestIdRef.current) return;
      setRows((Array.isArray(data) ? data : []).map(parseRow).filter(
        (row): row is ProfessorCursoModalidadeExcecaoRow => row !== null,
      ));
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(messageFrom(caught));
      throw caught;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [includeAudit, professorId, unidadeId]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const syncUnit = useCallback(async (
    targetUnitId: string,
  ): Promise<ProfessorCursoModalidadeSyncSummary> => {
    setSyncingUnitId(targetUnitId);
    setError(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'sync-professor-disciplinas-emusys',
        {
          body: {
            unidade_id: targetUnitId,
            origem: 'manual',
            modo: 'diagnostico',
          },
        },
      );
      if (functionError) throw functionError;
      if (!data || data.sucesso !== true) {
        throw new Error(typeof data?.erro === 'string' ? data.erro : 'SYNC_EMUSYS_FALHOU');
      }
      await refresh();
      return {
        unidadeId: targetUnitId,
        unidadeNome: nullableString(data.unidade),
        disciplinas: Number(data.disciplinas) || 0,
        atribuicoes: Number(data.atribuicoes) || 0,
      };
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    } finally {
      setSyncingUnitId(null);
    }
  }, [refresh]);

  return {
    rows,
    loading,
    syncingUnitId,
    includeAudit,
    error,
    setIncludeAudit,
    refresh,
    syncUnit,
  };
}
