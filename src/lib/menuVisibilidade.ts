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
 * ABERTO A TODO USUARIO AUTENTICADO desde 19/09/2026 (decisao do Hugo), com aviso de
 * "em desenvolvimento" na propria tela. Antes o gate era por e-mail (`hugo@gmail.com`).
 *
 * ⚠️ Abrir o MENU nao abre o DADO: as cinco tabelas do modulo tem RLS por unidade, entao
 * cada pessoa continua vendo apenas os eventos da unidade dela e o admin ve tudo — provado
 * contra o banco nos tres perfis. O que esta funcao controla e visibilidade de tela.
 *
 * O destino continua sendo `hasPermission('eventos.ver')`, para a liberacao virar um
 * clique na tela de Permissoes em vez de um deploy; as permissoes `eventos.ver` e
 * `eventos.editar` ja existem desde a migration 20260918120000. A funcao permanece como
 * UM ponto de corte — o guard da rota, a sidebar do desktop e o menu do celular chamam
 * ela em vez de repetir a regra. O Trafego Pago e o contra-exemplo: a lista de e-mails
 * dele esta escrita em 3 arquivos (divida da LAPE-32).
 *
 * O parametro fica na assinatura de proposito: os tres consumidores ja passam o e-mail, e
 * remove-lo agora obrigaria a mexer nos tres de novo quando o RBAC entrar.
 */
export function podeVerEventos(_email?: string | null): boolean {
  return true;
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
