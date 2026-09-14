// Lógica pura do espelho financeiro do Emusys (beta) — compartilhada por
// sync-financeiro-emusys e pelos testes. Nenhuma I/O aqui.

import { canonicalStringify, sha256 } from './contasReceberExport.ts';

export const NATUREZAS = ['entrada', 'saida', 'transferencia', 'estorno', 'estornado'] as const;
export type NaturezaFinanceiro = typeof NATUREZAS[number];

export const DATA_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO_PLANO_PATTERN = /^\s*(\d+(?:\.\d+)*)\b/;

export interface LancamentoEmusys {
  id: number | string;
  data: string;
  valor: number | string;
  natureza: string;
  conta: { id: number | string | null; descricao: string | null } | null;
  plano_contas: { id: number | string | null; nome: string | null } | null;
  forma_pagamento: { id: number | string | null; descricao: string | null } | null;
  descricao: string | null;
}

export interface LancamentoEspelhado {
  unidade_id: string;
  emusys_lancamento_id: number;
  data: string;
  valor: number;
  natureza: NaturezaFinanceiro;
  conta_emusys_id: number | null;
  conta_descricao: string | null;
  plano_emusys_id: number | null;
  plano_nome: string | null;
  plano_codigo: string | null;
  forma_pagamento_emusys_id: number | null;
  forma_pagamento_descricao: string | null;
  descricao: string | null;
  payload: unknown;
  hash_conteudo: string;
}

export const extrairCodigoPlano = (nome: unknown): string | null => {
  const texto = String(nome ?? '');
  const match = texto.match(CODIGO_PLANO_PATTERN);
  return match ? match[1] : null;
};

const idEmusys = (valor: unknown, campo: string): number => {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < -2147483648 || numero > 9007199254740991) {
    throw new Error(`${campo} nao e um id Emusys seguro: ${String(valor)}`);
  }
  return numero;
};

const idOpcional = (valor: unknown): number | null => {
  if (valor == null || String(valor).trim() === '') return null;
  return idEmusys(valor, 'id opcional');
};

const textoOpcional = (valor: unknown): string | null => {
  const texto = String(valor ?? '').trim();
  return texto || null;
};

export function validarNatureza(valor: unknown): NaturezaFinanceiro {
  const natureza = String(valor ?? '').trim().toLowerCase() as NaturezaFinanceiro;
  if (!NATUREZAS.includes(natureza)) {
    throw new Error(`natureza desconhecida do Emusys: ${String(valor)}`);
  }
  return natureza;
}

export function validarData(valor: unknown): string {
  const data = String(valor ?? '').trim();
  if (!DATA_PATTERN.test(data)) throw new Error(`data invalida no lancamento: ${String(valor)}`);
  return data;
}

export function hashLancamento(payload: {
  data: string;
  valor: number;
  natureza: NaturezaFinanceiro;
  conta_emusys_id: number | null;
  conta_descricao: string | null;
  plano_emusys_id: number | null;
  plano_nome: string | null;
  forma_pagamento_emusys_id: number | null;
  forma_pagamento_descricao: string | null;
  descricao: string | null;
}) {
  return sha256(payload);
}

export async function mapearLancamento(
  cru: LancamentoEmusys,
  unidadeId: string,
): Promise<LancamentoEspelhado> {
  const linha = {
    data: validarData(cru.data),
    valor: Number(cru.valor ?? 0),
    natureza: validarNatureza(cru.natureza),
    conta_emusys_id: idOpcional(cru.conta?.id),
    // conta de repasse vem com descricao '' — guardar null para não fingir cadastro
    conta_descricao: textoOpcional(cru.conta?.descricao),
    plano_emusys_id: idOpcional(cru.plano_contas?.id),
    plano_nome: textoOpcional(cru.plano_contas?.nome),
    plano_codigo: extrairCodigoPlano(cru.plano_contas?.nome),
    forma_pagamento_emusys_id: idOpcional(cru.forma_pagamento?.id),
    forma_pagamento_descricao: textoOpcional(cru.forma_pagamento?.descricao),
    descricao: textoOpcional(cru.descricao),
  };
  if (!Number.isFinite(linha.valor)) {
    throw new Error(`valor invalido no lancamento ${cru.id}: ${String(cru.valor)}`);
  }
  return {
    ...linha,
    unidade_id: unidadeId,
    emusys_lancamento_id: idEmusys(cru.id, 'lancamento.id'),
    payload: cru,
    hash_conteudo: await hashLancamento(linha),
  };
}

export interface LinhaCatalogo {
  hash_conteudo: string;
  payload: unknown;
}

export async function mapearCatalogo(valores: Record<string, unknown>, cru: unknown): Promise<LinhaCatalogo> {
  return {
    ...JSON.parse(JSON.stringify(valores)),
    payload: cru,
    hash_conteudo: await sha256(valores),
  };
}

export function resumoJanela(inicio: string, fim: string): string[] {
  if (!DATA_PATTERN.test(inicio) || !DATA_PATTERN.test(fim) || inicio > fim) {
    throw new Error(`janela de varredura invalida: ${inicio} .. ${fim}`);
  }
  const dias: string[] = [];
  const cursor = new Date(`${inicio}T00:00:00Z`);
  const limite = new Date(`${fim}T00:00:00Z`);
  // guarda contra loop infinito em janela absurda
  for (let guard = 0; cursor <= limite && guard < 5000; guard += 1) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

export function janelaRotinaDiaria(hojeBrt: string): { inicio: string; fim: string } {
  if (!DATA_PATTERN.test(hojeBrt)) throw new Error(`hojeBrt invalido: ${hojeBrt}`);
  const [ano, mes] = hojeBrt.split('-').map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 3, 1)); // mês corrente + 2 anteriores
  return { inicio: inicio.toISOString().slice(0, 10), fim: hojeBrt };
}

export { canonicalStringify, sha256 };
