/**
 * Carteiras da aba Comissões da Lojinha, no celular (LAPE-32, 29/09/2026).
 *
 * ⚠️ Recorte declarado: o celular mostra só o que vem do banco — o saldo e as
 * Lalitas de cada carteira, e as ações sobre ela. Os cartões do topo, o
 * instrumento do professor, o "N vendas este mês" e o histórico de
 * movimentações da tela do computador são valores escritos no código (dados
 * de exemplo), e não foram trazidos para cá. O computador não foi alterado.
 */

import type { LojaCarteira } from '@/types/lojinha';

/** Quanto vale uma Lalita, em reais — o mesmo 30 do cartão do computador. */
export const VALOR_LALITA = 30;

/** O nome que a carteira mostra: apelido do farmer, nome do professor. */
export function nomeDaCarteira(c: LojaCarteira): string {
  if (c.tipo_titular === 'farmer') return c.colaboradores?.apelido || c.colaboradores?.nome || 'Farmer';
  return c.professores?.nome || 'Professor';
}

/**
 * A consulta não pede ordem, então o banco devolve como quiser — e a lista
 * trocaria de ordem entre um carregamento e outro. Aqui é por nome.
 */
export function ordenarCarteiras(carteiras: readonly LojaCarteira[]): LojaCarteira[] {
  return [...carteiras].sort(
    (a, b) => nomeDaCarteira(a).localeCompare(nomeDaCarteira(b), 'pt-BR') || String(a.id).localeCompare(String(b.id)),
  );
}

/** `R$ 1.234,50` */
export function formatarSaldo(valor: number | string | null | undefined): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
