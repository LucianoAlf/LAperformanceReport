import { normalizarDiaSemana } from './turmas.ts';

/**
 * As agregações da aba Distribuição — compartilhadas pelo computador e pelo
 * celular.
 *
 * São cinco leituras da mesma grade (por professor, por curso, por dia, por
 * horário e o mapa dia × horário) mais os avisos que saem dele. Todas viviam
 * dentro do componente; reescrevê-las na tela do celular faria "horário de
 * pico" ter duas respostas para o mesmo dia.
 */

export interface TurmaParaDistribuicao {
  professor_id: number;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  total_alunos: number;
}

export const DIAS_DISTRIBUICAO = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/**
 * 🔴 Reaproveita a normalizacao de `@/lib/turmas`: 135 das 895 turmas (15%)
 * gravam o dia por extenso ("Quarta-feira"), e comparar o texto cru as
 * descartava de TODA esta aba — do total por dia ao mapa de calor. Era isso
 * que o `console.log` de depuracao avisava, para ninguem.
 */

/** A escola abre 08h–21h de segunda a sexta e 08h–16h no sábado. */
export const HORARIOS_SEG_SEX = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
] as const;
export const HORARIOS_SABADO = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
] as const;

export function horariosDoDia(dia: string): readonly string[] {
  return dia === 'Sábado' ? HORARIOS_SABADO : HORARIOS_SEG_SEX;
}

/** "14:00:00" e "14:00" viram "14:00"; ausente vira "00:00", como no desktop. */
export function horaCheia(horario: string | null | undefined): string {
  return horario?.substring(0, 5) || '00:00';
}

export interface EstatProfessor {
  id: number;
  nome: string;
  totalAlunos: number;
  totalTurmas: number;
  mediaAlunos: number;
}

/**
 * ⚠️ Parte dos PROFESSORES, não das turmas: quem não tem turma nenhuma
 * precisa aparecer com zero — é justamente o caso que a coordenação procura.
 */
export function estatisticasPorProfessor(
  turmas: readonly TurmaParaDistribuicao[],
  professores: ReadonlyArray<{ id: number; nome: string }>,
): EstatProfessor[] {
  return professores
    .map((p) => {
      const daPessoa = turmas.filter((t) => t.professor_id === p.id);
      const totalAlunos = daPessoa.reduce((soma, t) => soma + t.total_alunos, 0);
      return {
        id: p.id,
        nome: p.nome,
        totalAlunos,
        totalTurmas: daPessoa.length,
        mediaAlunos: daPessoa.length > 0 ? totalAlunos / daPessoa.length : 0,
      };
    })
    .sort((a, b) => b.totalAlunos - a.totalAlunos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface EstatCurso {
  nome: string;
  totalAlunos: number;
  totalTurmas: number;
}

/** Turma sem curso entra como "Sem curso" — sumir com ela esconderia o vazio. */
export function estatisticasPorCurso(turmas: readonly TurmaParaDistribuicao[]): EstatCurso[] {
  const porCurso = new Map<string, EstatCurso>();
  for (const t of turmas) {
    const nome = t.curso_nome || 'Sem curso';
    const atual = porCurso.get(nome) ?? { nome, totalAlunos: 0, totalTurmas: 0 };
    atual.totalAlunos += t.total_alunos;
    atual.totalTurmas += 1;
    porCurso.set(nome, atual);
  }
  return [...porCurso.values()].sort((a, b) => b.totalAlunos - a.totalAlunos);
}

export interface EstatDia {
  dia: string;
  totalTurmas: number;
  totalAlunos: number;
  turmasSozinhas: number;
}

/** Todo dia da semana aparece, mesmo zerado. */
export function estatisticasPorDia(turmas: readonly TurmaParaDistribuicao[]): EstatDia[] {
  return DIAS_DISTRIBUICAO.map((dia) => {
    const doDia = turmas.filter((t) => normalizarDiaSemana(t.dia_semana) === dia);
    return {
      dia,
      totalTurmas: doDia.length,
      totalAlunos: doDia.reduce((soma, t) => soma + t.total_alunos, 0),
      turmasSozinhas: doDia.filter((t) => t.total_alunos === 1).length,
    };
  });
}

export interface EstatHorario {
  horario: string;
  totalTurmas: number;
  totalAlunos: number;
}

export function estatisticasPorHorario(turmas: readonly TurmaParaDistribuicao[]): EstatHorario[] {
  const porHora = new Map<string, EstatHorario>();
  for (const t of turmas) {
    const h = horaCheia(t.horario_inicio);
    const atual = porHora.get(h) ?? { horario: h, totalTurmas: 0, totalAlunos: 0 };
    atual.totalTurmas += 1;
    atual.totalAlunos += t.total_alunos;
    porHora.set(h, atual);
  }
  return [...porHora.values()].sort((a, b) => a.horario.localeCompare(b.horario));
}

export interface CelulaCalor {
  alunos: number;
  turmas: number;
}

export interface MapaDeCalor {
  mapa: Record<string, Record<string, CelulaCalor>>;
  maxAlunos: number;
  /**
   * Turmas que NÃO couberam na grade de horários (fora de 08h–21h, ou depois
   * das 16h no sábado).
   *
   * ⚠️ Antes isto era um `console.log` de depuração dentro do componente —
   * ou seja, um aviso que ninguém lê. Agora é dado de retorno: quem exibe
   * decide, mas o número existe.
   */
  foraDaGrade: Array<{ dia: string; horario: string; alunos: number }>;
}

export function montarMapaDeCalor(turmas: readonly TurmaParaDistribuicao[]): MapaDeCalor {
  const mapa: Record<string, Record<string, CelulaCalor>> = {};
  for (const dia of DIAS_DISTRIBUICAO) {
    mapa[dia] = {};
    for (const h of horariosDoDia(dia)) {
      mapa[dia][h] = { alunos: 0, turmas: 0 };
    }
  }

  let maxAlunos = 0;
  const foraDaGrade: MapaDeCalor['foraDaGrade'] = [];

  for (const t of turmas) {
    if (!t.dia_semana || !t.horario_inicio) continue;
    const h = horaCheia(t.horario_inicio);
    const diaNormalizado = normalizarDiaSemana(t.dia_semana);
    const celula = mapa[diaNormalizado]?.[h];
    if (!celula) {
      foraDaGrade.push({ dia: diaNormalizado || t.dia_semana, horario: h, alunos: t.total_alunos });
      continue;
    }
    celula.alunos += t.total_alunos;
    celula.turmas += 1;
    if (celula.alunos > maxAlunos) maxAlunos = celula.alunos;
  }

  return { mapa, maxAlunos, foraDaGrade };
}

export type NivelCalor = 'vazio' | 'baixo' | 'medio' | 'alto' | 'pico';

export function nivelDoCalor(alunos: number, max: number): NivelCalor {
  if (alunos === 0) return 'vazio';
  const intensidade = max > 0 ? alunos / max : 0;
  if (intensidade < 0.25) return 'baixo';
  if (intensidade < 0.5) return 'medio';
  if (intensidade < 0.75) return 'alto';
  return 'pico';
}

/**
 * As frases que o mapa produz.
 *
 * ⚠️ Cada uma tem o seu limiar e só aparece quando ele é cruzado — manhã
 * subutilizada abaixo de 30%, sábado acima de 20% da média dos dias úteis.
 * Frase que apareceria sempre não é achado, é legenda.
 */
export function avisosDoMapaDeCalor({ mapa }: Pick<MapaDeCalor, 'mapa'>): string[] {
  const avisos: string[] = [];

  let maiorPico = 0;
  let horarioPico = '';
  let diaPico = '';
  let totalManha = 0;
  let totalTarde = 0;
  let totalSabado = 0;
  let totalUteis = 0;

  for (const dia of DIAS_DISTRIBUICAO) {
    for (const h of horariosDoDia(dia)) {
      const alunos = mapa[dia]?.[h]?.alunos ?? 0;
      if (alunos > maiorPico) {
        maiorPico = alunos;
        horarioPico = h;
        diaPico = dia;
      }
      if (Number.parseInt(h.split(':')[0], 10) < 12) totalManha += alunos;
      else totalTarde += alunos;
      if (dia === 'Sábado') totalSabado += alunos;
      else totalUteis += alunos;
    }
  }

  if (horarioPico) {
    avisos.push(`Horário de pico: ${diaPico} às ${horarioPico} com ${maiorPico} alunos`);
  }

  const totalDia = totalManha + totalTarde;
  const percentManha = totalDia > 0 ? Math.round((totalManha / totalDia) * 100) : 0;
  if (percentManha < 30) {
    avisos.push(`Manhãs subutilizadas: apenas ${percentManha}% dos alunos estudam antes das 12h`);
  }

  const mediaUteis = totalUteis / 5;
  if (mediaUteis > 0 && totalSabado > mediaUteis * 1.2) {
    const acima = Math.round((totalSabado / mediaUteis - 1) * 100);
    avisos.push(`Sábado é o dia mais procurado: ${totalSabado} alunos (${acima}% acima da média)`);
  }

  return avisos;
}
