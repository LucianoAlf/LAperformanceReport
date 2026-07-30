import { supabase } from '@/lib/supabase';

export interface AlunoAtivoAtualCanonico {
  id: number;
  nome: string;
  unidade_id: string;
  unidade_nome: string;
  status_operacional: 'ativo';
  fonte_estado: 'emusys_v131' | 'alunos_compat';
  emusys_matricula_id: string | null;
  emusys_student_id: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
  data_matricula: string | null;
  data_saida: string | null;
  valor_parcela: number | null;
  status_pagamento: string | null;
  idade_atual: number | null;
  classificacao: string | null;
  is_segundo_curso: boolean;
  curso_id: number | null;
  curso_nome: string | null;
  curso_is_projeto_banda: boolean;
  tipo_matricula_id: number | null;
  tipo_matricula_codigo: string | null;
  tipo_conta_como_pagante: boolean;
  tipo_entra_ticket_medio: boolean;
  professor_atual_id: number | null;
  professor_nome: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
}

export interface TrancamentoAtualCanonico {
  aluno_id: number;
  aluno_nome: string;
  unidade_id: string;
  unidade_nome: string;
  emusys_matricula_id: string | null;
  professor_id: number | null;
  professor_nome: string | null;
  curso_id: number | null;
  curso_nome: string | null;
  trancamento_id: number | null;
  trancamento_motivo: string | null;
  trancamento_data_inicial: string | null;
  trancamento_data_final: string | null;
  fonte_estado: string;
  sincronizado_em: string | null;
}

export interface TrancamentoPeriodoCanonico {
  movimentacao_id: number;
  aluno_id: number | null;
  aluno_nome: string | null;
  unidade_id: string;
  unidade_nome: string;
  emusys_matricula_id: string | null;
  data_movimento: string;
  motivo: string | null;
  observacoes: string | null;
}

function unidadeRpc(unidadeId?: string | 'todos' | null): string | null {
  return unidadeId && unidadeId !== 'todos' ? String(unidadeId) : null;
}

export async function fetchAlunosAtivosAtuaisCanonicos(
  unidadeId?: string | 'todos' | null,
): Promise<AlunoAtivoAtualCanonico[]> {
  const { data, error } = await supabase.rpc(
    'get_alunos_ativos_atuais_canonicos',
    { p_unidade_id: unidadeRpc(unidadeId) },
  );

  if (error) throw error;
  return Array.isArray(data) ? data as AlunoAtivoAtualCanonico[] : [];
}

export async function fetchTrancamentosAtuaisCanonicos(
  unidadeId?: string | 'todos' | null,
): Promise<TrancamentoAtualCanonico[]> {
  const { data, error } = await supabase.rpc(
    'get_trancamentos_atuais_canonicos',
    { p_unidade_id: unidadeRpc(unidadeId) },
  );

  if (error) throw error;
  return (data || []) as TrancamentoAtualCanonico[];
}

export async function fetchTrancamentosPeriodoCanonicos({
  unidadeId,
  dataInicial,
  dataFinal,
}: {
  unidadeId?: string | 'todos' | null;
  dataInicial: string;
  dataFinal: string;
}): Promise<TrancamentoPeriodoCanonico[]> {
  const { data, error } = await supabase.rpc(
    'get_trancamentos_periodo_canonicos',
    {
      p_unidade_id: unidadeRpc(unidadeId),
      p_data_inicial: dataInicial,
      p_data_final: dataFinal,
    },
  );

  if (error) throw error;
  return (data || []) as TrancamentoPeriodoCanonico[];
}

export async function fetchTotalAlunosAtivosCanonicos(
  unidadeId?: string | 'todos' | null,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    'get_kpis_alunos_admin_operacional',
    {
      p_unidade_id: unidadeRpc(unidadeId),
      p_ano: new Date().getFullYear(),
      p_mes: new Date().getMonth() + 1,
    },
  );

  if (error) throw error;
  return Number(data?.totais?.alunos_ativos) || 0;
}
