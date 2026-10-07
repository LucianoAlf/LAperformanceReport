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

/**
 * O dia de hoje no vocabulario da grade ("Segunda", "Terca"...).
 *
 * ⚠️ Domingo nao existe na grade da escola, entao ele devolve `''` — que a
 * tela le como "semana toda". Devolver "Domingo" daria uma lista vazia sem
 * dizer por que.
 */
export function diaDeHojeNaGrade(agora: Date = new Date()): string {
  const indice = agora.getDay(); // 0 = domingo
  if (indice === 0) return '';
  return DIAS_SEMANA_TURMAS[indice - 1]?.valor ?? '';
}

/**
 * 🔴 O MESMO DIA CHEGA EM DUAS FORMAS, e a forma longa sumia das telas.
 *
 * Medido em 22/09 nas 895 turmas: **135 (15%) gravam "Quarta-feira" em vez de
 * "Quarta"** — 32 na quinta, 30 na quarta, 28 na sexta, 24 na segunda e 21 na
 * terça. A causa esta documentada no CLAUDE.md: sao DOIS caminhos de escrita.
 * `handleMatriculaNova` grava `agendamentos.dia_da_semana_nome` ("Quarta-feira")
 * e o sync deriva do `nome_turma` ("Quarta").
 *
 * Quem agrupa por dia comparando texto cru descarta essas 135 em SILENCIO —
 * elas nao aparecem na grade por dia, nem no mapa de calor, nem nas contagens
 * por dia. Nao e defeito do celular: o computador faz o mesmo desde sempre.
 *
 * ⚠️ Isto normaliza para LER. A escrita continua como esta; consertar a fonte
 * e outra frente (e ela tem dois donos).
 */
export function normalizarDiaSemana(dia: string | null | undefined): string {
  if (!dia) return '';
  const limpo = dia.trim();
  // "Quarta-feira" e "quarta feira" viram "Quarta"; "Sábado" nao tem sufixo.
  const semSufixo = limpo.replace(/[-\s]*feira$/i, '').trim();
  const casado = DIAS_SEMANA_TURMAS.find(
    (d) => d.valor.localeCompare(semSufixo, 'pt-BR', { sensitivity: 'base' }) === 0,
  );
  return casado ? casado.valor : semSufixo;
}

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
    if (dia && normalizarDiaSemana(t.dia_semana) !== dia) return false;
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
      .filter((t) => normalizarDiaSemana(t.dia_semana) === dia.valor)
      .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
  }
  return agrupado;
}

/**
 * A identidade de uma turma.
 *
 * 🔴 Medido em 22/09, nas 895 turmas implicitas: (professor, dia, horario)
 * COLIDE em 7 casos — o mesmo professor, no mesmo horario, com dois cursos:
 * Piano x Teclado (Kaio, sabado 11h), Guitarra x Violao (Lucas, sabado 10h),
 * Musicalizacao Infantil x Preparatoria (Ana Beatriz, sexta 19h). Nao e
 * defeito de cadastro: sao aulas distintas que acontecem juntas.
 *
 * Com o CURSO junto, as colisoes vao a zero. A unidade tambem entra, porque o
 * Consolidado poe as tres na mesma lista.
 *
 * ⚠️ Nao usar o indice da lista como identidade (e o que a tela do computador
 * faz na `key`): indice identifica a POSICAO, entao ele se conserva ao trocar
 * de filtro e passa a apontar para outra turma.
 */
export function chaveDaTurma(turma: {
  turma_explicita_id?: number;
  id?: number;
  unidade_id?: string;
  professor_id: number;
  curso_id?: number;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
}): string {
  if (turma.turma_explicita_id) return `exp:${turma.turma_explicita_id}`;
  // `curso_id` pode faltar em turma implicita antiga; o nome sustenta a
  // distincao nesse caso, e voltar a colidir seria pior que uma chave longa.
  const curso = turma.curso_id ?? turma.curso_nome ?? '?';
  return [
    'imp',
    turma.unidade_id ?? '?',
    turma.professor_id,
    curso,
    turma.dia_semana,
    turma.horario_inicio,
  ].join('|');
}

export type NivelOcupacao = 'vazia' | 'sozinho' | 'dupla' | 'cheia' | 'ok';

/**
 * Quão cheia está a turma.
 *
 * 🔴 `sozinho` NÃO é alerta, ao contrário do que o nome sugere. Medido em
 * 22/09 nas 895 turmas: **745 (83,2%) têm um aluno só** — na LA quase toda
 * disciplina é contratada como turma e roda individual. Quem pinta 83% da
 * lista de vermelho não está avisando nada; está escolhendo uma cor de fundo.
 * O nível existe para o FILTRO ("Sozinhas"), e quem decide se merece cor é a
 * tela.
 *
 * ⚠️ Capacidade desconhecida (630 das 895 turmas, 70%) nunca vira `cheia`:
 * `3 >= null` é `true` em JavaScript, e era isso que fazia a tela do
 * computador escrever "3/null ✓" numa turma cuja lotação ninguém declarou.
 */
export function nivelOcupacaoTurma(totalAlunos: number, capacidade?: number | null): NivelOcupacao {
  if (totalAlunos === 0) return 'vazia';
  if (totalAlunos === 1) return 'sozinho';
  if (totalAlunos === 2) return 'dupla';
  if (capacidade != null && totalAlunos >= capacidade) return 'cheia';
  return 'ok';
}

/**
 * "3/4 alunos" — ou "3 alunos", quando a lotação não foi declarada.
 *
 * ⚠️ Sem capacidade não se inventa denominador: dizer "3/4" onde ninguém
 * declarou 4 afirma uma lotação que o cadastro não tem.
 */
export function textoOcupacaoTurma(totalAlunos: number, capacidade?: number | null): string {
  const unidade = totalAlunos === 1 ? 'aluno' : 'alunos';
  if (capacidade == null) return `${totalAlunos} ${unidade}`;
  return `${totalAlunos}/${capacidade} ${unidade}`;
}

/** "14:00:00" vira "14:00"; o que não for horário volta como veio. */
export function formatarHorarioTurma(horario: string | null | undefined): string {
  if (!horario) return '';
  const casa = /^(\d{2}):(\d{2})/.exec(horario);
  return casa ? `${casa[1]}:${casa[2]}` : horario;
}
