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

const dataUtc = (data: string): Date => {
  if (!DATA_PATTERN.test(data)) throw new Error(`data invalida: ${data}`);
  const valor = new Date(`${data}T00:00:00Z`);
  if (Number.isNaN(valor.getTime()) || valor.toISOString().slice(0, 10) !== data) {
    throw new Error(`data invalida: ${data}`);
  }
  return valor;
};

const isoData = (data: Date): string => data.toISOString().slice(0, 10);

export function janelaRotinaDiaria(hojeBrt: string): { inicio: string; fim: string } {
  const hoje = dataUtc(hojeBrt);
  const fim = new Date(hoje);
  fim.setUTCDate(fim.getUTCDate() - 1);
  const inicio = new Date(hoje);
  inicio.setUTCDate(inicio.getUTCDate() - 10);
  return { inicio: isoData(inicio), fim: isoData(fim) };
}

export function janelaRevarreduraSemanal(hojeBrt: string): { inicio: string; fim: string } {
  const hoje = dataUtc(hojeBrt);
  const fim = new Date(hoje);
  fim.setUTCDate(fim.getUTCDate() - 1);
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  return { inicio: isoData(inicio), fim: isoData(fim) };
}

export function validarJanelaEncerrada(
  inicio: string,
  fim: string,
  hojeBrt: string,
): { inicio: string; fim: string } {
  dataUtc(hojeBrt);
  resumoJanela(inicio, fim);
  if (fim >= hojeBrt) {
    throw new Error(`DIA_CORRENTE_NAO_ENCERRADO: data_final ${fim} deve ser anterior a ${hojeBrt}`);
  }
  return { inicio, fim };
}

export function dividirJanela(
  inicio: string,
  fim: string,
  tamanhoMaximo = 10,
): Array<{ inicio: string; fim: string }> {
  if (!Number.isInteger(tamanhoMaximo) || tamanhoMaximo < 1) {
    throw new Error(`tamanho de bloco invalido: ${tamanhoMaximo}`);
  }
  const dias = resumoJanela(inicio, fim);
  const blocos: Array<{ inicio: string; fim: string }> = [];
  for (let indice = 0; indice < dias.length; indice += tamanhoMaximo) {
    const bloco = dias.slice(indice, indice + tamanhoMaximo);
    blocos.push({ inicio: bloco[0], fim: bloco.at(-1)! });
  }
  return blocos;
}

export { canonicalStringify, sha256 };
