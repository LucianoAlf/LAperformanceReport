/**
 * Histórico de Vendas da Lojinha — fonte única do computador e do celular
 * (LAPE-32, 29/09/2026).
 *
 * 🔴 Por que existe. O histórico lia SÓ `loja_vendas`, que é o que o "Novo
 * Pedido" grava — e o Novo Pedido não é usado desde 20/05/2026 (10 vendas no
 * total). A equipe vende pela Sol, no grupo do WhatsApp, e a venda cai no
 * caixa (`caixa_movimentacoes`, categoria `lojinha`): 58 entradas de venda,
 * a última de ontem. A tela mostrava a fonte morta e nenhuma da viva.
 *
 * Aqui as duas fontes viram uma lista só, cada linha dizendo de onde veio.
 * Nenhuma é descartada: a venda do PDV tem itens e estorno; a do caixa tem só
 * a descrição que a Sol escreveu — e é corrigida no Caixa, não aqui.
 *
 * ⚠️ Nada aqui busca dado. São funções puras sobre o que a `TabVendas` leu.
 */

import type { LojaVenda } from '@/types/lojinha';

/** O subconjunto de uma linha de `caixa_movimentacoes` que o histórico lê. */
export interface MovimentoCaixaLojinha {
  id: string;
  data_movimento: string; // YYYY-MM-DD, já é data de negócio
  created_at: string;
  forma_pagamento: string | null;
  descricao: string | null;
  valor: number | string;
  responsavel: string | null;
}

export type OrigemVenda = 'pdv' | 'caixa';

export interface VendaHistorico {
  chave: string;
  origem: OrigemVenda;
  /** Dia da venda em BRT (YYYY-MM-DD) — é o que decide "hoje" e "mês". */
  dia: string;
  /** Instante para ordenar; no caixa é o registro, no PDV a venda. */
  instante: string;
  /**
   * Quem comprou, quando a fonte diz. O PDV tem o campo; o caixa NÃO — a Sol
   * escreve produto e cliente no mesmo texto livre, e separar os dois seria
   * chute. Por isso `null`, e a tela mostra a descrição inteira.
   */
  cliente: string | null;
  /** Os itens (PDV) ou a descrição que a Sol escreveu (caixa). */
  detalhe: string;
  total: number;
  forma: string;
  vendedor: string | null;
  estornada: boolean;
  /** A venda do PDV original, para abrir detalhes e estorno. */
  vendaPdv: LojaVenda | null;
}

/** Quanto tempo o histórico cobre. Três meses: o mês corrente e dois antes. */
export const MESES_DE_HISTORICO = 3;

/** `YYYY-MM-DD` de um instante, no fuso de Brasília. */
export function diaBrt(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  // en-CA formata como YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * O primeiro dia da janela do histórico (BRT): dia 1º de dois meses atrás.
 * 🔴 Antes era `limit(50)` sem data — e os cartões chamavam isso de "mês".
 */
export function inicioDaJanela(agora: Date = new Date(), meses = MESES_DE_HISTORICO): string {
  const [ano, mes] = diaBrt(agora).split('-').map(Number);
  const total = ano * 12 + (mes - 1) - (meses - 1);
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

const FORMA_ROTULO: Record<string, string> = {
  pix: 'Pix',
  credito: 'Cartão',
  cartao: 'Cartão',
  debito: 'Débito',
  folha: 'Desc. Folha',
  dinheiro: 'Dinheiro',
  saldo: 'Saldo',
  cheque: 'Cheque',
  link: 'Link',
};

/** Mesmos rótulos do selo do computador; forma desconhecida aparece como veio. */
export function rotuloForma(forma: string | null | undefined): string {
  if (!forma) return '—';
  return FORMA_ROTULO[forma] ?? forma;
}

/**
 * A descrição do caixa sem o prefixo que a Sol põe em todas
 * ("Lojinha/Venda - ", "Lojinha - ") e sem a etiqueta técnica do backfill
 * (`[pix:95ead4fa]`). Repetir "Lojinha" em toda linha de uma lista de
 * lojinha não diz nada.
 */
export function limparDescricaoCaixa(descricao: string | null | undefined): string {
  return (descricao ?? '')
    .replace(/^\s*lojinha(\s*\/\s*venda)?\s*-\s*/i, '')
    .replace(/\s*\[[a-z]+:[0-9a-f]+\]\s*$/i, '')
    .trim();
}

export function vendaDoPdv(v: LojaVenda): VendaHistorico {
  return {
    chave: `pdv:${v.id}`,
    origem: 'pdv',
    dia: diaBrt(v.data_venda),
    instante: v.data_venda,
    cliente: v.cliente_nome || v.alunos?.nome || 'Avulso',
    detalhe: v.loja_vendas_itens?.map((i) => `${i.quantidade}x ${i.produto_nome}`).join(', ') || '—',
    total: Number(v.total) || 0,
    forma: rotuloForma(v.forma_pagamento),
    vendedor: v.vendedor?.apelido || v.vendedor?.nome || null,
    estornada: v.status === 'estornada',
    vendaPdv: v,
  };
}

export function vendaDoCaixa(m: MovimentoCaixaLojinha): VendaHistorico {
  return {
    chave: `caixa:${m.id}`,
    origem: 'caixa',
    dia: m.data_movimento,
    instante: m.created_at,
    cliente: null,
    detalhe: limparDescricaoCaixa(m.descricao) || '—',
    total: Number(m.valor) || 0,
    forma: rotuloForma(m.forma_pagamento),
    vendedor: m.responsavel?.trim() || null,
    estornada: false,
    vendaPdv: null,
  };
}

/** As duas fontes numa lista só, da mais recente para a mais antiga. */
export function juntarHistorico(
  pdv: readonly LojaVenda[],
  caixa: readonly MovimentoCaixaLojinha[],
): VendaHistorico[] {
  return [...pdv.map(vendaDoPdv), ...caixa.map(vendaDoCaixa)].sort(
    (a, b) => b.dia.localeCompare(a.dia) || b.instante.localeCompare(a.instante) || a.chave.localeCompare(b.chave),
  );
}

/**
 * O que "Buscar venda..." encontra: cliente, produtos/descrição, vendedor.
 * 🔴 Até 29/09/2026 a caixa guardava o texto e não filtrava nada.
 * Mesma comparação das outras buscas da Lojinha (`toLowerCase` + `includes`).
 */
export function filtrarHistorico(vendas: readonly VendaHistorico[], busca: string): VendaHistorico[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return [...vendas];
  return vendas.filter((v) =>
    [v.cliente ?? '', v.detalhe, v.vendedor ?? '', v.forma].some((t) => t.toLowerCase().includes(termo)),
  );
}

export interface ResumoHistorico {
  hojeTotal: number;
  hojeQtd: number;
  mesTotal: number;
  mesQtd: number;
  ticketMedio: number;
  /** "Setembro/2026" — o mês de verdade, não um texto fixo. */
  mesRotulo: string;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Os cartões do topo.
 *
 * 🔴 Antes: "Vendas Fev/2026" com o mês escrito no código e a soma das
 * últimas 50 vendas; "Vendas Hoje" em UTC (das 21h à meia-noite contava o
 * dia seguinte). Aqui hoje e mês são do calendário de Brasília, e estornada
 * não soma.
 */
export function resumirHistorico(vendas: readonly VendaHistorico[], agora: Date = new Date()): ResumoHistorico {
  const hoje = diaBrt(agora);
  const mes = hoje.slice(0, 7);
  const validas = vendas.filter((v) => !v.estornada);
  const doDia = validas.filter((v) => v.dia === hoje);
  const doMes = validas.filter((v) => v.dia.startsWith(mes));
  const soma = (l: VendaHistorico[]) => l.reduce((acc, v) => acc + v.total, 0);
  const mesTotal = soma(doMes);
  const [ano, m] = mes.split('-').map(Number);
  return {
    hojeTotal: soma(doDia),
    hojeQtd: doDia.length,
    mesTotal,
    mesQtd: doMes.length,
    ticketMedio: doMes.length > 0 ? mesTotal / doMes.length : 0,
    mesRotulo: `${MESES[m - 1]}/${ano}`,
  };
}

/** `R$ 1.234,50` */
export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** `24/09` — o dia do negócio, sem hora (o caixa não guarda a hora da venda). */
export function formatarDiaCurto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}
