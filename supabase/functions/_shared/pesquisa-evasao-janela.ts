/**
 * Janela de resposta da pesquisa de evasao -- FONTE UNICA.
 *
 * ⚠️ Esta regra existe porque ela ja divergiu entre dois motores e custou um
 * feedback real. Ate 31/08/2026 a `dentroDaJanela` do webhook media os 7 dias a
 * partir de `pesquisa_evasao.enviado_em` (o PRIMEIRO toque), enquanto a
 * consolidacao ja contava do ultimo toque. Como a repescagem sai semanas depois
 * do 1o toque, TODA resposta a um 2o toque era recusada pelo motor novo, caia no
 * fallback legado e era gravada sem criar analise -- e sem analise a tela nao tem
 * o que classificar.
 *
 * Caso medido: Heitor, 1o toque 05/08 10:33, resposta 31/08 10:38 = 26 dias
 * contra um limite de 7. A resposta chegou 6 minutos depois da repescagem.
 *
 * NAO reimplementar esta conta em nenhum consumidor. Duas fontes de escrita com
 * regras proprias para o mesmo campo e a causa-raiz documentada das duplicatas de
 * renovacao neste mesmo repositorio -- e foi exatamente o que aconteceu aqui.
 */

export const JANELA_RESPOSTA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * De que instante a janela conta. E o toque mais recente que a pessoa recebeu:
 * o 1o envio, ou a repescagem, se ela existir e for posterior.
 *
 * ⚠️ Compara as datas em vez de confiar na ordem: a fila de repescagem pode ter
 * `criado_em` anterior ao envio original em cenario de backfill, e nesse caso o
 * 1o toque continua sendo a referencia correta.
 */
export function referenciaDaJanela(
  enviadoEm: string | null,
  ultimaSaidaEm: string | null,
): string | null {
  if (!enviadoEm) return ultimaSaidaEm;
  if (!ultimaSaidaEm) return enviadoEm;
  const envio = Date.parse(enviadoEm);
  const saida = Date.parse(ultimaSaidaEm);
  if (!Number.isFinite(saida)) return enviadoEm;
  if (!Number.isFinite(envio)) return ultimaSaidaEm;
  return saida > envio ? ultimaSaidaEm : enviadoEm;
}

/**
 * A mensagem recebida cai dentro da janela do ultimo toque?
 *
 * ⚠️ `recebimento >= referencia` continua valendo: mensagem anterior ao toque nao
 * pode ser resposta dele. Com a referencia agora sendo a repescagem, isso tambem
 * impede que uma conversa anterior ao 2o toque seja adotada como resposta dele.
 */
export function dentroDaJanelaDeResposta(
  referencia: string | null,
  recebidoEm: string,
): boolean {
  if (!referencia) return false;
  const inicio = Date.parse(referencia);
  const recebimento = Date.parse(recebidoEm);
  if (!Number.isFinite(inicio) || !Number.isFinite(recebimento)) return false;
  return recebimento >= inicio &&
    recebimento - inicio <= JANELA_RESPOSTA_MS;
}
