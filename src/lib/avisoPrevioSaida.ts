/**
 * Regra unica da data de saida do aviso previo.
 *
 * Existe porque a tela lia um campo e o formulario editava outro. A coluna
 * "Venceu" (RPC `aviso_previo_vencidos`) e a lista da Sol (`aviso_previo_pendencias`)
 * usam `coalesce(data_prevista_saida, mes_saida - 1)` — ou seja, com a data
 * prevista preenchida o `mes_saida` NAO tem efeito nenhum na leitura. O
 * `ModalAvisoPrevio` so oferecia o select de mes, entao quem tentava remarcar
 * a saida mexia no campo que ninguem le.
 *
 * Caso medido (audit_log, 03/09/2026): a consultora editou o Andre de Mello
 * Gomes, `mes_saida` out -> nov, e `data_prevista_saida` ficou 31/10 intacto.
 * A tela continuou cobrando a data velha.
 *
 * A partir daqui a DATA MANDA: preenchida, o mes e derivado dela e os dois
 * nunca divergem. Sem data (aviso lancado a mao, que a tela marca com "~" de
 * estimada), o mes escolhido continua valendo sozinho, como sempre valeu.
 */

/** `Date` -> `YYYY-MM-DD` no fuso local. `toISOString()` nao serve: ele converte
 *  para UTC e, em BRT (UTC-3), joga a data para o dia anterior a noite. */
export function paraISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Primeiro dia do mes de uma data `YYYY-MM-DD`. É o formato que
 *  `movimentacoes_admin.mes_saida` guarda. */
export function mesSaidaDaDataPrevista(dataPrevistaISO: string | null): string | null {
  if (!dataPrevistaISO) return null;
  const casa = /^(\d{4})-(\d{2})-\d{2}$/.exec(dataPrevistaISO.slice(0, 10));
  if (!casa) return null;
  return `${casa[1]}-${casa[2]}-01`;
}

/**
 * O par (data prevista, mes de saida) que deve ser gravado.
 *
 * Um lugar so decide, para o formulario e qualquer consumidor futuro nao
 * reimplementarem a derivacao com regras proprias — que e exatamente a
 * origem das duplicatas de renovacao deste repo.
 */
export function derivarSaidaAvisoPrevio(
  dataPrevistaISO: string | null,
  mesSaidaEscolhido: string | null,
): { data_prevista_saida: string | null; mes_saida: string | null } {
  const derivado = mesSaidaDaDataPrevista(dataPrevistaISO);
  if (derivado) {
    return { data_prevista_saida: dataPrevistaISO!.slice(0, 10), mes_saida: derivado };
  }
  return { data_prevista_saida: null, mes_saida: mesSaidaEscolhido || null };
}

/**
 * A data que a tela mostra como vencimento, espelhando o
 * `coalesce(data_prevista_saida, mes_saida - 1)` do banco.
 *
 * Serve para o formulario poder avisar o usuario qual data ele esta mexendo
 * sem inventar uma segunda regra de leitura.
 */
export function fimDoAviso(
  dataPrevistaISO: string | null,
  mesSaidaISO: string | null,
): string | null {
  if (dataPrevistaISO) return dataPrevistaISO.slice(0, 10);
  if (!mesSaidaISO) return null;
  const casa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mesSaidaISO.slice(0, 10));
  if (!casa) return null;
  // `mes_saida - 1` em SQL: o dia anterior ao primeiro do mes, ou seja o
  // ultimo dia do mes ANTERIOR. Reproduzido aqui sem `Date` para nao
  // depender de fuso.
  const [, ano, mes, dia] = casa;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
