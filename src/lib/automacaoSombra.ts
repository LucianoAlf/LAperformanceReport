// Identificação dos registros de SOMBRA em `automacao_log`.
//
// O observador do Emusys roda em paralelo ao n8n. Enquanto um evento não é liberado para
// escrita (`OBSERVADOR_ESCREVE`), ele só registra o payload recebido e o que FARIA — sem
// tocar em nenhuma tabela de negócio. São ~47% das linhas da tabela.
//
// Sem separar, essas linhas aparecem no log de automações como se fossem execuções reais
// — e as de payload bruto (sem `detalhes`) nem expandem, então não há como descobrir que
// são teste. Por isso ficam ocultas por padrão, com toggle.
//
// ⚠️ O critério é a AÇÃO, não o `workflow_id`. A migração do n8n é gradual: o mesmo
// observador vai emitir `processado_sombra` (evento ainda em teste) e `processado`
// (evento já migrado, escrita real) ao mesmo tempo. Filtrar por `workflow_id` esconderia
// as duas — e a partir da virada as reais são operação de verdade, têm que aparecer.

/** Ações que representam sombra/diagnóstico. `processado` (escrita real) NÃO entra. */
export const ACOES_SOMBRA = [
  'processado_sombra',        // preview: o que o observador faria
  'webhook_observado_direto', // cópia crua do payload recebido
] as const;

/** Lista no formato do PostgREST, para `.not('acao', 'in', ACOES_SOMBRA_IN)`.
 *  `automacao_log.acao` é NOT NULL, então `NOT IN` não descarta linha em silêncio. */
export const ACOES_SOMBRA_IN = `(${ACOES_SOMBRA.map(a => `"${a}"`).join(',')})`;

export function ehLogDeSombra(acao: string | null | undefined): boolean {
  if (!acao) return false;
  return (ACOES_SOMBRA as readonly string[]).includes(acao);
}
