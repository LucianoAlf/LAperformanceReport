export type TipoMatriculaSugerido = "BOLSISTA_INT" | "BOLSISTA_PARC" | null;

export interface AnaliseFinanceiraContrato {
  valorCheio: number | null;
  descontoFixo: number;
  descontoCondicional: number;
  valorTotal: number | null;
  nrFaturas: number | null;
  bolsa: boolean;
  temCobrancaAutomatica: boolean;
  parcelaTabela: number | null;
  liquidoFinanceiro: number | null;
  parcelaCanonica: number | null;
  statusPagamentoCanonico: "sem_parcela" | null;
  tipoSugerido: TipoMatriculaSugerido;
  bolsaIntegral: boolean;
  bolsaParcial: boolean;
  contratoSemFaturaSemCobranca: boolean;
  bloqueiaValorAutomatico: boolean;
}

function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function numeroOuZero(valor: unknown): number {
  return numeroOuNull(valor) ?? 0;
}

function arredondarMoeda(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function existeCobrancaAutomatica(cobranca: any): boolean {
  if (!cobranca) return false;
  return Boolean(
    String(cobranca.status ?? "").trim() ||
    String(cobranca.forma_pagamento ?? "").trim() ||
    String(cobranca.id ?? "").trim()
  );
}

export function analisarFinanceiroContrato(matricula: any): AnaliseFinanceiraContrato {
  const contrato = matricula?.contrato_atual || {};
  const valorCheio = numeroOuNull(contrato.valor_mensalidade);
  const descontoFixo = numeroOuZero(contrato.desconto_fixo);
  const descontoCondicional = numeroOuZero(contrato.desconto_condicional);
  const valorTotal = numeroOuNull(contrato.valor_total);
  const nrFaturas = numeroOuNull(contrato.nr_faturas);
  const bolsa = contrato.bolsa === true;
  const temCobrancaAutomatica = existeCobrancaAutomatica(matricula?.cobranca_automatica);

  const parcelaTabela = valorCheio !== null
    ? arredondarMoeda(valorCheio - descontoCondicional)
    : null;
  const liquidoFinanceiro = valorCheio !== null
    ? arredondarMoeda(valorCheio - descontoFixo - descontoCondicional)
    : null;

  const semFatura = nrFaturas === 0 || valorTotal === 0;
  const contratoSemFaturaSemCobranca = semFatura && !temCobrancaAutomatica;
  const bolsaIntegral = bolsa && (
    contratoSemFaturaSemCobranca ||
    (parcelaTabela !== null && parcelaTabela <= 0)
  );
  const bolsaParcial = bolsa && !bolsaIntegral;
  const contratoRegularSemFatura = !bolsa && contratoSemFaturaSemCobranca && (valorCheio ?? 0) > 0;

  return {
    valorCheio,
    descontoFixo,
    descontoCondicional,
    valorTotal,
    nrFaturas,
    bolsa,
    temCobrancaAutomatica,
    parcelaTabela,
    liquidoFinanceiro,
    parcelaCanonica: bolsaIntegral
      ? 0
      : contratoRegularSemFatura
        ? null
        : parcelaTabela,
    statusPagamentoCanonico: (bolsaIntegral || contratoRegularSemFatura) ? "sem_parcela" : null,
    tipoSugerido: bolsaIntegral ? "BOLSISTA_INT" : bolsaParcial ? "BOLSISTA_PARC" : null,
    bolsaIntegral,
    bolsaParcial,
    contratoSemFaturaSemCobranca,
    bloqueiaValorAutomatico: contratoRegularSemFatura,
  };
}

export function deveIgnorarStatusFinanceiroPorTipo(
  tipoCodigo: string | null | undefined,
  statusNosso: string | null | undefined,
  statusEmusys: string | null | undefined,
): boolean {
  const tipo = String(tipoCodigo ?? "").trim().toUpperCase();
  const nosso = String(statusNosso ?? "").trim().toLowerCase();
  const emusys = String(statusEmusys ?? "").trim().toLowerCase();

  return (tipo === "BANDA" || tipo === "BOLSISTA_INT") &&
    nosso === "sem_parcela" &&
    emusys === "em_dia";
}
