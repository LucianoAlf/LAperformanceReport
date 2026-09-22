/**
 * Regras da aba Turmas que o computador e o celular dividem.
 *
 * O desktop guardava tudo isto dentro do componente: a lista de dias, o
 * recorte por professor/dia/ocupação, o agrupamento por dia e a régua que diz
 * quando uma turma está vazia demais. A versão de celular precisa das mesmas
 * respostas — e reescrevê-las ali faria "turma sozinha" ter duas definições
 * numa escola cujo KPI da própria tela se chama SOZINHOS.
 */

export interface TurmaParaLista {
  professor_id: number;
  professor_nome: string;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  sala_nome?: string;
  capacidade_maxima: number;
  total_alunos: number;
  nomes_alunos: string[];
}

/** A semana como a escola a enumera — domingo não existe na grade. */
export const DIAS_SEMANA_TURMAS = [
  { valor: 'Segunda', nome: 'Segunda-feira', curto: 'Seg' },
  { valor: 'Terça', nome: 'Terça-feira', curto: 'Ter' },
  { valor: 'Quarta', nome: 'Quarta-feira', curto: 'Qua' },
  { valor: 'Quinta', nome: 'Quinta-feira', curto: 'Qui' },
  { valor: 'Sexta', nome: 'Sexta-feira', curto: 'Sex' },
  { valor: 'Sábado', nome: 'Sábado', curto: 'Sáb' },
] as const;

export type OcupacaoFiltro = '' | '0' | '1' | '2' | '3+';

export interface FiltroTurmas {
  professor_id?: string;
  dia?: string;
  ocupacao?: OcupacaoFiltro | string;
}

/** O mesmo recorte da tela do computador, na mesma ordem de verificação. */
export function filtrarTurmas<T extends TurmaParaLista>(
  turmas: readonly T[],
  { professor_id = '', dia = '', ocupacao = '' }: FiltroTurmas = {},
): T[] {
  return turmas.filter((t) => {
    if (professor_id && t.professor_id !== Number.parseInt(professor_id, 10)) return false;
    if (dia && t.dia_semana !== dia) return false;
    if (ocupacao === '0' && t.total_alunos !== 0) return false;
    if (ocupacao === '1' && t.total_alunos !== 1) return false;
    if (ocupacao === '2' && t.total_alunos !== 2) return false;
    if (ocupacao === '3+' && t.total_alunos < 3) return false;
    return true;
  });
}

/**
 * Agrupa por dia, cada dia em ordem de horário.
 *
 * ⚠️ Todo dia da semana aparece na chave, mesmo vazio: quem olha a grade
 * precisa ver que a quinta não tem nada, e não que a quinta sumiu.
 */
export function agruparTurmasPorDia<T extends TurmaParaLista>(
  turmas: readonly T[],
): Record<string, T[]> {
  const agrupado: Record<string, T[]> = {};
  for (const dia of DIAS_SEMANA_TURMAS) {
    agrupado[dia.valor] = turmas
      .filter((t) => t.dia_semana === dia.valor)
      .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
  }
  return agrupado;
}

export type NivelOcupacao = 'vazia' | 'sozinho' | 'dupla' | 'cheia' | 'ok';

/**
 * Quão cheia está a turma.
 *
 * `sozinho` é o nível que importa: é o mesmo caso que o KPI SOZINHOS da
 * própria página conta, e o que a coordenação usa para remanejar. Por isso ele
 * é alerta, não informação.
 */
export function nivelOcupacaoTurma(totalAlunos: number, capacidade = 4): NivelOcupacao {
  if (totalAlunos === 0) return 'vazia';
  if (totalAlunos === 1) return 'sozinho';
  if (totalAlunos === 2) return 'dupla';
  if (totalAlunos >= capacidade) return 'cheia';
  return 'ok';
}

/** "3/4 alunos" — o texto que acompanha o nível. */
export function textoOcupacaoTurma(totalAlunos: number, capacidade = 4): string {
  const unidade = totalAlunos === 1 ? 'aluno' : 'alunos';
  return `${totalAlunos}/${capacidade} ${unidade}`;
}

/** "14:00:00" vira "14:00"; o que não for horário volta como veio. */
export function formatarHorarioTurma(horario: string | null | undefined): string {
  if (!horario) return '';
  const casa = /^(\d{2}):(\d{2})/.exec(horario);
  return casa ? `${casa[1]}:${casa[2]}` : horario;
}
