/**
 * O resumo do Dashboard da Farmer no celular (LAPE-32, 29/09/2026).
 *
 * No computador o Dashboard é uma coluna de blocos com 3.196px medidos a 390px
 * (4,4 telas). No celular cada bloco vira UMA linha com a sua contagem, e o
 * bloco inteiro — o mesmo do computador — abre numa folha.
 *
 * Aqui mora só a decisão de cada linha: o número, o tom e se há o que abrir.
 * Os números vêm dos mesmos hooks do computador; nada é recalculado.
 *
 * Ordem (aprovada em 29/09): o que está vencido, depois o que é do dia, depois
 * o contexto.
 */

export type TomLinha = 'critico' | 'atencao' | 'neutro';

export type ChaveLinha =
  | 'checklists'
  | 'alertas'
  | 'tarefas'
  | 'rotinas'
  | 'criticos'
  | 'feedback'
  | 'equipe';

export interface LinhaResumo {
  chave: ChaveLinha;
  emoji: string;
  rotulo: string;
  valor: string;
  tom: TomLinha;
  /** Sem nada para abrir, a linha não é botão e não ganha seta. */
  abre: boolean;
}

export interface EntradaResumo {
  checklistsComAlerta: number;
  checklistsVencidos: number;
  totalAlertas: number;
  renovacoesVencidas: number;
  tarefasAtrasadas: number;
  tarefasTotal: number;
  rotinasConcluidas: number;
  rotinasTotal: number;
  alunosCriticos: number;
  professoresSemFeedback: number;
  equipe: number;
}

function tom(critico: boolean, atencao: boolean): TomLinha {
  if (critico) return 'critico';
  if (atencao) return 'atencao';
  return 'neutro';
}

export function montarLinhasResumo(e: EntradaResumo): LinhaResumo[] {
  return [
    {
      chave: 'checklists',
      emoji: '⚠️',
      rotulo: 'Checklists com prazo',
      valor: String(e.checklistsComAlerta),
      tom: tom(e.checklistsVencidos > 0, e.checklistsComAlerta > 0),
      // No computador o bloco só existe com alerta; aqui também.
      abre: e.checklistsComAlerta > 0,
    },
    {
      chave: 'alertas',
      emoji: '🚨',
      rotulo: 'Alertas do dia',
      valor: String(e.totalAlertas),
      tom: tom(e.renovacoesVencidas > 0, e.totalAlertas > 0),
      // O bloco existe sempre (com "Tudo em dia" quando zerado).
      abre: true,
    },
    {
      chave: 'tarefas',
      emoji: '📝',
      rotulo: 'Tarefas urgentes',
      valor: String(e.tarefasTotal),
      tom: tom(e.tarefasAtrasadas > 0, e.tarefasTotal > 0),
      abre: e.tarefasTotal > 0,
    },
    {
      chave: 'rotinas',
      emoji: '✅',
      rotulo: 'Rotinas de hoje',
      valor: `${e.rotinasConcluidas}/${e.rotinasTotal}`,
      tom: tom(false, e.rotinasConcluidas < e.rotinasTotal),
      abre: true,
    },
    {
      chave: 'criticos',
      emoji: '❤️',
      rotulo: e.alunosCriticos === 1 ? 'Aluno com saúde crítica' : 'Alunos com saúde crítica',
      valor: String(e.alunosCriticos),
      tom: tom(e.alunosCriticos > 0, false),
      abre: true,
    },
    {
      chave: 'feedback',
      emoji: '📋',
      rotulo: e.professoresSemFeedback === 1 ? 'Professor sem feedback' : 'Professores sem feedback',
      valor: String(e.professoresSemFeedback),
      tom: tom(false, e.professoresSemFeedback > 0),
      abre: true,
    },
    {
      chave: 'equipe',
      emoji: '👥',
      rotulo: 'Equipe Farmer',
      valor: String(e.equipe),
      tom: 'neutro',
      abre: e.equipe > 0,
    },
  ];
}
