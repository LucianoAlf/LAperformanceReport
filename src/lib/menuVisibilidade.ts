/**
 * Regra de quem enxerga cada item do menu — fonte unica.
 *
 * Existe porque a sidebar e o shell mobile precisam da MESMA regra: duplicar
 * faria modulo novo aparecer num menu e nao no outro.
 */

export type RegraVisibilidade = 'sempre' | 'admin' | 'campanhas' | 'trafego_pago' | 'eventos';

export interface ContextoVisibilidade {
  isAdmin: boolean;
  /** `campanhas_config.visibilidade_global` (ou o e-mail de dev) */
  campanhasVisivel: boolean;
  /** lista fixa de e-mail — custo de midia e sensivel */
  trafegoPagoVisivel: boolean;
  /** ver `podeVerEventos` — em teste, so o Hugo */
  eventosVisivel: boolean;
}

/**
 * Quem enxerga o modulo Eventos (recital) — LAPE-39.
 *
 * ESTE CORPO E DESCARTAVEL. Enquanto o modulo esta em teste, o gate e por e-mail;
 * na virada para producao troca-se o corpo por `hasPermission('eventos.ver')` e a
 * liberacao passa a ser feita na tela de Permissoes, sem deploy. As permissoes
 * `eventos.ver` e `eventos.editar` ja existem (migration 20260918120000).
 *
 * A funcao existe para haver UM ponto de corte: o guard da rota, a sidebar do desktop
 * e o menu do celular chamam esta funcao em vez de repetir a regra. O Trafego Pago nao
 * tem isso — a lista de e-mails dele esta escrita em 3 arquivos (divida da LAPE-32).
 */
const EVENTOS_EMAIL_TESTE = 'hugo@gmail.com';

export function podeVerEventos(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase() === EVENTOS_EMAIL_TESTE;
}

export function itemVisivel(
  regra: RegraVisibilidade | undefined,
  ctx: ContextoVisibilidade,
): boolean {
  if (regra === undefined || regra === 'sempre') return true;
  if (regra === 'admin') return ctx.isAdmin;
  if (regra === 'campanhas') return ctx.campanhasVisivel;
  if (regra === 'trafego_pago') return ctx.trafegoPagoVisivel;
  if (regra === 'eventos') return ctx.eventosVisivel;

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
