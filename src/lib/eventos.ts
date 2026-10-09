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
  /**
   * Apresentacoes com o mesmo `grupo_id` sobem JUNTAS, no mesmo numero: um horario so.
   * `null`/ausente = a apresentacao toca sozinha. Ver `agruparEmNumeros`.
   */
  grupo_id?: string | null;
}

export interface BlocoParaCalculo {
  id: number;
  ordem: number;
  /**
   * Dia em que o bloco toca ('AAAA-MM-DD'). `null`/ausente = a data do evento.
   *
   * ⚠️ Recital de varios dias (Recreio 13–15/11): blocos do MESMO dia continuam
   * encadeados, mas um dia novo NAO herda o relogio do dia anterior — a grade reabre no
   * `horario_inicio` do evento, a menos que o bloco tenha `inicio_manual`.
   */
  data?: string | null;
  /** 'HH:MM' ou 'HH:MM:SS'. So vale quando `inicio_manual` e true. */
  horario_inicial: string | null;
  inicio_manual: boolean;
  apresentacoes: ApresentacaoParaCalculo[];
}

export interface EventoParaCalculo {
  /** 'AAAA-MM-DD' — o primeiro dia do recital; data de blocos que nao dizem a propria. */
  data_evento?: string;
  horario_inicio: string;
  duracao_padrao_segundos: number;
  intervalo_entre_blocos_segundos: number;
  /** Folga entre uma apresentacao e a seguinte do MESMO bloco. Ausente = sem folga. */
  intervalo_entre_apresentacoes_segundos?: number;
}

/**
 * Sem folga entre apresentacoes do mesmo bloco (pedido do Arthur, 02/10): a troca de palco
 * entra no tempo padrao de cada apresentacao, que a unidade configura no evento. Os 5 min
 * de 25/09 sairam. Entre blocos quem manda continua sendo `intervalo_entre_blocos_segundos`.
 */
export const INTERVALO_ENTRE_APRESENTACOES_PADRAO_SEGUNDOS = 0;

export interface BlocoComHorario {
  blocoId: number;
  /** Data efetiva do bloco ('AAAA-MM-DD' ou null): a dele, ou a do evento, ou a herdada. */
  data: string | null;
  inicio: string;
  fim: string;
  duracaoSegundos: number;
  /** Folga desde o fim do bloco anterior. `null` no primeiro e ao virar o dia. */
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
 * As apresentacoes de um bloco, na ordem, reunidas em NUMEROS — o que sobe ao palco de uma vez.
 *
 * A apresentacao continua sendo o par (pessoa, curso), porque e nela que moram o certificado
 * por curso e o que o professor lanca no LA Teacher. O numero so junta quem toca junto
 * (a Ana no Violao acompanhando o Pedro no Canto): um horario, uma musica, um slot.
 *
 * ⚠️ Junta apenas VIZINHOS com o mesmo `grupo_id`. A RPC que junta coloca o novo integrante
 * logo depois do ultimo do numero, entao isso e a regra normal; se a ordem um dia ficar
 * intercalada, o numero se parte em dois slots em vez de puxar alguem de outra posicao —
 * errar mostrando dois horarios e mais honesto que reordenar a grade por conta propria.
 */
export function agruparEmNumeros<T extends { id: number; ordem: number; grupo_id?: string | null }>(
  apresentacoes: T[],
): T[][] {
  const ordenadas = [...apresentacoes].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  const numeros: T[][] = [];
  for (const ap of ordenadas) {
    const atual = numeros[numeros.length - 1];
    const grupo = ap.grupo_id ?? null;
    if (atual && grupo !== null && (atual[0].grupo_id ?? null) === grupo) atual.push(ap);
    else numeros.push([ap]);
  }
  return numeros;
}

/**
 * Move um NÚMERO (quem sobe junto vai junto) para o bloco `blocoDestinoId`, na posição
 * `indice` da lista de números desse bloco, já sem ele. Devolve os blocos com `bloco_id` e
 * `ordem` (1..n) refeitos nos blocos tocados — os demais saem idênticos (mesmo objeto).
 *
 * É a peça da prévia do arrastar (o cartão abre espaço no bloco de destino ANTES do drop) e
 * do drop no mesmo bloco: passar o índice do alvo na lista completa dá a semântica do
 * `arrayMove` (descer funciona).
 */
export function moverNumero<
  A extends { id: number; ordem: number; bloco_id: number; grupo_id?: string | null },
  B extends { id: number; apresentacoes: A[] },
>(blocos: B[], idMovido: number, blocoDestinoId: number, indice: number): B[] {
  const origem = blocos.find((b) => b.apresentacoes.some((a) => a.id === idMovido));
  const destinoBloco = blocos.find((b) => b.id === blocoDestinoId);
  if (!origem || !destinoBloco) return blocos;
  const numerosOrigem = agruparEmNumeros(origem.apresentacoes);
  const movido = numerosOrigem.find((n) => n.some((a) => a.id === idMovido));
  if (!movido) return blocos;
  const restantes = numerosOrigem.filter((n) => n !== movido);
  const destino = origem.id === blocoDestinoId ? [...restantes] : agruparEmNumeros(destinoBloco.apresentacoes);
  destino.splice(Math.max(0, Math.min(indice, destino.length)), 0, movido);
  const renumerar = (numeros: A[][], blocoId: number) =>
    numeros.flat().map((a, i) => ({ ...a, bloco_id: blocoId, ordem: i + 1 }));
  return blocos.map((b) => {
    if (b.id === blocoDestinoId) return { ...b, apresentacoes: renumerar(destino, b.id) };
    if (b.id === origem.id) return { ...b, apresentacoes: renumerar(restantes, b.id) };
    return b;
  });
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
  const intervaloApresentacoes =
    evento.intervalo_entre_apresentacoes_segundos ?? INTERVALO_ENTRE_APRESENTACOES_PADRAO_SEGUNDOS;

  const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  let dataAnterior: string | null = null;

  for (const bloco of ordenados) {
    const manual = bloco.inicio_manual ? horaParaSegundos(bloco.horario_inicial) : null;
    // A data efetiva do bloco: a dele quando declarada; a do bloco anterior enquanto
    // ninguem disse outro dia; a do evento no primeiro de todos.
    const data = bloco.data ?? dataAnterior ?? evento.data_evento ?? null;
    const virouODia = dataAnterior !== null && data !== null && data !== dataAnterior;
    // `inicio_manual` sem hora valida cai no calculado, em vez de virar NaN e contaminar
    // todos os blocos seguintes. Num dia novo, o calculado e a reabertura da casa — um
    // bloco de sabado nao comeca "45 min depois de sexta acabar".
    const automatico =
      fimAnterior === null || virouODia
        ? inicioEvento
        : fimAnterior + evento.intervalo_entre_blocos_segundos;
    const inicio = manual ?? automatico;

    let cursor = inicio;
    // O slot e do NUMERO: quem toca junto comeca no mesmo minuto, e a troca de palco so
    // existe entre um numero e o seguinte. O numero dura o maior dos integrantes — a musica
    // e uma so, e o cartao grava a mesma duracao em todos; o maximo so decide se alguem
    // divergir (o sync do LA Teacher pode trazer outra duracao para um dos alunos).
    const apresentacoes = agruparEmNumeros(bloco.apresentacoes).flatMap((numero, i) => {
      if (i > 0) cursor += intervaloApresentacoes;
      const duracao = Math.max(
        ...numero.map((ap) => ap.duracao_segundos ?? evento.duracao_padrao_segundos),
      );
      const linhas = numero.map((ap) => ({
        id: ap.id,
        inicio: segundosParaHora(cursor),
        duracaoSegundos: duracao,
      }));
      cursor += duracao;
      return linhas;
    });

    resultado.push({
      blocoId: bloco.id,
      data,
      inicio: segundosParaHora(inicio),
      fim: segundosParaHora(cursor),
      duracaoSegundos: cursor - inicio,
      intervaloAntesSegundos:
        fimAnterior === null || virouODia ? null : inicio - fimAnterior,
      // Conflito de horario so existe DENTRO do mesmo dia: bloco de outro dia comeca
      // depois por definicao, ainda que o relogio marque um numero menor.
      conflitaComAnterior: !virouODia && fimAnterior !== null && inicio < fimAnterior,
      apresentacoes,
    });

    fimAnterior = cursor;
    dataAnterior = data;
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
  /** Soma dos convidados informados POR QUEM PARTICIPA — a conta de cadeiras do recital. */
  convidadosTotal: number;
}

export function resumirParticipacao(
  alunos: {
    status: string;
    cursos_no_recital: number;
    cursos_alocados?: number;
    convidados?: number;
  }[],
): ResumoParticipacao {
  const resumo: ResumoParticipacao = {
    total: alunos.length,
    participam: 0,
    indefinidos: 0,
    naoParticipam: 0,
    apresentacoesPrevistas: 0,
    apresentacoesAlocadas: 0,
    participamSemAlocacao: 0,
    convidadosTotal: 0,
  };
  for (const a of alunos) {
    const alocados = a.cursos_alocados ?? 0;
    if (a.status === 'participa') {
      resumo.participam += 1;
      resumo.apresentacoesPrevistas += a.cursos_no_recital;
      resumo.convidadosTotal += a.convidados ?? 0;
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

/* ─────────────────────────────── palco ─────────────────────────────── */

export type TipoItemDePalco = 'instrumento' | 'equipamento';

export interface ItemDePalco {
  tipo: TipoItemDePalco;
  nome: string;
  quantidade: number;
}

/**
 * Chave de agrupamento de um item de palco.
 *
 * Existe porque o nome e DIGITADO A MAO, uma vez por apresentacao: em 270 apresentacoes,
 * "Violao", "violão" e "VIOLÃO " sao a mesma coisa para quem monta o palco e tres linhas
 * diferentes para um `Map`. Sem isso a lista de palco sai com o mesmo instrumento repetido
 * e ninguem consegue somar nada.
 *
 * ⚠️ Normaliza para COMPARAR, nunca para EXIBIR — a mesma regra do telefone em
 * `fn_normalizar_telefone_br_key`, que descarta o 9o digito e produz um numero que ninguem
 * reconhece. Quem sai na tela e a grafia que a pessoa escreveu (ver `consolidarItensDoPalco`).
 *
 * ⚠️ Nao mexe em plural nem em sinonimo de proposito: "Violao" e "Violoes" podem ser
 * pedidos legitimamente diferentes (um ou varios), e "Cubo" x "Amplificador" so a equipe
 * sabe se e a mesma coisa. Colapsar por conta propria inventaria dado.
 */
export function chaveDoItem(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Instrumento antes de equipamento: e a ordem em que o palco e montado. */
const PESO_DO_TIPO: Record<TipoItemDePalco, number> = {
  instrumento: 0,
  equipamento: 1,
};

/**
 * Curso -> objeto que sobe no palco.
 *
 * Numa escola de musica o instrumento E o curso: o aluno de Violao toca violao, e pedir que
 * alguem digite "Violao" numa apresentacao de Violao e redigitar o que a grade ja sabe.
 *
 * ⚠️ Nem todo curso vira objeto, e e por isso que existe uma LISTA em vez de `curso.nome`
 * direto. Medido nos 43 cursos do banco em 19/09/2026: **Canto e o 2o maior (233 matriculas
 * ativas)** e nao e instrumento nenhum — quem canta precisa de microfone, que e equipamento
 * e nao se deduz do curso. Musicalizacao (3 cursos, 132 matriculas), Harmonia, Teoria
 * Musical e Home Studio tambem nao colocam objeto no palco.
 *
 * ⚠️ O sufixo " IND" e MODALIDADE (aula individual), nao outro instrumento: `Violao` e
 * `Violao IND` sao o mesmo objeto. Mesma familia do `tipo` da Agenda, que descrevia
 * contagem de contratos e era lido como modalidade.
 *
 * Curso de banda nao aparece aqui de proposito — banda nao entra na grade do recital
 * (decisao do Arthur), entao nunca chega a ter apresentacao.
 */
const INSTRUMENTO_POR_CURSO: Record<string, string> = {
  bateria: 'Bateria',
  teclado: 'Teclado',
  guitarra: 'Guitarra',
  violao: 'Violão',
  piano: 'Piano',
  violino: 'Violino',
  contrabaixo: 'Contrabaixo',
  ukulele: 'Ukulelê',
  cavaquinho: 'Cavaquinho',
  sax: 'Saxofone',
  'flauta doce': 'Flauta doce',
  'flauta transversa': 'Flauta transversa',
};

/**
 * O objeto de palco que o curso implica, ou `null` quando o curso nao coloca objeto nenhum.
 *
 * ⚠️ Curso desconhecido devolve `null`, NUNCA o proprio nome do curso. A direcao do erro e
 * deliberada: faltar o item e omissao — a pessoa ve a lista curta e digita — enquanto
 * inventar "Canto" ou "Teatro Musical" na lista de montagem e comissao, entra na lista e
 * ninguem percebe. Um curso novo (um "Saxofone" cadastrado amanha) cai aqui e so precisa de
 * uma linha no mapa acima.
 */
export function instrumentoDoCurso(cursoNome: string | null | undefined): string | null {
  if (!cursoNome) return null;
  const chave = chaveDoItem(cursoNome).replace(/\s+ind$/, '');
  return INSTRUMENTO_POR_CURSO[chave] ?? null;
}

/**
 * Curso de musicalização (Bebês, Infantil, Preparatória) × curso de instrumento.
 *
 * Serve ao filtro do seletor da Grade: o recital pode ter bloco só de instrumento (pedido do
 * Arthur, 06/10). Não existe categoria no cadastro de `cursos`, então a régua é o nome — curso
 * novo chamado "Musicalização …" entra sozinho.
 */
export function ehMusicalizacao(cursoNome: string | null | undefined): boolean {
  return !!cursoNome && chaveDoItem(cursoNome).startsWith('musicaliza');
}

export interface ItemConsolidado {
  tipo: TipoItemDePalco;
  /** A grafia mais usada entre as variantes agrupadas — nunca a chave normalizada. */
  nome: string;
  /** Quantos precisam estar no palco. Ver a regra de decisao em `consolidarItensDoPalco`. */
  quantidade: number;
  /** Em quantas apresentacoes o item aparece. E o que distingue "reveza" de "simultaneo". */
  apresentacoes: number;
  /**
   * `true` = saiu do CURSO, ninguem digitou.
   *
   * A tela marca esses de outro jeito para a diferenca ficar visivel: item derivado some
   * sozinho se a apresentacao sair do bloco, e item digitado e uma decisao de alguem.
   */
  doCurso: boolean;
}

/** Uma apresentacao para efeito de palco: o curso dela mais o que foi pedido a mao. */
export interface ApresentacaoParaPalco {
  cursoNome: string | null;
  itens: ItemDePalco[];
  /**
   * Quem sobe JUNTO neste numero, cada um com o seu curso e o seu pedido.
   *
   * Ausente = a entrada e uma apresentacao sozinha, descrita por `cursoNome`/`itens`.
   * Presente = a entrada e um NUMERO, e esses campos de cima sao ignorados.
   *
   * ⚠️ Os integrantes tocam AO MESMO TEMPO, o contrario das apresentacoes do bloco, que se
   * revezam. Por isso eles entram numa unica entrada: dois alunos de Violao no mesmo numero
   * precisam de 2 violoes no palco, e duas apresentacoes de Violao seguidas, de 1.
   */
  integrantes?: { cursoNome: string | null; itens: ItemDePalco[] }[];
}

/**
 * As entradas de palco de um conjunto de apresentacoes, uma por NUMERO.
 *
 * E o que todo consumidor deve usar para montar a entrada de `consolidarItensDoPalco` — a grade,
 * a aba Palco e a folha impressa. Montar cada um a sua maneira faria o mesmo numero pedir dois
 * violoes numa tela e um na outra.
 */
export function palcoDosNumeros(
  apresentacoes: {
    id: number;
    ordem: number;
    grupo_id?: string | null;
    curso_nome: string | null;
    itens: ItemDePalco[];
  }[],
): ApresentacaoParaPalco[] {
  return agruparEmNumeros(apresentacoes).map((numero) =>
    numero.length === 1
      ? { cursoNome: numero[0].curso_nome, itens: numero[0].itens }
      : {
          cursoNome: numero[0].curso_nome,
          itens: [],
          integrantes: numero.map((ap) => ({ cursoNome: ap.curso_nome, itens: ap.itens })),
        },
  );
}

/**
 * O que precisa estar no palco, a partir de varias apresentacoes.
 *
 * ⚠️ A entrada e POR APRESENTACAO, nao uma lista achatada, e isso e deliberado: uma vez
 * achatada, some a informacao de quem toca JUNTO — e e ela que decide se tres pedidos de
 * "1 violao" viram 3 violoes no palco ou 1 que se reveza. Achatar na entrada tornaria a
 * pergunta impossivel de responder aqui dentro.
 *
 * O instrumento do curso entra automaticamente (ver `instrumentoDoCurso`) e se funde com o
 * digitado quando forem o mesmo objeto — quem escrever "Violão" numa apresentacao de Violao
 * nao produz duas linhas.
 */
export function consolidarItensDoPalco(
  porApresentacao: ApresentacaoParaPalco[],
): ItemConsolidado[] {
  type Acumulado = {
    tipo: TipoItemDePalco;
    grafias: Map<string, number>;
    apresentacoes: number;
    /** Maior quantidade pedida por UMA apresentacao. */
    picoPorApresentacao: number;
    /** Soma de todos os pedidos. */
    soma: number;
    /** So continua `true` se NINGUEM digitou este item em apresentacao nenhuma. */
    doCurso: boolean;
  };

  const porChave = new Map<string, Acumulado>();

  for (const apresentacao of porApresentacao) {
    // Um numero com varios integrantes vira UMA entrada: o que cada um pede e somado, porque
    // eles tocam ao mesmo tempo. Sem integrantes, a entrada e a propria apresentacao.
    const partes = apresentacao.integrantes?.length
      ? apresentacao.integrantes
      : [{ cursoNome: apresentacao.cursoNome, itens: apresentacao.itens }];

    // O que alguem escreveu, por chave, em QUALQUER integrante. Serve para marcar a origem.
    // ⚠️ A origem NAO pode ser inferida comparando a chave com a derivada: quem digita
    // "Violão" numa apresentacao de Violao cai na mesma chave, e o item apareceria como
    // automatico apesar de alguem ter escolhido.
    const chavesDigitadas = new Set<string>();
    const itens: ItemDePalco[] = [];
    for (const parte of partes) {
      const digitadasDaParte = new Set(parte.itens.map((i) => `${i.tipo}|${chaveDoItem(i.nome)}`));
      for (const chave of digitadasDaParte) chavesDigitadas.add(chave);

      // ⚠️ O derivado so entra se ESTE integrante nao digitou o mesmo objeto. Injetar sempre
      // somaria: o aluno de Violao que escreveu "Violão" a mao pediu UM violao, e a conta
      // devolveria dois. Quando os dois existem, vence o digitado — ele pode trazer
      // quantidade (dueto) e observacao que o curso nao tem como saber. A decisao e por
      // integrante: se a Ana digitou "Violão", o violao do Joao, no mesmo numero, continua.
      const derivado = instrumentoDoCurso(parte.cursoNome);
      if (derivado && !digitadasDaParte.has(`instrumento|${chaveDoItem(derivado)}`)) {
        itens.push({ tipo: 'instrumento', nome: derivado, quantidade: 1 });
      }
      itens.push(...parte.itens);
    }

    // Uma apresentacao que pede o mesmo item em duas linhas conta como UMA apresentacao,
    // com a soma das duas linhas — senao "2 estantes" viraria pico 1 por ser digitado duas
    // vezes com quantidade 1.
    const nestaApresentacao = new Map<string, number>();
    for (const item of itens) {
      const chave = `${item.tipo}|${chaveDoItem(item.nome)}`;
      const nome = item.nome.trim();
      if (nome === '') continue;

      const qtd = Number.isFinite(item.quantidade) && item.quantidade > 0 ? item.quantidade : 1;
      nestaApresentacao.set(chave, (nestaApresentacao.get(chave) ?? 0) + qtd);

      const atual = porChave.get(chave) ?? {
        tipo: item.tipo,
        grafias: new Map<string, number>(),
        apresentacoes: 0,
        picoPorApresentacao: 0,
        soma: 0,
        doCurso: true,
      };
      atual.grafias.set(nome, (atual.grafias.get(nome) ?? 0) + 1);
      // Basta UMA apresentacao ter digitado para o item deixar de ser "so do curso": a
      // etiqueta nao pode dizer que ninguem escolheu aquilo quando alguem escolheu.
      if (chavesDigitadas.has(chave)) atual.doCurso = false;
      porChave.set(chave, atual);
    }

    for (const [chave, qtd] of nestaApresentacao) {
      const acc = porChave.get(chave)!;
      acc.apresentacoes += 1;
      acc.soma += qtd;
      acc.picoPorApresentacao = Math.max(acc.picoPorApresentacao, qtd);
    }
  }

  return [...porChave.values()]
    .map((acc) => {
      // A grafia que sai na tela e a mais frequente; empate resolve pela ordem alfabetica
      // para a lista nao trocar de nome a cada carregamento (mesma armadilha do contato da
      // comunidade WA, que mudava de numero sem ORDER BY).
      const nome = [...acc.grafias.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'),
      )[0][0];

      // QUANTOS precisam estar no palco = o PICO de uma apresentacao, nunca a soma.
      //
      // As apresentacoes de um bloco sao SEQUENCIAIS — e a propria grade que garante isso,
      // encadeando uma depois da outra. Entao o item se reveza: seis apresentacoes pedindo
      // "1 violao" precisam de 1 violao no palco, nao de 6. Somar faria a coordenacao levar
      // seis, e o erro cresce com o tamanho do bloco, que e justamente quando ele importa.
      //
      // O caso que decide entre as duas leituras e o dueto: uma apresentacao pedindo
      // 2 estantes num bloco onde outras cinco pedem 1 devolve 2 (o palco precisa de 2 ao
      // mesmo tempo), contra 7 da soma.
      //
      // ⚠️ Nao e "quantos pedidos existem" — essa pergunta e outra, e quem responde e
      // `apresentacoes`, exibido no title da etiqueta. As duas convivem de proposito: uma
      // diz o que montar, a outra diz quantas vezes sera usado.
      const quantidade = Math.max(1, acc.picoPorApresentacao);

      return {
        tipo: acc.tipo,
        nome,
        quantidade,
        apresentacoes: acc.apresentacoes,
        doCurso: acc.doCurso,
      };
    })
    .sort(
      (a, b) =>
        // ⚠️ Peso explicito, NAO `localeCompare` do tipo: alfabeticamente "equipamento" vem
        // antes de "instrumento" (e < i), o contrario do que a ordem de montagem pede.
        PESO_DO_TIPO[a.tipo] - PESO_DO_TIPO[b.tipo] ||
        // Depois, o que aparece em mais apresentacoes — e o que a equipe vai buscar primeiro.
        b.apresentacoes - a.apresentacoes ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}


/**
 * Frase curta do palco de UMA apresentacao, para o cartao fechado da grade.
 *
 * Devolve `null` quando nao ha nada a dizer — o estado de quase toda apresentacao —, para o
 * cartao nao carregar uma linha vazia. Playback entra aqui porque e a informacao que a
 * operacao de som precisa e que nao esta em item nenhum.
 */
export function resumirPalcoDaApresentacao(
  itens: ItemDePalco[],
  temPlayback: boolean,
  temObservacao: boolean,
): string | null {
  const partes: string[] = [];
  const instrumentos = itens.filter((i) => i.tipo === 'instrumento').length;
  const equipamentos = itens.filter((i) => i.tipo === 'equipamento').length;

  if (instrumentos > 0) partes.push(`${instrumentos} instrumento${instrumentos > 1 ? 's' : ''}`);
  if (equipamentos > 0) partes.push(`${equipamentos} equipamento${equipamentos > 1 ? 's' : ''}`);
  if (temPlayback) partes.push('playback');
  if (temObservacao) partes.push('mapa');

  return partes.length === 0 ? null : partes.join(' · ');
}

/* ─────────────────────────── revisao do evento ─────────────────────────── */

/**
 * `impede` = a programacao nao deveria ser impressa assim; `atencao` = trabalho que falta,
 * mas o recital acontece.
 *
 * ⚠️ E UM valor, nunca um conjunto de flags — mesma razao de `SituacaoPalco`: gravidade
 * derivada de condicoes soltas ja pintou cartao contradizendo o proprio rotulo na Agenda.
 */
export type GravidadePendencia = 'impede' | 'atencao';

export interface Pendencia {
  tipo: string;
  gravidade: GravidadePendencia;
  /** Uma frase com o NUMERO, porque e por ele que se decide o que atacar primeiro. */
  titulo: string;
  /** Por que isso importa. Sem o porque, a lista vira burocracia que se aprende a ignorar. */
  detalhe: string;
  /** Quem esta afetado, na ordem em que a pessoa vai procurar. */
  itens: string[];
  /** Onde se resolve. Pendencia que nao diz onde agir custa uma caca ao tesouro. */
  onde: 'alunos' | 'grade';
}

export interface EntradaDaRevisao {
  evento: EventoParaCalculo;
  blocos: (BlocoParaCalculo & {
    nome: string;
    apresentacoes: {
      id: number;
      ordem: number;
      duracao_segundos: number | null;
      pessoa_chave: string;
      aluno_nome: string;
      curso_nome: string | null;
      musica: string | null;
      grupo_id?: string | null;
    }[];
  })[];
  alunos: {
    pessoa_chave: string;
    nome: string;
    status: string;
    cursos_no_recital: number;
    cursos: { curso_id: number; curso_nome: string | null }[];
    alocacoes: { curso_id: number }[];
  }[];
  /**
   * Relatorios que o professor ja lancou no LA Teacher (linhas de `evento_relatorios_v1`).
   * Opcional porque a revisao funciona sem eles — so o cruzamento novo fica desligado.
   */
  relatorios?: {
    aluno_nome: string | null;
    curso: string;
    professor_nome: string | null;
    apresentacao_id: number | null;
  }[];
}

const ordenarNomes = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

/**
 * Horario limite RECOMENDADO de termino do recital.
 *
 * Nao e regra minha: e uma das cinco "REGRAS FUNDAMENTAIS" escritas no prototipo do Arthur
 * (`const MAX_FINISH_MINUTES = 22 * 60; // 22:00 = 1320 min`), com banner proprio na tela
 * dele — "A programacao ultrapassa o horario limite recomendado (22:00). Considere remanejar
 * blocos ou dividir as apresentacoes."
 *
 * ⚠️ RECOMENDADO, nao proibido: entra como `atencao`, nunca como impedimento. Quem decide
 * esticar o recital e a coordenacao, nao o sistema.
 */
export const LIMITE_TERMINO_SEGUNDOS = 22 * 3600;

/**
 * O que ainda falta antes do recital, em ordem de gravidade.
 *
 * Os sinais ja existiam espalhados — o contador "N de quem participa ainda fora" no topo da
 * grade, o selo vermelho de conflito no bloco. Aqui eles viram UMA lista, que e o que
 * permite responder "posso imprimir?" sem varrer a tela inteira.
 *
 * ⚠️ Lista vazia significa "nada a apontar", nunca "esta tudo certo": esta funcao so enxerga
 * o que o sistema sabe. Ninguem aqui verifica se o aluno ensaiou.
 */
export function levantarPendencias(entrada: EntradaDaRevisao): Pendencia[] {
  const pendencias: Pendencia[] = [];
  const statusPorPessoa = new Map(entrada.alunos.map((a) => [a.pessoa_chave, a.status]));
  const horarios = calcularHorariosDaGrade(entrada.evento, entrada.blocos);

  const todasApresentacoes = entrada.blocos.flatMap((b) =>
    b.apresentacoes.map((a) => ({ ...a, blocoNome: b.nome })),
  );

  /* ── impede ── */

  // 1. Gente na grade que declarou que NAO vem. O pior caso possivel: a programacao
  //    impressa anuncia um numero que nao vai acontecer, e o nome esta la para todo mundo
  //    ver. Vem primeiro porque e o unico erro que o publico percebe.
  const desistentes = todasApresentacoes
    .filter((a) => statusPorPessoa.get(a.pessoa_chave) === 'nao')
    .map((a) => `${a.aluno_nome} — ${a.curso_nome ?? 'curso'} (${a.blocoNome})`)
    .sort(ordenarNomes);
  if (desistentes.length > 0) {
    pendencias.push({
      tipo: 'na_grade_mas_nao_participa',
      gravidade: 'impede',
      titulo:
        desistentes.length === 1
          ? '1 apresentação de quem marcou "não participa"'
          : `${desistentes.length} apresentações de quem marcou "não participa"`,
      detalhe:
        'A pessoa avisou que não vem e continua na grade. Imprimir assim anuncia um número que não vai acontecer.',
      itens: desistentes,
      onde: 'grade',
    });
  }

  // 2. Bloco que comeca antes de o anterior terminar. So acontece com horario digitado a
  //    mao — o encadeamento automatico nunca produz isso.
  const conflitos = horarios
    .filter((h) => h.conflitaComAnterior)
    .map((h) => {
      const bloco = entrada.blocos.find((b) => b.id === h.blocoId);
      return `${bloco?.nome ?? 'Bloco'} começa ${h.inicio}, antes de o anterior terminar`;
    });
  if (conflitos.length > 0) {
    pendencias.push({
      tipo: 'conflito_de_horario',
      gravidade: 'impede',
      titulo:
        conflitos.length === 1
          ? '1 bloco com horário sobreposto'
          : `${conflitos.length} blocos com horário sobreposto`,
      detalhe:
        'Um horário digitado à mão cai antes do fim do bloco anterior. Apagar o campo devolve o bloco ao encadeamento automático.',
      itens: conflitos,
      onde: 'grade',
    });
  }

  /* ── atencao ── */

  // 3. Confirmou e nao esta na grade. E o buraco mais comum, e o unico que some sozinho
  //    conforme a montagem avanca — por isso atencao, nao impedimento.
  const foraDaGrade: string[] = [];
  for (const aluno of entrada.alunos) {
    if (aluno.status !== 'participa') continue;
    const alocados = new Set(aluno.alocacoes.map((x) => x.curso_id));
    for (const curso of aluno.cursos) {
      if (!alocados.has(curso.curso_id)) {
        foraDaGrade.push(`${aluno.nome} — ${curso.curso_nome ?? 'curso'}`);
      }
    }
  }
  foraDaGrade.sort(ordenarNomes);
  if (foraDaGrade.length > 0) {
    pendencias.push({
      tipo: 'confirmado_fora_da_grade',
      gravidade: 'atencao',
      titulo:
        foraDaGrade.length === 1
          ? '1 apresentação confirmada ainda fora da grade'
          : `${foraDaGrade.length} apresentações confirmadas ainda fora da grade`,
      detalhe:
        'Quem confirmou participação e não entrou em bloco nenhum. Cada curso conta separado: quem faz dois se apresenta duas vezes.',
      itens: foraDaGrade,
      onde: 'grade',
    });
  }

  // 4. Indefinidos. ⚠️ A gravidade NAO depende da proximidade da data, de proposito: a
  //    funcao nao recebe "hoje", entao a mesma grade revisada em dois dias diferentes
  //    devolve a mesma lista. Regra que muda sozinha com o relogio apodrece — e o motivo de
  //    a idade do perfil de temperamento ser medida na data da anamnese, nunca em now().
  const indefinidos = entrada.alunos
    .filter((a) => a.status === 'indefinido' && a.cursos_no_recital > 0)
    .map((a) => a.nome)
    .sort(ordenarNomes);
  if (indefinidos.length > 0) {
    pendencias.push({
      tipo: 'participacao_indefinida',
      gravidade: 'atencao',
      titulo:
        indefinidos.length === 1
          ? '1 pessoa sem resposta sobre participar'
          : `${indefinidos.length} pessoas sem resposta sobre participar`,
      detalhe:
        'Ninguém marcou se participa ou não. Enquanto estiver assim, ela não conta como pendência da grade nem sai da lista.',
      itens: indefinidos,
      onde: 'alunos',
    });
  }

  // 5. Apresentacao sem musica. A programacao impressa sai com o nome e uma lacuna.
  const semMusica = todasApresentacoes
    .filter((a) => (a.musica ?? '').trim() === '')
    .map((a) => `${a.aluno_nome} — ${a.curso_nome ?? 'curso'} (${a.blocoNome})`)
    .sort(ordenarNomes);
  if (semMusica.length > 0) {
    pendencias.push({
      tipo: 'apresentacao_sem_musica',
      gravidade: 'atencao',
      titulo:
        semMusica.length === 1
          ? '1 apresentação sem música definida'
          : `${semMusica.length} apresentações sem música definida`,
      detalhe: 'A programação impressa sai com o nome do aluno e uma lacuna no lugar da música.',
      itens: semMusica,
      onde: 'grade',
    });
  }

  // 6. Termino depois das 22:00 — regra fundamental do prototipo do Arthur.
  const fim = horarios.length > 0 ? horarios[horarios.length - 1].fim : null;
  const fimSegundos = horaParaSegundos(fim);
  if (fimSegundos !== null && fimSegundos > LIMITE_TERMINO_SEGUNDOS) {
    pendencias.push({
      tipo: 'termino_apos_limite',
      gravidade: 'atencao',
      titulo: `A programação termina ${fim}, depois das 22:00`,
      detalhe:
        'Passa do horário limite recomendado. Considere remanejar blocos, dividir as apresentações ou adiantar o início.',
      // O item repete o horario de proposito: quem le so a lista de itens, sem o titulo,
      // continua sabendo do que se trata.
      itens: [`Término estimado: ${fim}`],
      onde: 'grade',
    });
  }

  // 7. Relatorio lancado no LA Teacher para alguem FORA da grade. O professor fez a parte
  //    dele; o buraco e daqui — a apresentacao nao foi montada (ou o aluno nao foi marcado
  //    como participante).
  const semApresentacao = (entrada.relatorios ?? [])
    .filter((r) => r.apresentacao_id === null)
    .map(
      (r) =>
        `${r.aluno_nome ?? 'aluno'} — ${r.curso}` +
        (r.professor_nome ? ` (Prof. ${r.professor_nome})` : ''),
    )
    .sort(ordenarNomes);
  if (semApresentacao.length > 0) {
    pendencias.push({
      tipo: 'relatorio_sem_apresentacao',
      gravidade: 'atencao',
      titulo:
        semApresentacao.length === 1
          ? '1 relatório lançado para aluno fora da grade'
          : `${semApresentacao.length} relatórios lançados para alunos fora da grade`,
      detalhe:
        'O professor já lançou a música no LA Teacher, mas não existe apresentação desse curso para essa pessoa na grade. Montar a apresentação destrava o canal.',
      itens: semApresentacao,
      onde: 'grade',
    });
  }

  // 8. Bloco vazio. Ocupa lugar na ordem e no calculo do intervalo sem nada dentro.
  const vazios = entrada.blocos.filter((b) => b.apresentacoes.length === 0).map((b) => b.nome);
  if (vazios.length > 0) {
    pendencias.push({
      tipo: 'bloco_vazio',
      gravidade: 'atencao',
      titulo:
        vazios.length === 1 ? '1 bloco sem apresentação' : `${vazios.length} blocos sem apresentação`,
      detalhe: 'Bloco vazio ocupa lugar na ordem e some da programação impressa.',
      itens: vazios,
      onde: 'grade',
    });
  }

  // `impede` sempre no topo; dentro do mesmo nivel, a ordem de insercao acima e a ordem de
  // ataque pretendida, entao o sort tem de ser ESTAVEL (o do V8 e, desde o ES2019).
  return pendencias.sort(
    (a, b) => Number(a.gravidade === 'atencao') - Number(b.gravidade === 'atencao'),
  );
}

/* ─────────────────────── check-in (o dia do recital) ─────────────────────── */

/**
 * ⚠️ O check-in e da PESSOA, nunca da apresentacao.
 *
 * Quem faz Violao e Canto sobe ao palco duas vezes e chega ao teatro UMA. Guardar a chegada
 * por apresentacao produziria duas respostas possiveis para "o Joao chegou?" — e a segunda
 * seria escrita por quem marcasse a segunda apresentacao, horas depois. Por isso `checkin_em`
 * mora em `evento_participacao`, cuja UNIQUE e `(evento_id, pessoa_chave)`.
 *
 * A consequencia aparece na tela: marcar a chegada numa linha acende TODAS as linhas daquela
 * pessoa, e a lista diz isso em vez de deixar a coordenacao descobrir sozinha.
 */
export interface ApresentacaoParaChegada {
  id: number;
  ordem: number;
  duracao_segundos: number | null;
  pessoa_chave: string;
  aluno_id: number;
  aluno_nome: string;
  curso_nome: string | null;
  musica: string | null;
  /** Mesmo `grupo_id` = sobem juntos no mesmo numero (mesma posicao e mesmo horario). */
  grupo_id?: string | null;
}

export interface ParticipacaoParaChegada {
  pessoa_chave: string;
  nome: string;
  status: string;
  /** ISO do momento da chegada. `null` = ainda nao chegou (ou ninguem marcou). */
  checkin_em: string | null;
  aluno_id: number;
}

export interface EntradaDaChegada {
  evento: EventoParaCalculo;
  blocos: (BlocoParaCalculo & { nome: string; apresentacoes: ApresentacaoParaChegada[] })[];
  participacoes: ParticipacaoParaChegada[];
}

/** Uma apresentacao na ordem do recital, do ponto de vista de quem opera o dia. */
export interface LinhaDaChegada {
  apresentacaoId: number;
  pessoaChave: string;
  alunoId: number;
  alunoNome: string;
  cursoNome: string | null;
  musica: string | null;
  blocoId: number;
  blocoNome: string;
  /** Horario PREVISTO, calculado da grade. O recital atrasa; isto nao e o relogio. */
  horario: string;
  /** 1..N na ordem do recital inteiro — e o numero que o mestre de cerimonias anuncia. */
  posicao: number;
  chegouEm: string | null;
  /** Participacao declarada. 'nao' aqui e o caso que a Revisao acusa como impedimento. */
  status: string;
  /** Quantas OUTRAS apresentacoes a mesma pessoa tem. > 0 = um check-in vale para todas. */
  outrasApresentacoes: number;
}

export interface PessoaNaChegada {
  pessoaChave: string;
  alunoId: number;
  nome: string;
  status: string;
  chegouEm: string | null;
  /** Vazio = confirmou presenca e nao entrou em bloco nenhum. Ela vem ao evento assim mesmo. */
  apresentacoes: {
    apresentacaoId: number;
    blocoNome: string;
    horario: string;
    cursoNome: string | null;
    /** Carregada ate aqui porque o CERTIFICADO a imprime — a porta nao a usa. */
    musica: string | null;
  }[];
}

export interface ResumoDaChegada {
  /** Pessoas que devem aparecer no dia. Ver a regra em `montarListaDeChegada`. */
  esperados: number;
  chegaram: number;
  faltam: number;
  /** Apresentacoes cuja pessoa ainda nao chegou — o que o mestre de cerimonias precisa saber. */
  apresentacoesSemChegada: number;
  apresentacoes: number;
}

/**
 * O check-in de UM bloco — o recorte com que o recital e de fato operado.
 *
 * ⚠️ O bloco tem contagem PROPRIA e ela nao e um pedaco do total: quem toca em dois blocos
 * conta nos dois, porque cada um precisa saber se a pessoa dele esta no teatro. Somar os
 * `esperados` dos blocos NAO devolve o `esperados` geral, e isso e a resposta certa para
 * duas perguntas diferentes — o total pergunta "quantas pessoas esperamos hoje", o bloco
 * pergunta "quem tem de estar aqui agora".
 */
export interface BlocoDaChegada {
  blocoId: number;
  nome: string;
  ordem: number;
  /** Horario previsto de inicio do bloco, calculado da grade. */
  inicio: string;
  linhas: LinhaDaChegada[];
  /** Pessoas DISTINTAS deste bloco — quem toca duas vezes nele conta uma. */
  pessoas: number;
  chegaram: number;
  faltam: number;
}

export interface ListaDeChegada {
  /** Uma linha por apresentacao, na ordem do recital: a visao do palco. */
  ordem: LinhaDaChegada[];
  /** A mesma ordem, cortada por bloco, com contagem propria de cada um. */
  blocos: BlocoDaChegada[];
  /** Uma linha por pessoa, em ordem alfabetica: a visao da porta. */
  pessoas: PessoaNaChegada[];
  resumo: ResumoDaChegada;
}

/**
 * A lista do dia, nas duas visoes que o recital precisa ao mesmo tempo.
 *
 * Quem esta na porta procura por NOME e marca a chegada; quem esta na coxia acompanha a
 * ORDEM e precisa saber se o proximo ja chegou. E a mesma informacao lida por dois caminhos,
 * e por isso sai das duas formas de uma passada so — recalcular no componente faria a
 * contagem do topo divergir da lista de baixo no primeiro ajuste.
 *
 * ⚠️ Nao recebe "agora" de proposito. O horario aqui e o PREVISTO da grade, e recital atrasa:
 * destacar "a apresentacao atual" pelo relogio anunciaria a pessoa errada com a confianca de
 * um sistema. Quem sabe onde o recital esta e quem esta na sala.
 */
export function montarListaDeChegada(entrada: EntradaDaChegada): ListaDeChegada {
  const horarios = calcularHorariosDaGrade(entrada.evento, entrada.blocos);
  const horarioPorApresentacao = new Map<number, string>();
  for (const bloco of horarios) {
    for (const ap of bloco.apresentacoes) horarioPorApresentacao.set(ap.id, ap.inicio);
  }

  const porChave = new Map<string, ParticipacaoParaChegada>(
    entrada.participacoes.map((p) => [p.pessoa_chave, p]),
  );

  // Conta quantas vezes cada pessoa sobe ao palco, ANTES de montar as linhas: e o que
  // permite cada linha dizer "esta pessoa se apresenta mais uma vez".
  const vezesPorPessoa = new Map<string, number>();
  for (const bloco of entrada.blocos) {
    for (const ap of bloco.apresentacoes) {
      vezesPorPessoa.set(ap.pessoa_chave, (vezesPorPessoa.get(ap.pessoa_chave) ?? 0) + 1);
    }
  }

  const blocosOrdenados = [...entrada.blocos].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
  const ordem: LinhaDaChegada[] = [];
  const apresentacoesPorPessoa = new Map<string, PessoaNaChegada['apresentacoes']>();

  let posicao = 0;
  for (const bloco of blocosOrdenados) {
    // A posicao conta NUMEROS, nao apresentacoes: quem sobe junto e anunciado junto, e dar
    // dois numeros ao mesmo momento do palco faria a coxia chamar a Ana e o Pedro em sequencia.
    const apresentacoes = agruparEmNumeros(bloco.apresentacoes).flatMap((numero) => {
      posicao += 1;
      return numero.map((ap) => ({ ap, posicaoDoNumero: posicao }));
    });
    for (const { ap, posicaoDoNumero } of apresentacoes) {
      const participacao = porChave.get(ap.pessoa_chave);
      const horario = horarioPorApresentacao.get(ap.id) ?? '';

      ordem.push({
        apresentacaoId: ap.id,
        pessoaChave: ap.pessoa_chave,
        alunoId: ap.aluno_id,
        alunoNome: ap.aluno_nome,
        cursoNome: ap.curso_nome,
        musica: ap.musica,
        blocoId: bloco.id,
        blocoNome: bloco.nome,
        horario,
        posicao: posicaoDoNumero,
        chegouEm: participacao?.checkin_em ?? null,
        // Sem linha de participacao o estado e 'indefinido', o mesmo default do banco —
        // inventar 'participa' aqui faria a tela afirmar uma decisao que ninguem tomou.
        status: participacao?.status ?? 'indefinido',
        outrasApresentacoes: (vezesPorPessoa.get(ap.pessoa_chave) ?? 1) - 1,
      });

      const lista = apresentacoesPorPessoa.get(ap.pessoa_chave) ?? [];
      lista.push({
        apresentacaoId: ap.id,
        blocoNome: bloco.nome,
        horario,
        cursoNome: ap.curso_nome,
        musica: ap.musica,
      });
      apresentacoesPorPessoa.set(ap.pessoa_chave, lista);
    }
  }

  // Nome vem da GRADE quando existe, e da participacao quando a pessoa nao subiu ao palco:
  // a grade guarda o nome pela procedencia, entao continua legivel mesmo depois de a pessoa
  // sair da base ativa — o recital ja aconteceu, e apagar o nome reescreveria a historia.
  const nomeNaGrade = new Map<string, { nome: string; alunoId: number }>();
  for (const linha of ordem) {
    if (!nomeNaGrade.has(linha.pessoaChave)) {
      nomeNaGrade.set(linha.pessoaChave, { nome: linha.alunoNome, alunoId: linha.alunoId });
    }
  }

  const chaves = new Set<string>([...nomeNaGrade.keys()]);
  for (const p of entrada.participacoes) {
    // Quem confirmou e nao entrou na grade tambem vai ao teatro. Deixar de fora faria a
    // pessoa aparecer na porta e nao existir na lista de quem a recebe.
    if (p.status === 'participa') chaves.add(p.pessoa_chave);
  }

  const pessoas: PessoaNaChegada[] = [...chaves]
    .map((chave) => {
      const daGrade = nomeNaGrade.get(chave);
      const participacao = porChave.get(chave);
      return {
        pessoaChave: chave,
        alunoId: daGrade?.alunoId ?? participacao?.aluno_id ?? 0,
        nome: daGrade?.nome ?? participacao?.nome ?? '(sem nome)',
        status: participacao?.status ?? 'indefinido',
        chegouEm: participacao?.checkin_em ?? null,
        apresentacoes: apresentacoesPorPessoa.get(chave) ?? [],
      };
    })
    .sort((a, b) => ordenarNomes(a.nome, b.nome));

  const chegaram = pessoas.filter((p) => p.chegouEm !== null).length;

  const inicioPorBloco = new Map(horarios.map((h) => [h.blocoId, h.inicio]));
  const blocosDaChegada: BlocoDaChegada[] = blocosOrdenados.map((bloco) => {
    const linhas = ordem.filter((l) => l.blocoId === bloco.id);
    // Contagem por PESSOA distinta dentro do bloco: quem toca duas vezes no mesmo bloco
    // chega uma vez, e contar as linhas diria que falta gente que ja esta na coxia.
    const chegadaPorPessoa = new Map<string, boolean>();
    for (const l of linhas) chegadaPorPessoa.set(l.pessoaChave, l.chegouEm !== null);
    const presentes = [...chegadaPorPessoa.values()].filter(Boolean).length;

    return {
      blocoId: bloco.id,
      nome: bloco.nome,
      ordem: bloco.ordem,
      inicio: inicioPorBloco.get(bloco.id) ?? '',
      linhas,
      pessoas: chegadaPorPessoa.size,
      chegaram: presentes,
      faltam: chegadaPorPessoa.size - presentes,
    };
  });

  return {
    ordem,
    blocos: blocosDaChegada,
    pessoas,
    resumo: {
      esperados: pessoas.length,
      chegaram,
      faltam: pessoas.length - chegaram,
      apresentacoesSemChegada: ordem.filter((l) => l.chegouEm === null).length,
      apresentacoes: ordem.length,
    },
  };
}

/**
 * Ordem em que a lista da PORTA aparece na tela.
 *
 * Nao e detalhe de renderizacao: e a decisao de quem a coordenacao ve primeiro com o teatro
 * enchendo. As duas leituras defensaveis se contradizem, e por isso a regra mora aqui, num
 * lugar so, em vez de virar um `.sort()` solto dentro do componente.
 *
 * A entrada nunca e mutada — `montarListaDeChegada` devolve a mesma lista para as duas
 * visoes, e ordenar no lugar mudaria a ordem do palco junto.
 */
export function ordenarPessoasDaPorta(pessoas: PessoaNaChegada[]): PessoaNaChegada[] {
  const copia = [...pessoas];

  // Quem falta primeiro, e dentro de cada grupo em ordem alfabetica.
  //
  // As tres leituras possiveis se contradizem, e esta e o meio-termo:
  //   • alfabetica pura e previsivel, mas com o teatro enchendo mantem no topo justamente
  //     quem ja chegou — a lista fica pior conforme o evento avanca, que e quando ela mais
  //     e usada;
  //   • so por chegada responde "quem falta" e nao diz onde procurar um nome;
  //   • esta responde as duas: a metade de cima e a lista de pendentes, e dentro dela a
  //     posicao de cada nome continua previsivel.
  //
  // ⚠️ A comparacao e sobre `chegouEm !== null`, NUNCA sobre `chegouEm` direto: `null` em
  // comparacao ja produziu bug neste projeto — `visto_em >= x` com `visto_em` nulo caia
  // sempre no ramo errado e declarava `sanou` todo sinal recem-nascido. Reduzir a um
  // booleano antes de comparar tira a duvida.
  //
  // ⚠️ Marcar a chegada MOVE a linha para baixo. E deliberado (a pessoa sai da lista de
  // pendentes), e o custo — perder de vista quem acabou de ser marcado — e coberto pela
  // busca por nome, que alcanca os dois grupos.
  return copia.sort(
    (a, b) =>
      Number(a.chegouEm !== null) - Number(b.chegouEm !== null) ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/* ─────────────────────────── certificado ─────────────────────────── */

/**
 * Quem recebe certificado.
 *
 * `chegou` — so quem tem check-in. E a evidencia mais forte que o sistema tem de que a pessoa
 * esteve la, e por isso e o padrao.
 * `todos` — toda a lista do dia, para quando a equipe nao usou o check-in (o caso do primeiro
 * recital, em que a aba acabou de nascer). Emite para quem era esperado, nao para quem veio.
 */
export type PublicoDoCertificado = 'chegou' | 'todos';

/**
 * Filtra quem recebe certificado, em ordem alfabetica.
 *
 * ⚠️ Quem marcou **"nao participa"** so entra pelo check-in. Pela lista de esperados ele fica
 * de fora: certificar quem declarou que nao viria e afirmar no papel uma participacao que
 * ninguem observou. Mas se ele apareceu e alguem marcou a chegada, ele veio — e ai a
 * evidencia vence a declaracao antiga.
 *
 * ⚠️ A ordem e alfabetica porque a saida e uma PILHA DE PAPEL: quem entrega procura por nome,
 * nao por ordem de palco. E a mesma razao da lista da porta, com o desfecho oposto — la o
 * estado de chegada ordena, aqui todo mundo da pilha ja tem o mesmo estado.
 */
export function selecionarParaCertificado(
  pessoas: PessoaNaChegada[],
  publico: PublicoDoCertificado,
): PessoaNaChegada[] {
  const elegiveis =
    publico === 'chegou'
      ? pessoas.filter((p) => p.chegouEm !== null)
      : pessoas.filter((p) => p.status !== 'nao');

  return [...elegiveis].sort((a, b) => ordenarNomes(a.nome, b.nome));
}

export interface ResumoDoEvento {
  participantes: number;
  /** Apresentacoes que o recital VAI ter se ninguem mexer mais: as que estao na grade. */
  apresentacoes: number;
  blocos: number;
  /** Do inicio do primeiro bloco ao fim do ultimo, intervalos inclusos. */
  duracaoTotalSegundos: number;
  inicio: string | null;
  terminoPrevisto: string | null;
  /** Quantas apresentacoes ainda usam a duracao padrao em vez de uma medida pelo professor. */
  semDuracaoPropria: number;
}

/**
 * A visao executiva do recital.
 *
 * ⚠️ `terminoPrevisto` e ESTIMATIVA e depende de quantas apresentacoes ainda estao na
 * duracao padrao — por isso `semDuracaoPropria` sai junto, sempre. Hora de termino
 * anunciada sem dizer de que ela depende vira promessa para os pais na porta do teatro.
 */
export function resumirEvento(entrada: EntradaDaRevisao): ResumoDoEvento {
  const horarios = calcularHorariosDaGrade(entrada.evento, entrada.blocos);
  const apresentacoes = entrada.blocos.flatMap((b) => b.apresentacoes);

  const inicio = horarios.length > 0 ? horarios[0].inicio : null;
  const fim = horarios.length > 0 ? horarios[horarios.length - 1].fim : null;

  return {
    participantes: entrada.alunos.filter((a) => a.status === 'participa').length,
    apresentacoes: apresentacoes.length,
    blocos: entrada.blocos.length,
    duracaoTotalSegundos:
      inicio !== null && fim !== null
        ? Math.max(0, (horaParaSegundos(fim) ?? 0) - (horaParaSegundos(inicio) ?? 0))
        : 0,
    inicio,
    terminoPrevisto: fim,
    semDuracaoPropria: apresentacoes.filter((a) => (a.duracao_segundos ?? 0) <= 0).length,
  };
}

/* ─────────── canal do professor (LA Teacher → apresentacao) ─────────── */

/**
 * O minimo do snapshot `professor` (jsonb) que a divergencia precisa — espelho TS da
 * `vw_relatorio_anual_recital_v1`, sem depender do tipo do hook.
 */
export interface SnapshotParaComparar {
  musica_lancada_em: string | null;
  musica_titulo: string | null;
  musica_artista: string | null;
  musica_duracao_segundos: number | null;
  musica_link: string | null;
  musica_playback_path: string | null;
  musica_ao_vivo: boolean;
}

export interface ApresentacaoParaDivergencia {
  musica: string | null;
  musica_artista: string | null;
  musica_link: string | null;
  playback_path: string | null;
  duracao_segundos: number | null;
  tem_playback: boolean;
  /** 'adm' = alguem escreveu aqui depois do professor — e a divergencia que importa. */
  detalhes_origem: 'adm' | 'professor';
  professor: SnapshotParaComparar | null;
}

export interface DivergenciaProfessor {
  campo: 'musica' | 'musica_artista' | 'musica_link' | 'playback' | 'duracao' | 'ao_vivo';
  rotulo: string;
  /** O que o professor lancou, pronto para exibir. `null` = ele nao preencheu. */
  professor: string | null;
  /** O que vale na grade hoje. */
  atual: string | null;
}

const norm = (v: string | null | undefined) => (v ?? '').trim() || null;

/**
 * Onde o que esta valendo na grade difere do que o professor lancou no LA Teacher.
 *
 * So ha divergencia quando o ADM tomou posse do campo (`detalhes_origem='adm'`): com
 * origem 'professor' o sync copia e os dois lados ficam iguais por construcao. E so
 * depois de `musica_lancada_em` — antes disso o professor nem abriu o cartao e comparar
 * seria acusar diferenca contra o vazio.
 *
 * Devolve [] quando nao ha nada a dizer — o caso de 100% das apresentacoes enquanto o
 * sync e o ADM concordam.
 */
export function divergenciasDoProfessor(ap: ApresentacaoParaDivergencia): DivergenciaProfessor[] {
  const prof = ap.professor;
  if (!prof?.musica_lancada_em || ap.detalhes_origem !== 'adm') return [];

  const divergencias: DivergenciaProfessor[] = [];
  const compara = (
    campo: DivergenciaProfessor['campo'],
    rotulo: string,
    atual: string | null,
    doProfessor: string | null,
  ) => {
    if (atual !== doProfessor) {
      divergencias.push({ campo, rotulo, professor: doProfessor, atual });
    }
  };

  compara('musica', 'música', norm(ap.musica), norm(prof.musica_titulo));
  compara('musica_artista', 'artista', norm(ap.musica_artista), norm(prof.musica_artista));
  compara('musica_link', 'link da música', norm(ap.musica_link), norm(prof.musica_link));
  compara('playback', 'arquivo de playback', norm(ap.playback_path), norm(prof.musica_playback_path));
  compara(
    'duracao',
    'duração',
    ap.duracao_segundos !== null ? formatarDuracao(ap.duracao_segundos) : null,
    prof.musica_duracao_segundos !== null ? formatarDuracao(prof.musica_duracao_segundos) : null,
  );

  const profPlayback = !prof.musica_ao_vivo && (prof.musica_link !== null || prof.musica_playback_path !== null);
  if (ap.tem_playback !== profPlayback) {
    divergencias.push({
      campo: 'ao_vivo',
      rotulo: 'forma de tocar',
      professor: profPlayback ? 'com playback' : 'ao vivo',
      atual: ap.tem_playback ? 'com playback' : 'ao vivo',
    });
  }

  return divergencias;
}

/** A linha do painel "relatorios na sala" — espelho de `evento_relatorios_v1`. */
export interface RelatorioParaResumo {
  apresentacao_id: number | null;
  relatorio_status: string;
  musica_lancada: boolean;
}

export interface ResumoRelatorios {
  /** Apresentacoes na grade = quantos relatorios o recital espera receber. */
  esperados: number;
  /** Relatorios do LA Teacher que casaram com uma apresentacao da grade. */
  com_apresentacao: number;
  /** Casados e com o cartao "Musica e palco" lancado pelo professor. */
  musica_lancada: number;
  aprovados: number;
  enviados: number;
  devolvidos: number;
  /** Lancados para aluno x curso que NAO existe na grade — pendencia do nosso lado. */
  sem_apresentacao: number;
}

export function resumirRelatorios(
  relatorios: RelatorioParaResumo[],
  apresentacoesNaGrade: number,
): ResumoRelatorios {
  const casados = relatorios.filter((r) => r.apresentacao_id !== null);
  return {
    esperados: apresentacoesNaGrade,
    com_apresentacao: casados.length,
    musica_lancada: casados.filter((r) => r.musica_lancada).length,
    aprovados: relatorios.filter((r) => r.relatorio_status === 'aprovado').length,
    enviados: relatorios.filter((r) => r.relatorio_status === 'enviado').length,
    devolvidos: relatorios.filter((r) => r.relatorio_status === 'devolvido').length,
    sem_apresentacao: relatorios.length - casados.length,
  };
}

/* ─────────────────── recital de varios dias ─────────────────── */

/**
 * Os dias que um bloco pode ocupar: de `data_evento` a `data_fim`, inclusive.
 * Recital de um dia devolve so a propria data — o seletor nao oferece o que nao existe.
 *
 * Ate 12 dias (Campo Grande 01–12/12) a lista e direta; acima disso o select ficaria
 * impraticavel — mas um recital mais longo que isso muda de natureza, nao de grade.
 */
export function diasDoEvento(dataEvento: string, dataFim: string | null | undefined): string[] {
  const inicio = Date.parse(`${dataEvento}T00:00:00Z`);
  const fim = dataFim ? Date.parse(`${dataFim}T00:00:00Z`) : inicio;
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return [dataEvento];
  const dias: string[] = [];
  const UM_DIA_MS = 86_400_000;
  for (let t = inicio; t <= fim && dias.length < 31; t += UM_DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/** 'AAAA-MM-DD' -> '14/11' — o selo ao lado do nome do bloco quando a data nao e a do evento. */
export function formatarDataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(iso);
  return m ? `${Number(m[3])}/${Number(m[2])}` : iso;
}

/* ─────────────────────────────── idade ─────────────────────────────── */

/**
 * Idade completa, em anos, numa data de referencia ('AAAA-MM-DD'). `null` sem nascimento.
 *
 * ⚠️ Conta a partir do TEXTO da data, sem `new Date(iso)`: 'AAAA-MM-DD' e lida como UTC e, num
 * fuso negativo, o dia volta um — quem faz aniversario hoje ficaria um ano mais novo ate a
 * noite. E a mesma armadilha que a impressao evita em `dataPorExtenso`.
 *
 * A referencia vem de fora (ver `idadeHoje`) para a regra poder ser testada sem relogio.
 */
export function idadeEmAnos(
  dataNascimento: string | null | undefined,
  referencia: string,
): number | null {
  const n = /^(\d{4})-(\d{2})-(\d{2})/u.exec(dataNascimento ?? '');
  const r = /^(\d{4})-(\d{2})-(\d{2})/u.exec(referencia);
  if (!n || !r) return null;
  const [anoN, mesN, diaN] = [Number(n[1]), Number(n[2]), Number(n[3])];
  const [anoR, mesR, diaR] = [Number(r[1]), Number(r[2]), Number(r[3])];
  const jaFezAniversario = mesR > mesN || (mesR === mesN && diaR >= diaN);
  const idade = anoR - anoN - (jaFezAniversario ? 0 : 1);
  // Data de nascimento no futuro ou absurda e erro de cadastro: nao vira "-3 anos" na tela.
  return idade >= 0 && idade < 130 ? idade : null;
}

/** 'AAAA-MM-DD' de hoje no fuso do negocio (BRT). */
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

/**
 * Idade de HOJE — a mesma regra da aba Alunos, que le `idade_anos` da view (calculada no dia).
 *
 * ⚠️ Hoje, e nao no dia do recital, de proposito: medir na data do evento faria a mesma
 * pessoa aparecer com 12 anos na aba Alunos e 13 na Grade, e duas idades para uma crianca e
 * o tipo de diferenca que faz a equipe desconfiar de todas as outras colunas.
 */
export function idadeHoje(dataNascimento: string | null | undefined): number | null {
  return idadeEmAnos(dataNascimento, hojeNoBrasil());
}

/** '12 anos' / '1 ano' / '' — texto curto, pronto para ficar ao lado do nome. */
export function rotuloIdade(idade: number | null | undefined): string {
  if (idade === null || idade === undefined) return '';
  return `${idade} ${idade === 1 ? 'ano' : 'anos'}`;
}

/* ---------------------------------------------------------------------------
 * BILHETERIA (M9) — orcamento da venda e lugares livres
 * ------------------------------------------------------------------------ */

export interface PacoteDeDesconto {
  id: number;
  quantidade_minima: number;
  /** opcional — a M9 nao tem teto de pacote; existe pra compatibilidade futura */
  quantidade_maxima?: number | null;
  desconto_pct: number;
}

export interface OrcamentoVenda {
  precoUnitario: number;
  valorBase: number;
  pacote: PacoteDeDesconto | null;
  descontoPct: number;
  valorFinal: number;
}

/**
 * Previsao da venda — mesma regra da RPC `evento_bilheteria_vender_v1`:
 * todos pagam o preco cobrado (meia) e o maior pacote que a quantidade cobre
 * aplica o desconto. O banco reconta na gravacao; isso e so o resumo da tela.
 */
export function simularOrcamentoVenda(
  precoCobrado: number | null | undefined,
  quantidade: number,
  pacotes: PacoteDeDesconto[],
): OrcamentoVenda {
  const unitario = precoCobrado ?? 0;
  const base = Math.round(unitario * Math.max(quantidade, 0) * 100) / 100;
  const pacote =
    pacotes
      .filter(
        (p) =>
          quantidade >= p.quantidade_minima &&
          (p.quantidade_maxima === null || quantidade <= p.quantidade_maxima),
      )
      .sort((a, b) => b.desconto_pct - a.desconto_pct)[0] ?? null;
  const descontoPct = pacote?.desconto_pct ?? 0;
  const valorFinal = Math.round(base * (1 - descontoPct / 100) * 100) / 100;
  return { precoUnitario: unitario, valorBase: base, pacote, descontoPct, valorFinal };
}

/**
 * Lugares livres do bloco — ocupados = cortesias confirmadas + convidados de
 * vendas vivas (pendente/pago). Cancelada/reembolsada devolve o lugar, igual
 * ao que a RPC conta dentro do lock.
 */
export function vagasLivresDoBloco(bloco: {
  capacidade: number | null;
  cortesias: number;
  vendidos: number;
}): number | null {
  if (bloco.capacidade === null) return null;
  return bloco.capacidade - bloco.cortesias - bloco.vendidos;
}

/** Placeholder do convidado sem nome — igual ao que a RPC grava no banco. */
export function nomeConvidadoPlaceholder(comprador: string, indice: number): string {
  return `Convidado ${indice} de ${comprador.trim()}`;
}
