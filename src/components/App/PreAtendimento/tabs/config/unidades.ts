/**
 * Unidades atendidas pelas configurações do Pré-Atendimento.
 *
 * Mantido como mapa fixo (e não buscado de `unidades`) porque era assim que a
 * tela funcionava antes da repaginação — trocar a fonte agora misturaria uma
 * mudança de dado com a reorganização visual.
 */
export const UNIDADES: Record<string, string> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
};

export const UNIDADE_IDS = Object.keys(UNIDADES);

/** Primeira unidade real, usada quando o filtro global está em "Consolidado". */
export function resolverUnidadeInicial(unidadeId: string): string {
  return unidadeId !== 'todos' && UNIDADES[unidadeId] ? unidadeId : UNIDADE_IDS[0];
}
