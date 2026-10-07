/** Abaixo disto o arrasto ainda nao declarou intencao. */
export const LIMIAR_EIXO_PX = 10;

/** Fracao da largura que confirma a troca de dia. */
export const LIMIAR_TROCA_FRACAO = 0.25;

/** Quanto do movimento sobra quando nao ha para onde ir. */
const RESISTENCIA_NA_PONTA = 0.25;

export interface EstadoSwipe {
  indice: number;
  dx: number;
  arrastando: boolean;
  /** null = ainda nao decidido. Decidido UMA vez, vale ate soltar. */
  eixo: 'x' | 'y' | null;
  origem: { x: number; y: number };
}

export interface OpcoesSwipe {
  largura: number;
  total: number;
}

export const swipeInicial: EstadoSwipe = {
  indice: 0,
  dx: 0,
  arrastando: false,
  eixo: null,
  origem: { x: 0, y: 0 },
};

export function aoPressionar(estado: EstadoSwipe, ponto: { x: number; y: number }): EstadoSwipe {
  return { ...estado, arrastando: true, dx: 0, eixo: null, origem: ponto };
}

/**
 * O coracao do gesto: o eixo e decidido UMA vez, depois da zona morta, e nao
 * volta a ser avaliado ate soltar.
 *
 * Reavaliar `|dx| > |dy|` a cada movimento e o jeito obvio e produz tremor: num
 * arrasto diagonal o painel alterna entre rolar e deslizar, e quem usa nao
 * sabe nomear o defeito — so sente que esta ruim.
 */
export function aoMover(
  estado: EstadoSwipe,
  ponto: { x: number; y: number },
  { total }: OpcoesSwipe,
): EstadoSwipe {
  // pointermove pode chegar sem o down correspondente (o ponteiro entrou na
  // area ja pressionado). Sem esta guarda o painel saltaria do nada.
  if (!estado.arrastando) return estado;

  const dx = ponto.x - estado.origem.x;
  const dy = ponto.y - estado.origem.y;

  let eixo = estado.eixo;
  if (eixo === null) {
    if (Math.abs(dx) < LIMIAR_EIXO_PX && Math.abs(dy) < LIMIAR_EIXO_PX) return estado;
    eixo = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (eixo !== 'x') return { ...estado, eixo, dx: 0 };

  const naPonta = (estado.indice === 0 && dx > 0) || (estado.indice === total - 1 && dx < 0);
  return { ...estado, eixo, dx: naPonta ? dx * RESISTENCIA_NA_PONTA : dx };
}

export function aoSoltar(estado: EstadoSwipe, { largura, total }: OpcoesSwipe): EstadoSwipe {
  const confirmou = estado.eixo === 'x' && Math.abs(estado.dx) > largura * LIMIAR_TROCA_FRACAO;
  const passo = confirmou ? (estado.dx < 0 ? 1 : -1) : 0;
  const indice = Math.max(0, Math.min(total - 1, estado.indice + passo));
  return { ...estado, indice, dx: 0, arrastando: false, eixo: null };
}
