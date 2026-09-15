/**
 * Rotulo da unidade no cabecalho mobile — decisao pura, sem JSX.
 *
 * "Consolidado" significa REDE INTEIRA e e escopo exclusivo de admin — nao
 * pode aparecer so porque o nome da unidade esta indisponivel. A fonte da
 * verdade e `filtroAtivo`, o mesmo valor que vai para as RPCs: null e' o
 * unico caso que de fato quer dizer consolidado.
 */

export interface UnidadeParaLabel {
  id: string;
  nome: string | null;
}

export const LABEL_UNIDADE_DESCONHECIDA = 'Unidade';
export const LABEL_CONSOLIDADO = 'Consolidado';

export function labelDaUnidade(
  filtroAtivo: string | null,
  unidadeSelecionada: string | null,
  unidadesDisponiveis: readonly UnidadeParaLabel[],
): string {
  if (filtroAtivo === null) return LABEL_CONSOLIDADO;

  const nome = unidadesDisponiveis.find((u) => u.id === unidadeSelecionada)?.nome;
  return nome ?? LABEL_UNIDADE_DESCONHECIDA;
}
