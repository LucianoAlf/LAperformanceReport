import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ProfessorCursoModalidade = 'individual' | 'turma';

export interface ProfessorCursoModalidadeReconciliacaoRow {
  atribuicaoId: string | null;
  professorId: number;
  professorNome: string;
  unidadeId: string | null;
  unidadeNome: string | null;
  cursoId: number;
  cursoNome: string;
  modalidade: ProfessorCursoModalidade | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  status: string | null;
  fonte: string;
  confianca: string;
  estado: string;
  evidencias: Record<string, unknown>;
}

export type ProfessorCursoModalidadeReconciliacaoAction =
  | { acao: 'manter'; atribuicao_id: string }
  | { acao: 'encerrar'; atribuicao_id: string; vigencia_fim?: string }
  | {
      acao: 'revisar';
      atribuicao_id?: string;
      unidade_id: string;
      curso_id: number;
      modalidade: ProfessorCursoModalidade;
      vigencia_inicio?: string;
    };

interface ReconciliationFilters {
  unidadeId?: string | null;
  professorId?: number | null;
}

interface UseProfessorCursoModalidadeReconciliacaoReturn {
  rows: ProfessorCursoModalidadeReconciliacaoRow[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (
    professorId: number,
    actions: ProfessorCursoModalidadeReconciliacaoAction[],
    justification: string,
  ) => Promise<void>;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseRow(value: unknown): ProfessorCursoModalidadeReconciliacaoRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const professorId = Number(row.professor_id);
  const cursoId = Number(row.curso_id);
  const modalidade = nullableString(row.modalidade);

  if (!Number.isInteger(professorId) || !Number.isInteger(cursoId)) return null;
  if (modalidade !== null && modalidade !== 'individual' && modalidade !== 'turma') return null;

  return {
    atribuicaoId: nullableString(row.atribuicao_id),
    professorId,
    professorNome: nullableString(row.professor_nome) || `Professor ${professorId}`,
    unidadeId: nullableString(row.unidade_id),
    unidadeNome: nullableString(row.unidade_nome),
    cursoId,
    cursoNome: nullableString(row.curso_nome) || `Curso ${cursoId}`,
    modalidade,
    vigenciaInicio: nullableString(row.vigencia_inicio),
    vigenciaFim: nullableString(row.vigencia_fim),
    status: nullableString(row.status),
    fonte: nullableString(row.fonte) || 'não informada',
    confianca: nullableString(row.confianca) || 'não informada',
    estado: nullableString(row.estado) || 'pendente',
    evidencias: row.evidencias && typeof row.evidencias === 'object' && !Array.isArray(row.evidencias)
      ? row.evidencias as Record<string, unknown>
      : {},
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a conciliação.';
}

export function useProfessorCursoModalidadeReconciliacao({
  unidadeId = null,
  professorId = null,
}: ReconciliationFilters = {}): UseProfessorCursoModalidadeReconciliacaoReturn {
  const [rows, setRows] = useState<ProfessorCursoModalidadeReconciliacaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_professor_curso_modalidade_reconciliacao_v1',
        {
          p_unidade_id: unidadeId || null,
          p_professor_id: professorId || null,
        },
      );
      if (rpcError) throw rpcError;
      if (requestId !== requestIdRef.current) return;
      setRows((Array.isArray(data) ? data : []).map(parseRow).filter(
        (row): row is ProfessorCursoModalidadeReconciliacaoRow => row !== null,
      ));
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setRows([]);
      setError(messageFrom(caught));
      throw caught;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [professorId, unidadeId]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const save = useCallback(async (
    targetProfessorId: number,
    actions: ProfessorCursoModalidadeReconciliacaoAction[],
    justification: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc(
        'salvar_professor_curso_modalidade_atribuicoes_v1',
        {
          p_professor_id: targetProfessorId,
          p_atribuicoes: actions,
          p_justificativa: justification.trim(),
        },
      );
      if (rpcError) throw rpcError;
      await refresh();
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return { rows, loading, saving, error, refresh, save };
}
