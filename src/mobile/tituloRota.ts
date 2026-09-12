/**
 * Titulo do cabecalho mobile a partir da ROTA — decisao pura, sem JSX, para
 * ser testavel com import real (nao so regex sobre o arquivo).
 *
 * Existe porque o PageTitleProvider nunca foi alimentado (zero produtores em
 * todo o app — busca por `useSetPageTitle`/`setPageTitle` so acha consumidor).
 * No desktop isso e invisivel (a sidebar marca onde voce esta); no mobile o
 * cabecalho e a UNICA identificacao da tela, e sem este fallback ele diria
 * "LA Report" para sempre em qualquer modulo alcancado só pelo "Mais".
 */

export interface ItemComTitulo {
  path: string;
  label: string;
  /** so a raiz ('/app') usa isto — sem ele, toda rota colaria o rotulo do Dashboard. */
  end?: boolean;
}

export const TITULO_PADRAO = 'LA Report';

export function tituloDaRota(pathname: string, itens: readonly ItemComTitulo[]): string {
  const item = itens.find((i) =>
    i.end ? pathname === i.path : pathname === i.path || pathname.startsWith(`${i.path}/`),
  );
  return item?.label ?? TITULO_PADRAO;
}
