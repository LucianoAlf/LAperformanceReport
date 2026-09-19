/**
 * Regras puras do modulo Eventos (recital) — LAPE-39.
 *
 * Fica fora do componente porque sao decisoes de dominio, nao de renderizacao: a mesma
 * resposta vale para a aba Alunos, para a montagem da grade (fase 3) e para a impressao
 * (fase 6). Reimplementar no consumidor e o que produziu as duplicatas de renovacao.
 */

export type MotivoSemCurso = 'so_atividade_extra' | 'curso_nao_cadastrado' | null;

/** O que a aba Alunos precisa saber para decidir o que fazer com uma pessoa. */
export interface AlunoParaAvaliar {
  nome: string;
  cursos_no_recital: number;
  faz_banda: boolean;
  motivo_sem_curso: MotivoSemCurso;
}

/**
 * O veredito e UM valor, nunca um conjunto de flags independentes.
 *
 * ⚠️ `cn()` usa twMerge e a ultima classe conflitante vence — estado derivado de
 * condicoes soltas ja pintou cartao contradizendo o proprio rotulo no modulo Agenda.
 */
export type SituacaoPalco = 'apto' | 'sem_curso_regular' | 'cadastro_incompleto';

export interface AvaliacaoElegibilidade {
  situacao: SituacaoPalco;
  /** Frase curta exibida junto do nome. `null` = nada a dizer, o caso normal. */
  aviso: string | null;
  /**
   * Se `false`, a tela nao oferece o botao "participa".
   *
   * ⚠️ HOJE E SEMPRE `true`, e isso e decisao, nao esquecimento. Os dois casos sem curso
   * poderiam ser bloqueados e nenhum deve ser:
   *   • so atividade extra — o Arthur disse que banda nao entra na GRADE, nao que o aluno
   *     nao vai ao evento; ele pode subir num numero coletivo, e bloquear decidiria por ele.
   *   • cadastro incompleto — barrar seria punir o aluno por um erro do cadastro, e o
   *     recital acontece antes de alguem corrigir o Emusys.
   * O campo fica porque a fase 3 (grade) tem um "pode" diferente deste, e porque a regra
   * precisa de um lugar para mudar caso o Luciano decida o contrario.
   */
  podeParticipar: boolean;
}

/**
 * Decide como a aba Alunos trata uma pessoa da lista.
 *
 * Contexto medido em 18/09/2026, nas 3 unidades (1.001 pessoas ativas): apenas 3 chegam
 * aqui sem curso para apresentar, e elas NAO sao o mesmo caso —
 *
 *   • 2 em Campo Grande so tem atividade extra (Minha Banda Para Sempre, Power Kids).
 *     E a regra da casa funcionando: banda nao sobe no recital.
 *   • 1 na Barra (Manuela Isolani) tem `curso_id` NULO no cadastro. E defeito — ela
 *     aparece no CSV que o Arthur usou, ou seja, o Emusys sabe o curso e nos nao.
 *
 * As 998 restantes sao `apto` e nao veem aviso nenhum.
 */
export function avaliarElegibilidade(aluno: AlunoParaAvaliar): AvaliacaoElegibilidade {
  // O caso normal vem primeiro e sai sem aviso: 998 das 1.001 pessoas passam por aqui, e
  // uma lista em que toda linha tem um alerta e uma lista sem alerta nenhum.
  if (aluno.cursos_no_recital > 0) {
    return { situacao: 'apto', aviso: null, podeParticipar: true };
  }

  if (aluno.motivo_sem_curso === 'curso_nao_cadastrado') {
    return {
      situacao: 'cadastro_incompleto',
      // Diz ONDE se conserta. "Sem curso" sozinho descreve o sintoma e deixa a
      // coordenacao sem saber se e regra nossa ou erro que ela pode mandar arrumar.
      aviso: 'sem curso no cadastro — conferir no Emusys',
      podeParticipar: true,
    };
  }

  return {
    situacao: 'sem_curso_regular',
    aviso: 'só atividade extra — não gera apresentação',
    podeParticipar: true,
  };
}

/* ──────────────────────── horario da grade (calculado) ──────────────────────── */

/**
 * O horario NAO e persistido — e derivado, como o `recalculateSchedule` do prototipo.
 *
 * Guardar horario calculado significa ter duas verdades: a coluna e a conta. Arrastar uma
 * apresentacao entre blocos mudaria o horario de todas as seguintes, e qualquer caminho de
 * escrita que esquecesse de recalcular deixaria a programacao impressa mentindo.
 * `evento_bloco.horario_inicial` so guarda o que o humano DIGITOU (`inicio_manual`).
 */

export interface ApresentacaoParaCalculo {
  id: number;
  ordem: number;
  /** `null` = usa a duracao padrao do evento. */
  duracao_segundos: number | null;
}

export interface BlocoParaCalculo {
  id: number;
  ordem: number;
  /** 'HH:MM' ou 'HH:MM:SS'. So vale quando `inicio_manual` e true. */
  horario_inicial: string | null;
  inicio_manual: boolean;
  apresentacoes: ApresentacaoParaCalculo[];
}

export interface EventoParaCalculo {
  horario_inicio: string;
  duracao_padrao_segundos: number;
  intervalo_entre_blocos_segundos: number;
}

export interface BlocoComHorario {
  blocoId: number;
  inicio: string;
  fim: string;
  duracaoSegundos: number;
  /** Folga desde o fim do bloco anterior. `null` no primeiro. */
  intervaloAntesSegundos: number | null;
  /**
   * `true` quando o inicio MANUAL cai antes do fim do bloco anterior.
   *
   * ⚠️ Silenciar isso faria a programacao impressa prometer duas coisas no mesmo minuto.
   * O calculo respeita o que o humano digitou — ele e que manda —, mas devolve o conflito
   * para a tela poder avisar.
   */
  conflitaComAnterior: boolean;
  apresentacoes: { id: number; inicio: string; duracaoSegundos: number }[];
}

/** 'HH:MM' / 'HH:MM:SS' -> segundos desde a meia-noite. `null` no que nao for hora. */
export function horaParaSegundos(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/** Segundos -> 'HH:MM'. Passar de 24h nao da a volta: 25:10 e mais honesto que 01:10. */
export function segundosParaHora(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${h}h` : `${h}h${String(resto).padStart(2, '0')}`;
}

/**
 * Horario de cada bloco e de cada apresentacao.
 *
 * Regra lida no prototipo do Arthur (18/09, com o navegador): Bloco 1 as 09:00 com uma
 * apresentacao de 5 min fecha 09:05, e o Bloco 2 nasce 09:50 — ou seja
 * `inicio(N+1) = fim(N) + intervalo`, com o separador "INTERVALO — 45 MINUTOS" na tela.
 * O intervalo aqui e configuravel por evento, nao constante.
 */
export function calcularHorariosDaGrade(
  evento: EventoParaCalculo,
  blocos: BlocoParaCalculo[],
): BlocoComHorario[] {
  const inicioEvento = horaParaSegundos(evento.horario_inicio) ?? 9 * 3600;
  const resultado: BlocoComHorario[] = [];
  let fimAnterior: number | null = null;

  const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem || a.id - b.id);

  for (const bloco of ordenados) {
    const manual = bloco.inicio_manual ? horaParaSegundos(bloco.horario_inicial) : null;
    // `inicio_manual` sem hora valida cai no calculado, em vez de virar NaN e contaminar
    // todos os blocos seguintes.
    const automatico =
      fimAnterior === null ? inicioEvento : fimAnterior + evento.intervalo_entre_blocos_segundos;
    const inicio = manual ?? automatico;

    let cursor = inicio;
    const apresentacoes = [...bloco.apresentacoes]
      .sort((a, b) => a.ordem - b.ordem || a.id - b.id)
      .map((ap) => {
        const duracao = ap.duracao_segundos ?? evento.duracao_padrao_segundos;
        const linha = { id: ap.id, inicio: segundosParaHora(cursor), duracaoSegundos: duracao };
        cursor += duracao;
        return linha;
      });

    resultado.push({
      blocoId: bloco.id,
      inicio: segundosParaHora(inicio),
      fim: segundosParaHora(cursor),
      duracaoSegundos: cursor - inicio,
      intervaloAntesSegundos: fimAnterior === null ? null : inicio - fimAnterior,
      conflitaComAnterior: fimAnterior !== null && inicio < fimAnterior,
      apresentacoes,
    });

    fimAnterior = cursor;
  }

  return resultado;
}

/* ─────────────────────────── alocacao na grade ─────────────────────────── */

export type SituacaoAlocacao = 'nao_se_aplica' | 'nenhuma' | 'parcial' | 'completa';

export interface ResumoAlocacao {
  situacao: SituacaoAlocacao;
  /** Texto do selo. `null` quando nao ha nada util a dizer. */
  rotulo: string | null;
  /**
   * `true` = mostrar o selo POR CURSO, na linha de cada um.
   *
   * Enquanto a pessoa nao tem nenhuma apresentacao montada — o estado de 100% da lista no
   * dia em que o evento nasce —, repetir "nao alocado" em cada curso e ruido puro: um selo
   * unico diz o mesmo. A partir do momento em que ALGUMA entra na grade, o detalhe por
   * curso passa a ser a unica forma de enxergar o que ainda falta.
   */
  detalharPorCurso: boolean;
}

/**
 * Como a aba Alunos mostra a alocacao de uma PESSOA na grade.
 *
 * ⚠️ O prototipo do Arthur resolve isso com um booleano ("Bloco 1 (Canto) • 09:00" ou
 * "Nao alocado") e e onde ele fica curto: Maria Fernanda Sellos Correa Peres faz Violao E
 * Canto, e ali aparece um "Nao alocado" so. Alocada no Violao, a tela diria
 * "Bloco 1 (Violao)" e o Canto sumiria do radar — sem nenhum aviso de que falta.
 *
 * Medido em 18/09/2026: 59 pessoas nas 3 unidades tem 2+ cursos (Barra 13, CG 22,
 * Recreio 24 — 5% a 7%), e uma de Campo Grande tem QUATRO. Pouca gente, e exatamente a
 * que o formato booleano perde.
 */
export function resumirAlocacao(cursosNoRecital: number, cursosAlocados: number): ResumoAlocacao {
  if (cursosNoRecital === 0) {
    // Quem nao tem o que apresentar nao esta "faltando ser alocado" — dizer "nao alocado"
    // aqui inventaria uma pendencia que ninguem pode resolver.
    return { situacao: 'nao_se_aplica', rotulo: null, detalharPorCurso: false };
  }
  if (cursosAlocados === 0) {
    return { situacao: 'nenhuma', rotulo: 'não alocado', detalharPorCurso: false };
  }
  if (cursosAlocados >= cursosNoRecital) {
    return {
      situacao: 'completa',
      rotulo: cursosNoRecital > 1 ? `${cursosAlocados} de ${cursosNoRecital} na grade` : 'na grade',
      detalharPorCurso: cursosNoRecital > 1,
    };
  }
  return {
    situacao: 'parcial',
    rotulo: `${cursosAlocados} de ${cursosNoRecital} na grade`,
    detalharPorCurso: true,
  };
}

/** Contagem que o topo da aba exibe. Deriva de uma passada so, sem recontar por cartao. */
export interface ResumoParticipacao {
  total: number;
  participam: number;
  indefinidos: number;
  naoParticipam: number;
  /** Soma de `cursos_no_recital` de quem participa = apresentacoes que a grade vai ter. */
  apresentacoesPrevistas: number;
  /** Quantas dessas ja estao num bloco. O que falta e `previstas - alocadas`. */
  apresentacoesAlocadas: number;
  /** Pessoas que confirmaram presenca e ainda nao entraram em bloco nenhum. */
  participamSemAlocacao: number;
}

export function resumirParticipacao(
  alunos: { status: string; cursos_no_recital: number; cursos_alocados?: number }[],
): ResumoParticipacao {
  const resumo: ResumoParticipacao = {
    total: alunos.length,
    participam: 0,
    indefinidos: 0,
    naoParticipam: 0,
    apresentacoesPrevistas: 0,
    apresentacoesAlocadas: 0,
    participamSemAlocacao: 0,
  };
  for (const a of alunos) {
    const alocados = a.cursos_alocados ?? 0;
    if (a.status === 'participa') {
      resumo.participam += 1;
      resumo.apresentacoesPrevistas += a.cursos_no_recital;
      if (alocados === 0 && a.cursos_no_recital > 0) resumo.participamSemAlocacao += 1;
    } else if (a.status === 'nao') {
      resumo.naoParticipam += 1;
    } else {
      resumo.indefinidos += 1;
    }
    // ⚠️ Conta a alocacao de QUALQUER status, nao so de quem participa: apresentacao
    // montada para alguem que depois desistiu e uma pendencia real da grade, e some da
    // conta justamente no momento em que alguem precisa remove-la.
    resumo.apresentacoesAlocadas += alocados;
  }
  return resumo;
}
