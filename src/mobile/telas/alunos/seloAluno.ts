import { getStatusPagamentoOperacional } from '@/lib/alunosStatus';
import type { AlunoLista } from '@/hooks/useAlunosLista';

/**
 * A decisão de o que a linha SINALIZA — separada do JSX para poder ser
 * executada por teste, e não conferida por regex.
 */

export interface SeloAluno {
  texto: string;
  classe: string;
}

/**
 * ⚠️ UM valor, nunca condições independentes. `cn()`/twMerge faz a última
 * classe conflitante vencer, e condições soltas já produziram bug real neste
 * repo (a Agenda pintava a aula contradizendo o próprio badge).
 *
 * A ordem é de gravidade: quem está inadimplente E em aviso prévio aparece
 * como inadimplente, que é o que exige ação hoje.
 */
export function seloDoAluno(aluno: AlunoLista): SeloAluno | null {
  // Pela regra compartilhada, nunca pelo campo cru: quem evadiu devendo não é
  // sinalizado aqui — a cobrança dele é do financeiro, não da lista de alunos.
  if (getStatusPagamentoOperacional(aluno) === 'inadimplente') {
    return { texto: 'Inadimplente', classe: 'border-rose-500/30 bg-rose-500/10 text-rose-300' };
  }

  const status = String(aluno.status || '').toLowerCase();
  if (status === 'aviso_previo') {
    return { texto: 'Aviso prévio', classe: 'border-amber-500/30 bg-amber-500/10 text-amber-300' };
  }
  if (status === 'trancado') {
    return { texto: 'Trancado', classe: 'border-slate-600/40 bg-slate-700/30 text-slate-300' };
  }
  if (status === 'inativo') {
    return { texto: 'Saiu', classe: 'border-slate-700/40 bg-slate-800/40 text-slate-400' };
  }
  if (aluno.aguardando_renovacao) {
    return { texto: 'Renovar', classe: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' };
  }

  // Aluno ativo e em dia não recebe selo: cor é vocabulário de EXCEÇÃO. Numa
  // lista em que tudo está destacado, nada está — é a regra que a Agenda já
  // segue desde 03/08/2026.
  return null;
}

/** "Terça" + "14:00:00" -> "Terça 14:00"; a falta de um dos dois não vira traço solto. */
export function quandoTemAula(dia: string | null, horario: string | null): string {
  const hora = horario ? horario.slice(0, 5) : '';
  return [dia ?? '', hora].filter(Boolean).join(' ');
}

/** Só dígitos, com 55 na frente — é o que o wa.me aceita. */
export function linkWhatsApp(numero: string | null | undefined): string | null {
  const digitos = String(numero ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.startsWith('55') ? digitos : `55${digitos}`}`;
}
