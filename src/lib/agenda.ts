// Geometria da timeline da Agenda. Sem React, sem Supabase: tudo testavel isoladamente.

export const AGENDA_HORA_INICIO = 8;
export const AGENDA_HORA_FIM = 22;
export const AGENDA_LARGURA_HORA_PX = 88;
export const AGENDA_ALTURA_FAIXA_PX = 34;
export const AGENDA_GAP_FAIXA_PX = 3;

// Piso da largura da hora. Acima disso a timeline estica para ocupar a largura
// disponivel; abaixo ela pararia de caber e o trilho passa a rolar na horizontal.
export const AGENDA_LARGURA_HORA_MIN_PX = 88;
// A partir daqui a hora e larga o bastante para o card comportar uma 3a linha.
export const AGENDA_LARGURA_HORA_AMPLA_PX = 150;
export const AGENDA_ALTURA_FAIXA_AMPLA_PX = 54;
// Janela minima de horas: um dia com uma aula so nao vira uma faixa de 1 hora
// esticada na tela inteira, o que perderia a nocao de onde ela cai no dia.
export const AGENDA_JANELA_MIN_HORAS = 5;

export type ItemPosicionavel = {
  hora_inicio: string;
  duracao_minutos: number;
};

/** 'HH:MM' -> minutos desde a meia-noite. A RPC ja entrega em BRT. */
export function minutosDeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Distribui aulas em faixas horizontais para que aulas sobrepostas nao se
 * cubram. Uma faixa e reaproveitada assim que a aula anterior dela termina.
 * A ordenacao interna torna o resultado independente da ordem de entrada.
 */
export function alocarFaixas<T extends ItemPosicionavel>(
  itens: T[],
): Array<T & { faixa: number }> {
  const ordenados = itens
    .map((item, indice) => ({ item, indice }))
    .sort((a, b) => {
      const ia = minutosDeHHMM(a.item.hora_inicio);
      const ib = minutosDeHHMM(b.item.hora_inicio);
      if (ia !== ib) return ia - ib;
      if (a.item.duracao_minutos !== b.item.duracao_minutos) {
        return a.item.duracao_minutos - b.item.duracao_minutos;
      }
      return a.indice - b.indice;
    });

  const fimDaFaixa: number[] = [];
  const faixaPorIndice = new Map<number, number>();

  for (const { item, indice } of ordenados) {
    const inicio = minutosDeHHMM(item.hora_inicio);
    const fim = inicio + item.duracao_minutos;
    let faixa = 0;
    while (fimDaFaixa[faixa] !== undefined && fimDaFaixa[faixa] > inicio) {
      faixa++;
    }
    fimDaFaixa[faixa] = fim;
    faixaPorIndice.set(indice, faixa);
  }

  return itens.map((item, indice) => ({
    ...item,
    faixa: faixaPorIndice.get(indice) ?? 0,
  }));
}

export function contarFaixas(itens: Array<{ faixa: number }>): number {
  if (itens.length === 0) return 0;
  return Math.max(...itens.map((i) => i.faixa)) + 1;
}

/**
 * Distancia em px do inicio do trilho ate o horario dado. `horaInicio` e
 * `larguraHora` sao parametros porque a janela visivel do dia e a escala mudam
 * conforme o que existe na agenda — os defaults mantem o comportamento fixo.
 */
export function posicaoPx(
  hhmm: string,
  larguraHora: number = AGENDA_LARGURA_HORA_PX,
  horaInicio: number = AGENDA_HORA_INICIO,
): number {
  const minutos = minutosDeHHMM(hhmm);
  return ((minutos - horaInicio * 60) / 60) * larguraHora;
}

export function larguraPx(
  duracaoMinutos: number,
  larguraHora: number = AGENDA_LARGURA_HORA_PX,
): number {
  return (duracaoMinutos / 60) * larguraHora;
}

/** Minutos desde a meia-noite no relogio local. O app roda em BRT. */
export function minutosAgora(agora: Date): number {
  return agora.getHours() * 60 + agora.getMinutes();
}

/**
 * Segundos desde a meia-noite. A regua usa esta resolucao para andar de
 * segundo em segundo — com minutos ela daria saltos visiveis de um traco.
 */
export function segundosAgora(agora: Date): number {
  return agora.getHours() * 3600 + agora.getMinutes() * 60 + agora.getSeconds();
}

/** Segundos desde a meia-noite -> 'HH:MM:SS'. */
export function formatarRelogio(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * True quando a aula ja terminou. Necessario porque `professor_presenca` chega
 * do Emusys como 'ausente' por DEFAULT: em 100% das aulas futuras o campo diz
 * 'ausente' sem que ninguem tenha faltado. Exibir isso antes da aula acontecer
 * acusaria falta de metade do corpo docente todos os dias.
 */
export function aulaJaOcorreu(data: string, horaFim: string, agora: Date): boolean {
  const hoje = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0'),
  ].join('-');

  if (data < hoje) return true;
  if (data > hoje) return false;
  return minutosAgora(agora) >= minutosDeHHMM(horaFim);
}

export function dentroDoExpediente(minutos: number): boolean {
  return minutos >= AGENDA_HORA_INICIO * 60 && minutos <= AGENDA_HORA_FIM * 60;
}

/**
 * Janela de horas a exibir. Em vez de sempre desenhar 08:00-22:00, recorta o
 * trilho ao que o dia realmente tem (mais uma hora de folga de cada lado) para
 * que as horas restantes possam esticar e os cards fiquem legiveis quando ha
 * poucas aulas. `segundos` inclui o horario atual na janela quando o dia
 * exibido e hoje — senao a regua cairia fora do trilho.
 */
export function janelaDeHoras(
  aulas: ItemPosicionavel[],
  segundos: number | null,
): { inicio: number; fim: number } {
  let inicio = Number.POSITIVE_INFINITY;
  let fim = Number.NEGATIVE_INFINITY;

  for (const aula of aulas) {
    const i = minutosDeHHMM(aula.hora_inicio);
    inicio = Math.min(inicio, Math.floor(i / 60));
    fim = Math.max(fim, Math.ceil((i + aula.duracao_minutos) / 60));
  }

  if (segundos !== null) {
    const hora = Math.floor(segundos / 3600);
    if (hora >= AGENDA_HORA_INICIO && hora <= AGENDA_HORA_FIM) {
      inicio = Math.min(inicio, hora);
      fim = Math.max(fim, hora + 1);
    }
  }

  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) {
    return { inicio: AGENDA_HORA_INICIO, fim: AGENDA_HORA_FIM };
  }

  // Folga de uma hora de cada lado, sem sair do expediente.
  inicio = Math.max(AGENDA_HORA_INICIO, inicio - 1);
  fim = Math.min(AGENDA_HORA_FIM, fim + 1);

  // Garante o span minimo esticando para a frente e, se bater no teto, para tras.
  if (fim - inicio < AGENDA_JANELA_MIN_HORAS) {
    fim = Math.min(AGENDA_HORA_FIM, inicio + AGENDA_JANELA_MIN_HORAS);
    inicio = Math.max(AGENDA_HORA_INICIO, fim - AGENDA_JANELA_MIN_HORAS);
  }

  return { inicio, fim };
}

/**
 * Largura de cada hora para preencher o espaco disponivel. Nunca abaixo do
 * piso: dia cheio volta a rolar na horizontal em vez de espremer os cards.
 *
 * ⚠️ Sempre INTEIRO. Com valor fracionario (ex.: 1240/12 = 103,33) as gridlines
 * do trilho, desenhadas por repeating-linear-gradient, caem em pixel quebrado e
 * o navegador deixa de pintar parte delas — o efeito e uma grade com linhas
 * faltando de forma aparentemente aleatoria. Arredondar para baixo tambem
 * mantem o trilho dentro da largura disponivel.
 */
export function larguraDaHora(larguraDisponivelPx: number, quantidadeDeHoras: number): number {
  if (quantidadeDeHoras <= 0 || larguraDisponivelPx <= 0) return AGENDA_LARGURA_HORA_PX;
  return Math.max(AGENDA_LARGURA_HORA_MIN_PX, Math.floor(larguraDisponivelPx / quantidadeDeHoras));
}

/** Aulas vivas neste minuto e quantas salas elas ocupam. Cancelada nao conta. */
export function contarEmAulaAgora(
  aulas: Array<{
    hora_inicio: string;
    duracao_minutos: number;
    cancelada: boolean;
    sala_nome: string | null;
  }>,
  minutos: number,
): { aulas: number; salas: number } {
  const salas = new Set<string>();
  let total = 0;

  for (const aula of aulas) {
    if (aula.cancelada) continue;
    const inicio = minutosDeHHMM(aula.hora_inicio);
    if (minutos < inicio || minutos >= inicio + aula.duracao_minutos) continue;
    total++;
    if (aula.sala_nome) salas.add(aula.sala_nome);
  }

  return { aulas: total, salas: salas.size };
}

/**
 * True quando a aula esta acontecendo neste minuto. Cancelada nunca esta em
 * andamento. `minutos` null (dia que nao e hoje) tambem devolve false — uma
 * aula de terca-feira nao pode estar "acontecendo agora" numa quinta.
 */
export function aulaEmAndamento(
  aula: ItemPosicionavel & { cancelada: boolean },
  minutos: number | null,
): boolean {
  if (minutos === null || aula.cancelada) return false;
  const inicio = minutosDeHHMM(aula.hora_inicio);
  return minutos >= inicio && minutos < inicio + aula.duracao_minutos;
}

/**
 * Iniciais para o rotulo do trilho: 'Bruno Sá' -> 'BS'. Primeiro e ULTIMO nome
 * (nao os dois primeiros): "Ana Maria Ribeiro" e "Ana Maria Souza" dariam o
 * mesmo 'AM' e o trilho perderia a serventia de distinguir de relance.
 */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Curso que o professor mais da no dia, para o rotulo do trilho. Empate
 * desempata por ordem alfabetica so para o resultado ser estavel entre
 * renderizacoes — sem isso o rotulo poderia piscar entre dois cursos.
 */
export function cursoPredominante(aulas: Array<{ curso_nome: string | null }>): string | null {
  const contagem = new Map<string, number>();
  for (const aula of aulas) {
    if (!aula.curso_nome) continue;
    contagem.set(aula.curso_nome, (contagem.get(aula.curso_nome) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;

  return [...contagem.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'),
  )[0][0];
}

/**
 * Percentual da janela do dia que o trilho tem preenchido. Uniao de
 * intervalos, nao soma: duas aulas sobrepostas de 1h ocupam 1h de agenda, nao
 * 2h — somar daria "120% de ocupacao", que nao quer dizer nada.
 * Cancelada nao ocupa a sala.
 */
export function ocupacaoPct(
  aulas: Array<ItemPosicionavel & { cancelada: boolean }>,
  janela: { inicio: number; fim: number },
): number {
  const totalMinutos = (janela.fim - janela.inicio) * 60;
  if (totalMinutos <= 0) return 0;

  const limiteInicio = janela.inicio * 60;
  const limiteFim = janela.fim * 60;

  const intervalos = aulas
    .filter((a) => !a.cancelada)
    .map((a) => {
      const bruto = minutosDeHHMM(a.hora_inicio);
      return [
        Math.max(limiteInicio, bruto),
        Math.min(limiteFim, bruto + a.duracao_minutos),
      ] as const;
    })
    .filter(([i, f]) => f > i)
    .sort((a, b) => a[0] - b[0]);

  let ocupado = 0;
  let fimCorrido = Number.NEGATIVE_INFINITY;
  for (const [inicio, fim] of intervalos) {
    if (inicio >= fimCorrido) ocupado += fim - inicio;
    else if (fim > fimCorrido) ocupado += fim - fimCorrido;
    if (fim > fimCorrido) fimCorrido = fim;
  }

  return Math.round((ocupado / totalMinutos) * 100);
}

/**
 * Pior sobreposicao do trilho: quantas aulas coincidem e a que horas. O
 * empilhamento em faixas ja acontece (ver alocarFaixas), mas so faz o trilho
 * ficar mais alto — quem varre a grade de cima nao percebe. Este resumo vira a
 * etiqueta que nomeia o conflito no rotulo.
 *
 * Cancelada nao conta: uma aula cancelada em cima de outra nao e conflito.
 * Devolve null quando nao ha nada simultaneo.
 */
export function resumoSobreposicao<T extends ItemPosicionavel & { cancelada: boolean }>(
  aulas: T[],
): { qtd: number; hora: string } | null {
  const vivas = aulas.filter((a) => !a.cancelada);
  let pior: { qtd: number; hora: string } | null = null;

  // Basta avaliar os instantes de INICIO: o numero de aulas simultaneas so
  // pode subir quando uma comeca.
  for (const aula of vivas) {
    const instante = minutosDeHHMM(aula.hora_inicio);
    const qtd = vivas.filter((outra) => {
      const i = minutosDeHHMM(outra.hora_inicio);
      return i <= instante && i + outra.duracao_minutos > instante;
    }).length;

    if (qtd < 2) continue;
    if (!pior || qtd > pior.qtd || (qtd === pior.qtd && aula.hora_inicio < pior.hora)) {
      pior = { qtd, hora: aula.hora_inicio };
    }
  }

  return pior;
}

/**
 * Quantas aulas do dia ja terminaram. Vira o "· N ja ocorreram" do KPI: o
 * total sozinho nao diz se o dia mal comecou ou se esta acabando.
 * Cancelada nao conta — ela nao "ocorreu".
 */
export function contarJaOcorreram(
  aulas: Array<{ hora_fim: string; cancelada: boolean }>,
  data: string,
  agora: Date,
): number {
  return aulas.filter((a) => !a.cancelada && aulaJaOcorreu(data, a.hora_fim, agora)).length;
}

/**
 * Aulas por hora, para o sparkline do KPI. Serve para ver de relance se o
 * movimento do dia esta concentrado a tarde ou espalhado — coisa que o total
 * nao mostra. Cancelada fora: o grafico e de movimento real.
 */
export function distribuicaoPorHora(
  aulas: Array<ItemPosicionavel & { cancelada: boolean }>,
): Array<{ hora: number; qtd: number }> {
  const vivas = aulas.filter((a) => !a.cancelada);
  if (vivas.length === 0) return [];

  const janela = janelaDeHoras(vivas, null);
  const contagem = new Map<number, number>();
  for (const aula of vivas) {
    const hora = Math.floor(minutosDeHHMM(aula.hora_inicio) / 60);
    contagem.set(hora, (contagem.get(hora) ?? 0) + 1);
  }

  return Array.from({ length: janela.fim - janela.inicio }, (_, i) => {
    const hora = janela.inicio + i;
    return { hora, qtd: contagem.get(hora) ?? 0 };
  });
}

export function formatarFrescor(ultimaSync: string | null, agora: Date): string {
  if (!ultimaSync) return 'sem dado de sincronizacao';

  const minutos = Math.floor((agora.getTime() - new Date(ultimaSync).getTime()) / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `ha ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `ha ${horas} h`;
  return `ha ${Math.floor(horas / 24)} d`;
}

/**
 * Normaliza texto para busca: sem acento, minusculo, sem espaco nas pontas.
 * Sem isso "joao" nao acha "João" e o filtro parece quebrado para quem digita
 * rapido — o nome no banco vem do Emusys, sempre acentuado.
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export type AulaFiltravel = {
  professor_nome: string | null;
  sala_nome: string | null;
  curso_nome: string | null;
  turma_nome: string | null;
  tipo: string | null;
  categoria: string | null;
  cancelada: boolean;
  qtd_alunos: number;
  alunos: Array<{ nome: string }>;
};

/**
 * Modalidade CONTRATADA da disciplina, vinda de `emusys_disciplinas_catalogo`.
 * ⚠️ Nao serve como filtro na LA: 164 das 165 aulas de 03/08/2026 sao 'turma',
 * porque quase toda disciplina daqui e de turma mesmo quando roda com um aluno
 * so. Fica visivel no painel de detalhe; quem filtra quer `LotacaoAula`.
 */
export type TipoAula = 'individual' | 'turma';

/**
 * Quantas pessoas ha de fato no horario — a pergunta que se faz olhando a
 * grade ("quem esta sozinho?"). Ate 03/08/2026 isto era exibido como se fosse
 * modalidade, o que fazia um aluno sozinho numa aula de turma aparecer como
 * "Individual" enquanto o Emusys mostrava "Grupo".
 */
export type LotacaoAula = 'sozinho' | 'turma';

export interface FiltrosAgenda {
  /** Casa contra professor, sala, curso, turma E nome de aluno. */
  busca: string;
  /** null = todos os cursos. */
  curso: string | null;
  /** null = todos os professores. */
  professor: string | null;
  /** null = todas as turmas. Aula individual tem turma_nome nulo e sai do filtro. */
  turma: string | null;
  /** null = qualquer lotacao. 'sozinho' = 1 aluno no horario. */
  lotacao: LotacaoAula | null;
  /** null = todas. Valores reais na base: normal, experimental, extra. */
  categoria: string | null;
  ocultarCanceladas: boolean;
}

/**
 * Rotulo de exibicao da categoria. Sem match, devolve o valor cru — assim uma
 * categoria nova do Emusys (a doc cita `reposicao` e `avulsa`, que ainda nao
 * apareceram na base) entra no filtro sozinha em vez de sumir.
 */
export function rotuloCategoria(categoria: string): string {
  const mapa: Record<string, string> = {
    normal: 'Normal',
    experimental: 'Experimental',
    extra: 'Extra',
    reposicao: 'Reposição',
    avulsa: 'Avulsa',
  };
  return mapa[categoria] ?? categoria;
}

/** Ordem de exibicao das categorias. `reposicao` e `avulsa` estao na doc da API mas ainda nao apareceram na base. */
const CATEGORIAS_CONHECIDAS = ['normal', 'experimental', 'extra', 'reposicao', 'avulsa'];

/**
 * Categorias para o filtro, com a contagem do dia — INCLUSIVE as que estao
 * zeradas.
 *
 * Os outros selects (professor, curso, turma) listam so o que existe, e tudo
 * bem: sao conjuntos abertos e grandes. Categoria e um conjunto fechado de 5
 * valores, e listar so o que existe cria uma duvida sem resposta — em
 * 03/08/2026 o usuario procurou "Experimental" em Campo Grande, nao achou, e
 * nao tinha como saber se o filtro estava quebrado ou se simplesmente nao
 * havia experimental naquele dia (era o segundo caso: as 2 estavam em Barra e
 * Recreio). Com "Experimental (0)" desabilitado, a ausencia vira resposta.
 *
 * Categoria nova vinda do Emusys entra no fim da lista em vez de sumir.
 */
export function opcoesDeCategoria(
  aulas: Array<{ categoria: string | null }>,
): Array<{ valor: string; rotulo: string; qtd: number }> {
  const contagem = new Map<string, number>();
  for (const aula of aulas) {
    if (!aula.categoria) continue;
    contagem.set(aula.categoria, (contagem.get(aula.categoria) ?? 0) + 1);
  }

  const desconhecidas = [...contagem.keys()]
    .filter((c) => !CATEGORIAS_CONHECIDAS.includes(c))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return [...CATEGORIAS_CONHECIDAS, ...desconhecidas].map((valor) => ({
    valor,
    rotulo: rotuloCategoria(valor),
    qtd: contagem.get(valor) ?? 0,
  }));
}

export const FILTROS_AGENDA_VAZIOS: FiltrosAgenda = {
  busca: '',
  curso: null,
  professor: null,
  turma: null,
  lotacao: null,
  categoria: null,
  ocultarCanceladas: false,
};

export function filtroAtivo(filtros: FiltrosAgenda): boolean {
  return (
    filtros.busca.trim() !== '' ||
    filtros.curso !== null ||
    filtros.professor !== null ||
    filtros.turma !== null ||
    filtros.lotacao !== null ||
    filtros.categoria !== null ||
    filtros.ocultarCanceladas
  );
}

/**
 * Quantos filtros AVANCADOS estao ligados — os que ficam escondidos no
 * popover. A busca livre fica de fora porque ela e visivel na barra: contar
 * algo que o usuario esta vendo faria o contador do botao mentir sobre quanto
 * ha de escondido.
 */
export function contarFiltrosAvancados(filtros: FiltrosAgenda): number {
  return [
    filtros.curso,
    filtros.professor,
    filtros.turma,
    filtros.lotacao,
    filtros.categoria,
    filtros.ocultarCanceladas ? 'sim' : null,
  ].filter((v) => v !== null && v !== false).length;
}

/**
 * Filtra no cliente: a RPC ja devolve tudo que a busca precisa, entao nao ha
 * ida ao banco a cada tecla. Curso e professor casam por igualdade exata (vem
 * de um select montado a partir das proprias aulas); a busca livre casa por
 * substring normalizada em qualquer um dos campos, inclusive nome de aluno.
 */
export function filtrarAulas<T extends AulaFiltravel>(aulas: T[], filtros: FiltrosAgenda): T[] {
  const termo = normalizarBusca(filtros.busca);

  return aulas.filter((aula) => {
    if (filtros.ocultarCanceladas && aula.cancelada) return false;
    if (filtros.curso !== null && aula.curso_nome !== filtros.curso) return false;
    if (filtros.professor !== null && aula.professor_nome !== filtros.professor) return false;
    if (filtros.turma !== null && aula.turma_nome !== filtros.turma) return false;
    if (filtros.lotacao !== null) {
      // 0 aluno vinculado nao e "sozinho": e aula sem vinculo, outro problema.
      const sozinho = aula.qtd_alunos === 1;
      if (filtros.lotacao === 'sozinho' && !sozinho) return false;
      if (filtros.lotacao === 'turma' && aula.qtd_alunos <= 1) return false;
    }
    if (filtros.categoria !== null && aula.categoria !== filtros.categoria) return false;
    if (termo === '') return true;

    const campos = [aula.professor_nome, aula.sala_nome, aula.curso_nome, aula.turma_nome];
    if (campos.some((c) => c && normalizarBusca(c).includes(termo))) return true;
    return aula.alunos.some((a) => normalizarBusca(a.nome).includes(termo));
  });
}

/** Valores distintos de um campo, ordenados, para montar os selects. */
export function opcoesDoCampo<T extends AulaFiltravel>(
  aulas: T[],
  campo: 'curso_nome' | 'professor_nome' | 'turma_nome' | 'categoria',
): string[] {
  const valores = new Set<string>();
  for (const aula of aulas) {
    const valor = aula[campo];
    if (valor) valores.add(valor);
  }
  return [...valores].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// A janela 19/07-01/08/2026 ja foi tratada aqui como "dados perdidos por falha
// de sincronizacao". Era diagnostico errado: foi RECESSO ESCOLAR. Provas —
// 89% dos contratos vao da aula N (ate 18/07) direto para a N+1 (a partir de
// 03/08), sem salto no contador; zero FK orfa em aluno_presenca,
// aula_alunos_emusys e emusys_experimentais_raw (delecao deixaria rastro); as 3
// unidades zeradas de forma identica, incompativel com falha de sync, que roda
// com token e cron por unidade; e a semana de reabertura tem 70 experimentais
// contra 36 de uma semana normal. Nao ha nada a preencher: essas aulas nunca
// existiram no Emusys. Aviso removido em 2026-08-02.

// Janela de frescor aceitavel para o risco de evasao (vw_risco_evasao_atual).
// O cron calcular-risco-evasao-3d roda a cada 3 dias quando ligado; 7 dias da
// folga para 1-2 execucoes perdidas sem acusar "desatualizado" a toa.
const RISCO_JANELA_FRESCA_DIAS = 7;

/**
 * True quando o risco de evasao nao pode ser tratado como calculo recente:
 * sem data (aluno nunca pontuado) ou calculado ha mais de 7 dias. Compara por
 * dias corridos (nao por relogio) porque `risco_calculado_em` e uma data, sem
 * horario.
 */
export function riscoDesatualizado(calculadoEm: string | null, agora: Date): boolean {
  if (!calculadoEm) return true;

  const data = new Date(calculadoEm);
  if (Number.isNaN(data.getTime())) return true;

  const diasDeDiferenca = Math.floor(
    (agora.getTime() - data.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diasDeDiferenca > RISCO_JANELA_FRESCA_DIAS;
}

/** 'YYYY-MM-DD' (ou timestamp) -> 'dd/mm'. String vazia quando nao ha data. */
export function formatarDataCalculo(calculadoEm: string | null): string {
  if (!calculadoEm) return '';

  const data = new Date(calculadoEm);
  if (Number.isNaN(data.getTime())) return '';

  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}
