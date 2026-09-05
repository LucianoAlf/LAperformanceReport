export interface LinhaTicketMedioCanonico {
  mrr: number;
  ticketMedio: number;
  ticketDenominadorPagantes?: number | null;
  ticketDenominadorFaturas?: number | null;
}

function numeroFinito(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function somarDenominadorCompleto(
  rows: LinhaTicketMedioCanonico[],
  selecionar: (row: LinhaTicketMedioCanonico) => number | null | undefined,
): number | null {
  if (rows.length === 0) return null;

  let total = 0;
  for (const row of rows) {
    const valor = numeroFinito(selecionar(row));
    if (valor === null || valor < 0) return null;
    total += valor;
  }
  return total;
}

function arredondarMoeda(value: number): number {
  return Number(value.toFixed(2));
}

export function obterDenominadorTicketCanonico(
  row: LinhaTicketMedioCanonico,
): number | null {
  const contratual = numeroFinito(row.ticketDenominadorPagantes);
  if (contratual !== null && contratual >= 0) return contratual;

  const faturas = numeroFinito(row.ticketDenominadorFaturas);
  if (faturas !== null && faturas >= 0) return faturas;

  const mrr = numeroFinito(row.mrr) ?? 0;
  const ticket = numeroFinito(row.ticketMedio) ?? 0;
  if (mrr === 0) return 0;
  return ticket > 0 ? mrr / ticket : null;
}

/**
 * Consolida ticket sem usar alunosPagantes: esse campo e um KPI
 * administrativo e nao define o universo financeiro do ticket.
 */
export function calcularTicketMedioCanonico(rows: LinhaTicketMedioCanonico[]): number {
  if (rows.length === 0) return 0;

  const totalMrr = rows.reduce((total, row) => total + (numeroFinito(row.mrr) ?? 0), 0);
  const denominadorContratual = somarDenominadorCompleto(
    rows,
    row => row.ticketDenominadorPagantes,
  );
  if (denominadorContratual !== null && denominadorContratual > 0) {
    return arredondarMoeda(totalMrr / denominadorContratual);
  }

  const denominadorFaturas = somarDenominadorCompleto(
    rows,
    row => row.ticketDenominadorFaturas,
  );
  if (denominadorFaturas !== null && denominadorFaturas > 0) {
    return arredondarMoeda(totalMrr / denominadorFaturas);
  }

  // Snapshots antigos nem sempre guardavam o denominador. Neles, preservamos
  // o ticket canonico de cada linha e inferimos apenas o peso da consolidacao;
  // nunca substituimos esse peso por alunosPagantes administrativo.
  let denominadorDerivado = 0;
  for (const row of rows) {
    const mrr = numeroFinito(row.mrr) ?? 0;
    if (mrr <= 0) continue;

    const ticket = numeroFinito(row.ticketMedio) ?? 0;
    if (ticket <= 0) return 0;
    denominadorDerivado += mrr / ticket;
  }

  return denominadorDerivado > 0
    ? arredondarMoeda(totalMrr / denominadorDerivado)
    : 0;
}
