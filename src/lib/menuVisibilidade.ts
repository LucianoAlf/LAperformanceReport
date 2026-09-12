/**
 * Regra de quem enxerga cada item do menu — fonte unica.
 *
 * Existe porque a sidebar e o shell mobile precisam da MESMA regra: duplicar
 * faria modulo novo aparecer num menu e nao no outro.
 */

export type RegraVisibilidade = 'sempre' | 'admin' | 'campanhas' | 'trafego_pago';

export interface ContextoVisibilidade {
  isAdmin: boolean;
  /** `campanhas_config.visibilidade_global` (ou o e-mail de dev) */
  campanhasVisivel: boolean;
  /** lista fixa de e-mail — custo de midia e sensivel */
  trafegoPagoVisivel: boolean;
}

export function itemVisivel(
  regra: RegraVisibilidade | undefined,
  ctx: ContextoVisibilidade,
): boolean {
  if (regra === undefined || regra === 'sempre') return true;
  if (regra === 'admin') return ctx.isAdmin;
  if (regra === 'campanhas') return ctx.campanhasVisivel;
  if (regra === 'trafego_pago') return ctx.trafegoPagoVisivel;

  // Fail-closed: regra que ninguem implementou nao pode vazar modulo sensivel.
  // Mas sumir em silencio e o pior dos mundos — por isso o aviso.
  console.warn(`[menu] regra de visibilidade desconhecida: ${String(regra)} — item ocultado`);
  return false;
}

export function filtrarVisiveis<T extends { visibilidade?: RegraVisibilidade }>(
  itens: T[],
  ctx: ContextoVisibilidade,
): T[] {
  return itens.filter((item) => itemVisivel(item.visibilidade, ctx));
}
