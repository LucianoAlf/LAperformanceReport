/**
 * O status operacional do aluno — a regra que decide o que a tela SINALIZA.
 *
 * Morava como função privada dentro de `TabelaAlunos.tsx`. Saiu de lá quando a
 * tela do celular precisou do mesmo selo: copiar produziria duas versões da
 * mesma regra de negócio, que é a causa-raiz documentada das duplicatas de
 * renovação (CLAUDE.md, "Regras Importantes"). O comportamento é idêntico ao
 * que o desktop tinha — isto é extração, não mudança.
 */

export interface AlunoStatusFonte {
  status?: string | null;
  status_pagamento?: string | null;
}

/**
 * Inadimplência só descreve quem ainda está na casa. Quem evadiu devendo
 * continua devendo, mas cobrar na lista de alunos aponta para uma matrícula
 * que não existe mais — o lugar disso é o financeiro.
 */
export function isMatriculaAtivaParaInadimplencia(aluno: { status?: string | null }): boolean {
  return String(aluno.status || '').toLowerCase() === 'ativo';
}

/**
 * Devolve o `status_pagamento` que a tela pode exibir, ou `null` quando ele
 * não se aplica àquela matrícula.
 */
export function getStatusPagamentoOperacional(aluno: AlunoStatusFonte): string | null {
  const statusPagamento = aluno.status_pagamento || null;
  if (statusPagamento === 'inadimplente' && !isMatriculaAtivaParaInadimplencia(aluno)) return null;
  return statusPagamento;
}
