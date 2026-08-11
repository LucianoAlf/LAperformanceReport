import type { AlunoAgenda, AulaAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';

/**
 * Estados da chamada (Fase 2, spec 2026-08-11).
 *
 * O Emusys so conhece presente/ausente e "ausente" e o DEFAULT dele — por isso
 * o destino so existe quando ha resposta humana OU presenca confirmada. A falta
 * vinda do Emusys (fallback) NAO e destino: e a zona cinzenta que o digest
 * diario cobra da equipe.
 */

export type EstadoChamada = 'presente' | 'falta' | 'falta_justificada' | 'indeterminado';

const ORIGENS_HUMANAS = new Set([
  'professor_la_teacher',
  'professor_whatsapp',
  'manual',
  'fabio_audio',
  'agenda_secretaria',
]);

/** Estado operacional do aluno na aula, do ponto de vista da chamada. */
export function estadoDoAluno(aluno: AlunoAgenda): EstadoChamada {
  if (aluno.status_presenca === 'falta_justificada') return 'falta_justificada';
  if (aluno.status_presenca === 'presente') return 'presente';
  // Falta so e destino quando um HUMANO marcou. `respondido_por` nulo/emusys/
  // sistema com status falta e o fallback do Emusys — zona cinzenta.
  if (aluno.status_presenca === 'falta' && aluno.respondido_por && ORIGENS_HUMANAS.has(aluno.respondido_por)) {
    return 'falta';
  }
  return 'indeterminado';
}

/** Aluno sem destino: aula ja ocorreu e ninguem deu presenca/falta/justificada. */
export function alunoSemDestino(aula: AulaAgenda, aluno: AlunoAgenda, data: string, agora: Date): boolean {
  if (aula.cancelada) return false;
  if (!aulaJaOcorreu(data, aula.hora_fim, agora)) return false;
  return estadoDoAluno(aluno) === 'indeterminado';
}

/** Aula com a chamada completa: todo aluno vinculado tem destino. */
export function chamadaCompleta(aula: AulaAgenda, data: string, agora: Date): boolean {
  if (aula.cancelada) return true;
  const vinculados = aula.alunos.filter((a) => a.aluno_id != null);
  if (vinculados.length === 0) return false;
  return vinculados.every((a) => !alunoSemDestino(aula, a, data, agora));
}

/** Evidencia bruta do Emusys diverge do destino humano final. */
export function temConflito(aluno: AlunoAgenda): boolean {
  if (!aluno.emusys_presenca_bruta || !aluno.respondido_por) return false;
  if (!ORIGENS_HUMANAS.has(aluno.respondido_por)) return false;
  const humanoPresente = aluno.status_presenca === 'presente';
  const emusysPresente = aluno.emusys_presenca_bruta === 'presente';
  return humanoPresente !== emusysPresente;
}

export const ROTULO_ORIGEM: Record<string, string> = {
  agenda_secretaria: 'Secretaria',
  professor_la_teacher: 'Teacher',
  professor_whatsapp: 'Prof. WhatsApp',
  manual: 'Manual',
  fabio_audio: 'Fábio',
  emusys: 'Emusys',
  sistema: 'Emusys',
};

export function rotuloOrigem(respondidoPor: string | null): string {
  if (!respondido_por_vazio(respondidoPor)) return ROTULO_ORIGEM[respondidoPor!] ?? respondidoPor!;
  return 'Sem registro';
}

function respondido_por_vazio(valor: string | null): boolean {
  return valor == null || valor === '';
}

/** Motivos sugeridos (chips) — o texto livre e o que vale; chips so agilizam. */
export const SUGESTOES_JUSTIFICATIVA = [
  'Atestado médico',
  'Declaração de trabalho',
] as const;

export const SUGESTOES_CANCELAMENTO = [
  'Vendaval / condições climáticas',
  'Falta do professor',
  'Feriado',
  'Problema na sala',
] as const;
