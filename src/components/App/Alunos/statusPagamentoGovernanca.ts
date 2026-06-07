import { supabase } from '@/lib/supabase';

const CONFIRMACAO_SEM_PARCELA = 'SEM PARCELA';
const TIPOS_PROTEGIDOS = new Set([1, 2]); // Regular e Segundo Curso
const DIAS_AULA_RECENTE = 30;

export interface ContextoStatusPagamento {
  id: number;
  nome: string;
  unidade_id: string;
  professor_atual_id: number | null;
  curso_id: number | null;
  status: string | null;
  status_pagamento: string | null;
  valor_parcela: number | null;
  tipo_matricula_id: number | null;
  data_inicio_contrato: string | null;
  data_fim_contrato: string | null;
  ultima_presenca: string | null;
}

export interface AnaliseSemParcela {
  exigeJustificativa: boolean;
  exigeConfirmacaoForte: boolean;
  contratoVigente: boolean;
  aulasRecentes: boolean;
  diasDesdeUltimaPresenca: number | null;
  motivos: string[];
}

interface RegistroAuditoriaStatusPagamento {
  alunoId: number;
  alunoNome: string;
  ator: string;
  antes: string | null;
  depois: string | null;
  motivo: string;
  origem: string;
}

export type OrigemGovernancaStatusPagamento = 'tabela_inline' | 'acao_massa' | 'ficha_aluno';

function parseDateOnly(valor?: string | null): Date | null {
  if (!valor) return null;
  const data = new Date(`${valor}T00:00:00`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function startOfToday() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

function diferencaEmDias(data: Date, referencia: Date) {
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.floor((referencia.getTime() - data.getTime()) / msPorDia);
}

function formatarData(valor?: string | null) {
  const data = parseDateOnly(valor);
  if (!data) return '—';
  return data.toLocaleDateString('pt-BR');
}

export function getConfirmacaoSemParcela() {
  return CONFIRMACAO_SEM_PARCELA;
}

export function getStatusPagamentoLabel(status?: string | null) {
  switch (status) {
    case 'em_dia':
      return 'Em dia';
    case 'inadimplente':
      return 'Inadimplente';
    case 'parcial':
      return 'Parcial';
    case 'sem_parcela':
      return 'Sem parcela';
    default:
      return 'Em aberto';
  }
}

export function analisarMudancaParaSemParcela(contexto: ContextoStatusPagamento): AnaliseSemParcela {
  const hoje = startOfToday();
  const dataInicio = parseDateOnly(contexto.data_inicio_contrato);
  const dataFim = parseDateOnly(contexto.data_fim_contrato);
  const ultimaPresenca = parseDateOnly(contexto.ultima_presenca);
  const diasDesdeUltimaPresenca = ultimaPresenca ? diferencaEmDias(ultimaPresenca, hoje) : null;
  const aulasRecentes = diasDesdeUltimaPresenca !== null && diasDesdeUltimaPresenca <= DIAS_AULA_RECENTE;
  const contratoVigente = !!(
    (dataInicio && dataInicio <= hoje && (!dataFim || dataFim >= hoje)) ||
    (!dataInicio && dataFim && dataFim >= hoje)
  );
  const matriculaProtegida =
    (contexto.status || '').toLowerCase() === 'ativo' &&
    TIPOS_PROTEGIDOS.has(contexto.tipo_matricula_id || 0) &&
    (contexto.valor_parcela || 0) > 0;

  const motivos: string[] = [];
  if ((contexto.status || '').toLowerCase() === 'ativo') {
    motivos.push('matrícula está ativa');
  }
  if (TIPOS_PROTEGIDOS.has(contexto.tipo_matricula_id || 0)) {
    motivos.push('tipo é Regular/Segundo Curso');
  }
  if ((contexto.valor_parcela || 0) > 0) {
    motivos.push(`valor de parcela lançado em R$ ${(contexto.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }
  if (contratoVigente) {
    motivos.push(`contrato vigente até ${formatarData(contexto.data_fim_contrato)}`);
  }
  if (aulasRecentes) {
    motivos.push(`última aula recente em ${formatarData(contexto.ultima_presenca)}`);
  }

  return {
    exigeJustificativa: true,
    exigeConfirmacaoForte: matriculaProtegida && (contratoVigente || aulasRecentes),
    contratoVigente,
    aulasRecentes,
    diasDesdeUltimaPresenca,
    motivos,
  };
}

export function deveExigirConfirmacaoDigitada(
  origem: OrigemGovernancaStatusPagamento,
  analise: AnaliseSemParcela
) {
  return origem === 'acao_massa' || analise.exigeConfirmacaoForte;
}

export async function buscarContextosStatusPagamento(alunoIds: number[]): Promise<ContextoStatusPagamento[]> {
  if (alunoIds.length === 0) return [];

  const { data: alunosData, error: alunosError } = await supabase
    .from('alunos')
    .select(`
      id,
      nome,
      unidade_id,
      professor_atual_id,
      curso_id,
      status,
      status_pagamento,
      valor_parcela,
      tipo_matricula_id,
      data_inicio_contrato,
      data_fim_contrato
    `)
    .in('id', alunoIds);

  if (alunosError) throw alunosError;

  const { data: presencasData, error: presencasError } = await supabase
    .from('aluno_presenca')
    .select('aluno_id, data_aula, status')
    .in('aluno_id', alunoIds)
    .in('status', ['presente', 'ausente'])
    .order('data_aula', { ascending: false });

  if (presencasError) throw presencasError;

  const ultimaPresencaPorAluno = new Map<number, string>();
  for (const presenca of presencasData || []) {
    if (!ultimaPresencaPorAluno.has(presenca.aluno_id)) {
      ultimaPresencaPorAluno.set(presenca.aluno_id, presenca.data_aula);
    }
  }

  return (alunosData || []).map((aluno: any) => ({
    id: aluno.id,
    nome: aluno.nome,
    unidade_id: aluno.unidade_id,
    professor_atual_id: aluno.professor_atual_id,
    curso_id: aluno.curso_id,
    status: aluno.status,
    status_pagamento: aluno.status_pagamento,
    valor_parcela: aluno.valor_parcela,
    tipo_matricula_id: aluno.tipo_matricula_id,
    data_inicio_contrato: aluno.data_inicio_contrato,
    data_fim_contrato: aluno.data_fim_contrato,
    ultima_presenca: ultimaPresencaPorAluno.get(aluno.id) || null,
  }));
}

export async function registrarAuditoriaStatusPagamento({
  alunoId,
  alunoNome,
  ator,
  antes,
  depois,
  motivo,
  origem,
}: RegistroAuditoriaStatusPagamento) {
  const texto = [
    'Governança de status_pagamento',
    `Aluno: ${alunoNome}`,
    `Antes: ${getStatusPagamentoLabel(antes)}`,
    `Depois: ${getStatusPagamentoLabel(depois)}`,
    `Motivo: ${motivo}`,
    `Origem: ${origem}`,
    `Usuário: ${ator}`,
  ].join('\n');

  const { error } = await supabase
    .from('anotacoes_alunos')
    .insert({
      aluno_id: alunoId,
      texto,
      categoria: 'financeiro',
      criado_por: ator,
    });

  if (error) throw error;
}
