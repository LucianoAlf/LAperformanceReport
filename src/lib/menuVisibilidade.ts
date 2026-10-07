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
 * RBAC desde 27/09/2026: recebe o resultado de `hasPermission('eventos.ver')` dos tres
 * consumidores (guard da rota, sidebar do desktop, menu do celular), que e quem conhece o
 * usuario — a funcao fica pura e testavel, sem depender do contexto de auth.
 *
 * ⚠️ Abrir o MENU nao abre o DADO: as tabelas do modulo tem RLS por unidade, entao cada
 * pessoa continua vendo apenas os eventos da unidade dela e o admin ve tudo — provado
 * contra o banco nos tres perfis. `eventos.ver`/`eventos.editar` foram concedidas aos
 * perfis Gerente, Farmer, Sucesso do Aluno (e `ver` ao Visualizador) na migration
 * 20260927150000; a liberacao agora e um clique na tela de Permissoes, nao um deploy.
 *
 * A funcao permanece como UM ponto de corte: o Trafego Pago e o contra-exemplo, com a
 * lista de e-mails dele escrita em 3 arquivos (divida da LAPE-32).
 */
export function podeVerEventos(temPermissao: boolean): boolean {
  return temPermissao;
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
