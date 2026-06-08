import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CompetenciaMensalStatus =
  | 'aberto'
  | 'fechado'
  | 'retificacao_pendente'
  | 'parcial_fechado'
  | 'indisponivel';

export interface CompetenciaMensalRow {
  id: string;
  unidade_id: string;
  unidade_nome?: string | null;
  ano: number;
  mes: number;
  status: 'aberto' | 'fechado' | 'retificacao_pendente';
  fechado_em: string | null;
  fechado_por: string | null;
  motivo: string | null;
  fechamento_lote_id: string | null;
}

interface UseCompetenciaMensalStatusParams {
  unidadeId?: string | null;
  ano?: number | null;
  mes?: number | null;
  enabled?: boolean;
}

const STATUS_BLOQUEADOS = new Set(['fechado', 'retificacao_pendente']);
const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const COMPETENCIA_FECHADA_MESSAGE = 'Competência fechada: alterações exigem retificação formal.';

export function getCompetenciaStatusLabel(status: CompetenciaMensalStatus): string {
  switch (status) {
    case 'fechado':
      return 'Fechado';
    case 'retificacao_pendente':
      return 'Retificação pendente';
    case 'parcial_fechado':
      return 'Parcialmente fechado';
    case 'indisponivel':
      return 'Status indisponível';
    case 'aberto':
    default:
      return 'Aberto';
  }
}

export function getCompetenciaStatusDescription(status: CompetenciaMensalStatus): string {
  switch (status) {
    case 'fechado':
      return 'Snapshot histórico protegido. Alterações somente via retificação formal.';
    case 'retificacao_pendente':
      return 'Competência bloqueada até conclusão da retificação formal.';
    case 'parcial_fechado':
      return 'Há unidade fechada nesta competência; ações globais devem ser tratadas por retificação formal.';
    case 'indisponivel':
      return 'Não foi possível confirmar o status de fechamento.';
    case 'aberto':
    default:
      return 'Competência aberta para operação preliminar.';
  }
}

export function isCompetenciaBloqueada(status: CompetenciaMensalStatus): boolean {
  return status === 'fechado' || status === 'retificacao_pendente' || status === 'parcial_fechado' || status === 'indisponivel';
}

export function formatCompetencia(ano?: number | null, mes?: number | null): string {
  if (!ano || !mes) return 'Competência';
  return `${MESES_CURTO[mes - 1] || String(mes).padStart(2, '0')}/${ano}`;
}

export function isCompetenciaAtual(ano?: number | null, mes?: number | null, hoje = new Date()): boolean {
  if (!ano || !mes) return false;
  return ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
}

export function getCompetenciaAbertaAlertCopy(ano?: number | null, mes?: number | null) {
  const competencia = formatCompetencia(ano, mes);

  if (isCompetenciaAtual(ano, mes)) {
    return {
      titulo: 'Mês em andamento',
      descricao: `os dados de ${competencia} são calculados em tempo real.`,
    };
  }

  return {
    titulo: 'Competência aberta',
    descricao: `os dados de ${competencia} ainda não foram fechados e podem ser recalculados.`,
  };
}

function formatStatusUnidade(status: CompetenciaMensalRow['status'] | 'aberto'): string {
  if (status === 'fechado') return 'Fechado';
  if (status === 'retificacao_pendente') return 'Retificação pendente';
  return 'Aberto';
}

export function useCompetenciaMensalStatus({
  unidadeId,
  ano,
  mes,
  enabled = true,
}: UseCompetenciaMensalStatusParams) {
  const [rows, setRows] = useState<CompetenciaMensalRow[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isConsolidado = !unidadeId || unidadeId === 'todos';

  useEffect(() => {
    let ativo = true;

    async function carregarStatus() {
      if (!enabled || !ano || !mes) {
        setRows([]);
        setUnidades([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const unidadesQuery = supabase
          .from('unidades')
          .select('id, nome')
          .eq('ativo', true)
          .order('nome');

        let query = supabase
          .from('competencias_mensais')
          .select('id, unidade_id, ano, mes, status, fechado_em, fechado_por, motivo, fechamento_lote_id, unidades:unidade_id(nome)')
          .eq('ano', ano)
          .eq('mes', mes);

        if (!isConsolidado) {
          query = query.eq('unidade_id', unidadeId);
        }

        const [{ data, error: queryError }, { data: unidadesData, error: unidadesError }] = await Promise.all([
          query.order('fechado_em', { ascending: false }),
          unidadesQuery,
        ]);
        if (queryError) throw queryError;
        if (unidadesError) throw unidadesError;
        if (!ativo) return;

        setUnidades((unidadesData || []) as { id: string; nome: string }[]);
        setRows((data || []).map((row: any) => ({
          ...row,
          unidade_nome: row.unidades?.nome || null,
        })) as CompetenciaMensalRow[]);
      } catch (err) {
        if (!ativo) return;
        console.error('Erro ao buscar status da competência mensal:', err);
        setRows([]);
        setError(err as Error);
      } finally {
        if (ativo) setLoading(false);
      }
    }

    carregarStatus();

    return () => {
      ativo = false;
    };
  }, [ano, mes, unidadeId, enabled, isConsolidado]);

  const status = useMemo<CompetenciaMensalStatus>(() => {
    if (error) return 'indisponivel';
    if (rows.some(row => row.status === 'retificacao_pendente')) return 'retificacao_pendente';
    if (!isConsolidado && rows.some(row => row.status === 'fechado')) return 'fechado';
    if (isConsolidado && rows.some(row => STATUS_BLOQUEADOS.has(row.status))) return 'parcial_fechado';
    return 'aberto';
  }, [error, rows, isConsolidado]);

  const rowPrincipal = rows.find(row => STATUS_BLOQUEADOS.has(row.status)) || rows[0] || null;
  const bloqueiaEscrita = isCompetenciaBloqueada(status);
  const competenciaLabel = formatCompetencia(ano, mes);
  const unidadeLabel = isConsolidado
    ? 'Consolidado'
    : (rowPrincipal?.unidade_nome || unidades.find(unidade => unidade.id === unidadeId)?.nome || 'Unidade');
  const statusLabel = getCompetenciaStatusLabel(status);
  const badgeLabel = `${unidadeLabel} · ${competenciaLabel} · ${statusLabel}`;
  const detalhesUnidades = isConsolidado
    ? unidades.map(unidade => {
        const row = rows.find(item => item.unidade_id === unidade.id);
        return `${unidade.nome}: ${formatStatusUnidade(row?.status || 'aberto')}`;
      })
    : [];
  const tooltip = [
    `${unidadeLabel} · ${competenciaLabel} · ${statusLabel}`,
    getCompetenciaStatusDescription(status),
    isConsolidado ? 'Status exibido para a competência mensal selecionada, não para o período "Todos".' : null,
    detalhesUnidades.length > 0 ? detalhesUnidades.join('\n') : null,
  ].filter(Boolean).join('\n');

  return {
    rows,
    unidades,
    rowPrincipal,
    status,
    label: statusLabel,
    badgeLabel,
    tooltip,
    competenciaLabel,
    unidadeLabel,
    description: getCompetenciaStatusDescription(status),
    bloqueiaEscrita,
    loading,
    error,
  };
}
