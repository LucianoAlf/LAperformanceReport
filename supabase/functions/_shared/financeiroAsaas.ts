// Lógica pura do espelho do extrato Asaas (via Emusys beta) — compartilhada por
// sync-asaas-emusys e pelos testes. Nenhuma I/O aqui.
//
// Medido ao vivo 05/10/2026 (probe + handoff do Super Folha):
// - item = espelho cru do financialTransactions da Asaas: id textual "ftn_…",
//   value com sinal, balance que encadeia (anterior + value = balance), type
//   sem lista fechada (PAYMENT_RECEIVED/PAYMENT_FEE/TRANSFER em setembro; a
//   Asaas também emite estorno, chargeback, antecipação etc.).
// - externalReference é por paymentId (o par RECEIVED+FEE repete o valor) e
//   pode vir null; NÃO é o id de /faturas (faixa observada não coincide).
// - description traz o nome do pagador — dado pessoal, entra no hash.

import { canonicalStringify, sha256 } from './contasReceberExport.ts';
import { validarData } from './financeiroEmusys.ts';

export interface ItemExtratoAsaas {
  id: string;
  value: number | string;
  balance: number | string | null;
  type: string;
  date: string;
  description: string | null;
  paymentId: string | null;
  externalReference: string | null;
  transferId: string | null;
  pixTransactionId: string | null;
  splitId: string | null;
  anticipationId: string | null;
  billId: string | null;
  invoiceId: string | null;
  paymentDunningId: string | null;
  creditBureauReportId: string | null;
}

export interface ItemExtratoEspelhado {
  unidade_id: string;
  convenio_id: number;
  asaas_id: string;
  data: string;
  valor: number;
  balance: number | null;
  tipo: string;
  descricao: string | null;
  payment_id: string | null;
  external_reference: string | null;
  transfer_id: string | null;
  pix_transaction_id: string | null;
  split_id: string | null;
  anticipation_id: string | null;
  bill_id: string | null;
  invoice_id: string | null;
  payment_dunning_id: string | null;
  credit_bureau_report_id: string | null;
  posicao_dia: number;
  payload: unknown;
  hash_conteudo: string;
}

const textoOuNull = (valor: unknown): string | null => {
  const texto = String(valor ?? '').trim();
  return texto || null;
};

const numeroOuErro = (valor: unknown, campo: string, id: string): number => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error(`${campo} invalido no item ${id}: ${String(valor)}`);
  }
  return numero;
};

const convenioIdValido = (valor: unknown): number => {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero <= 0) {
    throw new Error(`convenio_id invalido: ${String(valor)}`);
  }
  return numero;
};

// type vem aberto pela Asaas — rejeitamos só vazio/nulo, nunca o valor em si.
const tipoValido = (valor: unknown, id: string): string => {
  const tipo = textoOuNull(valor);
  if (!tipo) throw new Error(`type ausente no item ${id}`);
  return tipo;
};

export async function mapearItemExtrato(
  cru: ItemExtratoAsaas,
  unidadeId: string,
  convenioId: number,
  posicaoDia: number,
): Promise<ItemExtratoEspelhado> {
  const asaasId = textoOuNull(cru.id);
  if (!asaasId) throw new Error('item de extrato sem id (ftn_…)');

  const linha = {
    data: validarData(cru.date),
    valor: numeroOuErro(cru.value, 'value', asaasId),
    balance: cru.balance == null ? null : numeroOuErro(cru.balance, 'balance', asaasId),
    tipo: tipoValido(cru.type, asaasId),
    descricao: textoOuNull(cru.description),
    payment_id: textoOuNull(cru.paymentId),
    external_reference: textoOuNull(cru.externalReference),
    transfer_id: textoOuNull(cru.transferId),
    pix_transaction_id: textoOuNull(cru.pixTransactionId),
    split_id: textoOuNull(cru.splitId),
    anticipation_id: textoOuNull(cru.anticipationId),
    bill_id: textoOuNull(cru.billId),
    invoice_id: textoOuNull(cru.invoiceId),
    payment_dunning_id: textoOuNull(cru.paymentDunningId),
    credit_bureau_report_id: textoOuNull(cru.creditBureauReportId),
  };
  return {
    ...linha,
    unidade_id: unidadeId,
    convenio_id: convenioId,
    asaas_id: asaasId,
    posicao_dia: posicaoDia,
    payload: cru,
    hash_conteudo: await sha256(linha),
  };
}

export function mapearConvenio(cru: Record<string, unknown>): {
  convenio_id: number;
  status: string | null;
  conta_emusys_id: number | null;
  conta_descricao: string | null;
  conta_banco: string | null;
  conta_agencia: string | null;
  conta_numero: string | null;
  conta_titular: string | null;
} {
  const conta = (cru.conta_bancaria ?? null) as Record<string, unknown> | null;
  const contaId = conta?.id == null ? null : Number(conta.id);
  if (contaId != null && !Number.isSafeInteger(contaId)) {
    throw new Error(`conta_bancaria.id invalido no convenio ${String(cru.id)}`);
  }
  return {
    convenio_id: convenioIdValido(cru.id),
    status: textoOuNull(cru.status),
    conta_emusys_id: contaId,
    conta_descricao: textoOuNull(conta?.descricao),
    conta_banco: textoOuNull(conta?.banco),
    conta_agencia: textoOuNull(conta?.agencia),
    conta_numero: textoOuNull(conta?.numero),
    conta_titular: textoOuNull(conta?.titular),
  };
}

// ── cadeia de balance ─────────────────────────────────────────────────────────
// Regra medida: balance(anterior) + value = balance do item seguinte, sem
// quebra (0 quebras em 1.388 linhas de setembro). Quebra = erro de varredura.

export interface ItemCadeia {
  asaas_id: string;
  data: string;
  valor: number;
  balance: number | null;
}

export interface QuebraCadeia {
  data: string;             // dia onde a quebra aconteceu (item da direita)
  asaas_id: string;
  esperado: number | null;  // balance esperado = anterior + value
  encontrado: number | null;
}

const TOLERANCIA_CENTAVO = 0.005;

export function verificarCadeiaBalance(
  itensEmOrdem: ItemCadeia[],
  saldoAnterior: number | null = null,
): QuebraCadeia[] {
  const quebras: QuebraCadeia[] = [];
  let saldo: number | null = saldoAnterior;
  for (const item of itensEmOrdem) {
    if (saldo != null && item.balance != null) {
      const esperado = Math.round((saldo + item.valor) * 100) / 100;
      if (Math.abs(esperado - item.balance) > TOLERANCIA_CENTAVO) {
        quebras.push({
          data: item.data,
          asaas_id: item.asaas_id,
          esperado,
          encontrado: item.balance,
        });
      }
    }
    // item sem balance não quebra a cadeia: o valor continua acumulando —
    // o próximo item com balance deve fechar com saldo + soma dos valores
    saldo = item.balance != null
      ? item.balance
      : saldo == null ? null : Math.round((saldo + item.valor) * 100) / 100;
  }
  return quebras;
}

export { canonicalStringify, sha256 };
