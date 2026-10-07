import {
  DIAS_SEMANA_TURMAS,
  chaveDaTurma,
  formatarHorarioTurma,
  normalizarDiaSemana,
} from './turmas.ts';

/**
 * As regras da Grade Horária — compartilhadas pelo computador e pelo celular.
 *
 * A matriz do desktop é hora × dia. No celular ela não atravessa: a 390px
 * sobram 203px para a semana inteira, e uma aula de 60 min viraria uma
 * lasquinha. Lá o eixo horizontal é POSIÇÃO; aqui ele vira ESCOLHA (um dia
 * por vez) e a hora vira ORDEM.
 *
 * O que não muda é a resposta: quem dá aula, em que sala, com quantos alunos,
 * naquela hora daquele dia. Por isso o agrupamento mora aqui, e não dentro de
 * cada tela.
 */

export interface TurmaNaGrade {
  turma_explicita_id?: number | null;
  id?: number;
  unidade_id?: string;
  unidade_nome?: string;
  professor_id: number;
  professor_nome: string;
  sala_nome?: string;
  curso_id?: number | null;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  capacidade_maxima?: number | null;
  num_alunos: number;
  nomes_alunos?: string[];
}

/**
 * As 13 horas em que a escola opera, 08h às 20h.
 *
 * ⚠️ Conferido no banco em 22/09: as 896 turmas começam em hora cheia, dentro
 * desta faixa — nenhuma às 07h, nenhuma às 21h, nenhuma aos 30 minutos. A
 * lista é fechada de propósito (hora vazia precisa aparecer como vazia), e
 * quem cair fora dela vai para `foraDaGrade`, nunca para o silêncio.
 */
export const HORAS_DA_GRADE = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
] as const;

export const DIAS_DA_GRADE = DIAS_SEMANA_TURMAS;

/** "14:00:00" → "14:00". */
export function horaDaTurma(turma: Pick<TurmaNaGrade, 'horario_inicio'>): string {
  return formatarHorarioTurma(turma.horario_inicio);
}

export interface BlocoDeHora<T> {
  hora: string;
  turmas: T[];
  totalAlunos: number;
}

export interface GradeDoDia<T> {
  dia: string;
  blocos: BlocoDeHora<T>[];
  totalTurmas: number;
  totalAlunos: number;
  /** Horas da grade em que não há turma nenhuma neste dia. */
  horasLivres: string[];
}

/**
 * Ordena as turmas de uma hora: primeiro a sala, depois o professor.
 *
 * ⚠️ Sem desempate a lista dança entre renderizações, e quem procura um nome
 * o encontra em lugar diferente a cada toque. A chave fecha o desempate.
 */
function ordenarNaHora<T extends TurmaNaGrade>(turmas: T[]): T[] {
  return [...turmas].sort((a, b) => {
    const sala = (a.sala_nome ?? '').localeCompare(b.sala_nome ?? '', 'pt-BR');
    if (sala !== 0) return sala;
    const prof = (a.professor_nome ?? '').localeCompare(b.professor_nome ?? '', 'pt-BR');
    if (prof !== 0) return prof;
    return chaveDaTurma(a as never).localeCompare(chaveDaTurma(b as never));
  });
}

/**
 * A grade de UM dia, hora a hora.
 *
 * 🔴 O dia é comparado NORMALIZADO. A matriz do desktop indexa `grade[dia]`
 * pelo texto cru, e por isso descarta em silêncio as 135 turmas de 896 (15%)
 * que gravam "Quarta-feira" em vez de "Quarta" — medido em 22/09. O contador
 * dela diz "896 turma(s) encontrada(s)" e a tabela renderiza 761: o número e
 * a tela discordam, e ninguém vê qual está certo.
 */
export function gradeDoDia<T extends TurmaNaGrade>(
  turmas: readonly T[],
  dia: string,
  horas: readonly string[] = HORAS_DA_GRADE,
): GradeDoDia<T> {
  const doDia = turmas.filter((t) => normalizarDiaSemana(t.dia_semana) === dia);

  const porHora = new Map<string, T[]>();
  for (const h of horas) porHora.set(h, []);
  for (const t of doDia) {
    const lista = porHora.get(horaDaTurma(t));
    if (lista) lista.push(t);
  }

  const blocos: BlocoDeHora<T>[] = horas.map((hora) => {
    const daHora = ordenarNaHora(porHora.get(hora) ?? []);
    return {
      hora,
      turmas: daHora,
      totalAlunos: daHora.reduce((soma, t) => soma + (t.num_alunos ?? 0), 0),
    };
  });

  return {
    dia,
    blocos,
    totalTurmas: blocos.reduce((soma, b) => soma + b.turmas.length, 0),
    totalAlunos: blocos.reduce((soma, b) => soma + b.totalAlunos, 0),
    horasLivres: blocos.filter((b) => b.turmas.length === 0).map((b) => b.hora),
  };
}

export interface ResumoDoDia {
  dia: string;
  curto: string;
  totalTurmas: number;
  totalAlunos: number;
}

/** O contador de cada chip de dia — todo dia aparece, inclusive o zerado. */
export function resumoPorDia<T extends TurmaNaGrade>(
  turmas: readonly T[],
  dias: readonly { valor: string; curto: string }[] = DIAS_DA_GRADE,
): ResumoDoDia[] {
  return dias.map(({ valor, curto }) => {
    const doDia = turmas.filter((t) => normalizarDiaSemana(t.dia_semana) === valor);
    return {
      dia: valor,
      curto,
      totalTurmas: doDia.length,
      totalAlunos: doDia.reduce((soma, t) => soma + (t.num_alunos ?? 0), 0),
    };
  });
}

/**
 * As turmas que não couberam em nenhuma célula da grade.
 *
 * ⚠️ Existe como DADO de retorno, não como `console.log`: foi assim que as
 * 135 turmas de dia por extenso apareceram na Distribuição. Hoje, com a
 * normalização, isto dá zero — e é justamente por dar zero que precisa
 * continuar sendo medido: se voltar a subir, alguém vê.
 */
export function turmasForaDaGrade<T extends TurmaNaGrade>(
  turmas: readonly T[],
  horas: readonly string[] = HORAS_DA_GRADE,
  dias: readonly { valor: string }[] = DIAS_DA_GRADE,
): Array<{ turma: T; motivo: 'dia' | 'hora' }> {
  const diasValidos = new Set(dias.map((d) => d.valor));
  const horasValidas = new Set(horas);
  const fora: Array<{ turma: T; motivo: 'dia' | 'hora' }> = [];
  for (const t of turmas) {
    if (!diasValidos.has(normalizarDiaSemana(t.dia_semana))) {
      fora.push({ turma: t, motivo: 'dia' });
    } else if (!horasValidas.has(horaDaTurma(t))) {
      fora.push({ turma: t, motivo: 'hora' });
    }
  }
  return fora;
}

/**
 * Os professores presentes num conjunto de turmas, para o filtro.
 *
 * ⚠️ Sai das TURMAS, não do cadastro de professores: aqui a pergunta é "quem
 * está na grade deste dia", e oferecer quem não tem aula nenhuma encheria o
 * filtro de opções que devolvem lista vazia.
 */
export function professoresNaGrade<T extends TurmaNaGrade>(
  turmas: readonly T[],
): Array<{ id: number; nome: string; turmas: number }> {
  const porId = new Map<number, { id: number; nome: string; turmas: number }>();
  for (const t of turmas) {
    const atual = porId.get(t.professor_id) ?? {
      id: t.professor_id,
      nome: t.professor_nome || 'Sem professor',
      turmas: 0,
    };
    atual.turmas += 1;
    porId.set(t.professor_id, atual);
  }
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * A intensidade de uma hora, para a barra do cabeçalho do bloco.
 *
 * ⚠️ Relativa ao PICO DO DIA, não a um número fixo: sábado tem metade das
 * horas de uma terça, e uma régua absoluta pintaria o sábado inteiro de frio
 * mesmo quando ele está lotado para o que é.
 */
export function pesoDaHora(turmasNaHora: number, picoDoDia: number): number {
  if (picoDoDia <= 0) return 0;
  return Math.min(1, turmasNaHora / picoDoDia);
}
