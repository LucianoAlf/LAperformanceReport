export interface CaixaAdministrativaSelecionavel {
  funcao: string | null;
  departamento: string | null;
  unidade_id: string | null;
}

export function selecionarCaixaAdministrativa<
  T extends CaixaAdministrativaSelecionavel,
>(
  caixas: readonly T[] | null | undefined,
  unidadeId: string | null | undefined,
  departamento: string,
): T | undefined {
  const elegiveis = (caixas ?? []).filter(
    (caixa) =>
      caixa.funcao === 'administrativo' &&
      caixa.departamento === departamento,
  );

  if (unidadeId) {
    const caixaDaUnidade = elegiveis.find(
      (caixa) => caixa.unidade_id === unidadeId,
    );
    if (caixaDaUnidade) return caixaDaUnidade;
  }

  return elegiveis.find((caixa) => caixa.unidade_id === null);
}
