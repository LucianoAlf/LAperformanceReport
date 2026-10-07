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

export interface UnidadeBasica {
  id: string;
  nome: string | null;
}

export interface OpcaoUnidade {
  /** `null` e "Consolidado" — a rede inteira, o mesmo valor que vai as RPCs. */
  id: string | null;
  nome: string;
}

/**
 * As unidades que o seletor do celular pode oferecer.
 *
 * 🔴 **"Consolidado" e EXCLUSIVO de admin.** `p_unidade_id = null` significa a
 * REDE INTEIRA, e as ~213 RPCs `SECURITY DEFINER` que recebem esse parametro
 * confiam nele sem passar por RLS — quem tem duas das tres unidades veria a
 * terceira. Por isso a opcao nula so entra no ramo de admin, e o ramo
 * multi-unidade devolve apenas as unidades da pessoa.
 *
 * ⚠️ Admin e multi-unidade leem de FONTES DIFERENTES, de proposito: o vinculo
 * RBAC do admin e global (`unidade_id NULL`), entao `unidadesPermitidas` vem
 * VAZIA para ele — e usa-la como fonte deixaria o admin com um seletor de uma
 * opcao so. A lista da rede vem do banco (`useUnidadesAtivas`).
 *
 * Quem tem uma unidade so nao tem o que trocar: devolve vazio, e o cabecalho
 * mostra texto em vez de botao.
 */
export function opcoesDeUnidade(
  isAdmin: boolean,
  unidadesPermitidas: readonly UnidadeBasica[],
  unidadesDaRede: readonly UnidadeBasica[],
): OpcaoUnidade[] {
  const nomear = (u: UnidadeBasica): OpcaoUnidade => ({
    id: u.id,
    nome: u.nome ?? LABEL_UNIDADE_DESCONHECIDA,
  });

  if (isAdmin) {
    // Sem a lista da rede ainda (carregando, ou falha), "Consolidado" sozinho
    // nao e escolha nenhuma — melhor nao oferecer o botao do que oferecer uma
    // folha de um item. O erro da carga aparece por outro caminho.
    if (unidadesDaRede.length === 0) return [];
    return [{ id: null, nome: LABEL_CONSOLIDADO }, ...unidadesDaRede.map(nomear)];
  }

  if (unidadesPermitidas.length <= 1) return [];
  return unidadesPermitidas.map(nomear);
}
