/**
 * Regras da aba CONTRATOS no celular (LAPE-32).
 *
 * A tela do computador responde "quais contratos vencem na janela X", com nove
 * colunas e ordenacao livre. No balcao a pergunta e outra e mais estreita:
 * **quem eu chamo para renovar, e em que ordem**. Por isso o corte aqui e de
 * CONTEUDO, nao de largura — mesma decisao da fila da Chamada.
 *
 * 🔴 O que a tela pequena faz e a grande nao: `telefone` e `whatsapp` JA chegam
 * em `ContratoVencendo` e a tabela do desktop **descarta os dois** (conferido:
 * `TabContratosVencendo.tsx` nao menciona nenhum). Num telefone, "quem eu chamo"
 * tem resposta literal — um toque abre a conversa. E o mesmo tipo de ganho de
 * `colisoesDeSala` na Agenda: a tela menor diz mais, nao menos.
 *
 * ⚠️ NADA aqui monta telefone por conta propria. O numero sai de
 * `numeroDeEnvioDoCadastro` (a mesma ordem whatsapp→telefone da edge
 * `enviar-mensagem-admin` e da RPC `admin_conversa_usar_numero_do_cadastro_v1`)
 * e e normalizado por `normalizarTelefone`. Havia **cinco** implementacoes de
 * "qual e o link de WhatsApp deste numero" espalhadas pelo app quando isto foi
 * escrito; esta nao e a sexta.
 */

import { normalizarTelefone } from './normalizarTelefone';
import { numeroDeEnvioDoCadastro } from './numeroDaConversa';

/** O subconjunto de `ContratoVencendo` que estas regras leem. */
export interface ContratoLike {
  aluno_id?: number | null;
  aluno_nome?: string | null;
  unidade_nome?: string | null;
  curso_nome?: string | null;
  professor_nome?: string | null;
  data_ultima_aula?: string | null;
  venc_ultima_fatura?: string | null;
  dias_ate_vencimento?: number | null;
  dias_ate_venc_fatura?: number | null;
  nr_aulas_futuras?: number | null;
  valor_parcela?: number | null;
  inadimplente?: boolean | null;
  faturas_vencidas_abertas?: number | null;
  nr_faturas?: number | null;
  telefone?: string | null;
  whatsapp?: string | null;
  emusys_matricula_disciplina_id?: number | null;
  unidade_id?: string | null;
}

export type CriterioVencimento = 'aula' | 'fatura';

/**
 * Quantos dias faltam, pelo criterio escolhido.
 *
 * ⚠️ Os dois criterios NAO sao equivalentes: em 78% dos contratos ativos a
 * ultima aula e a ultima fatura caem em meses diferentes. Quem escolhe o
 * criterio escolhe outra lista, de proposito — ler sempre a coluna do criterio
 * ativo, nunca "a que estiver preenchida".
 *
 * ⚠️ `dias_ate_venc_fatura` e null quando o contrato nao tem parcelas
 * (`nr_faturas = 0`): nao ha vencimento financeiro a medir. Null aqui significa
 * "nao sei", e quem agrupa precisa tratar como tal — nunca como zero.
 */
export function diasParaVencer(c: ContratoLike, criterio: CriterioVencimento): number | null {
  const bruto = criterio === 'fatura' ? c.dias_ate_venc_fatura : c.dias_ate_vencimento;
  return typeof bruto === 'number' && Number.isFinite(bruto) ? bruto : null;
}

export type FaixaUrgencia = 'vencido' | 'esta_semana' | 'duas_semanas' | 'este_mes' | 'depois' | 'sem_data';

export const ROTULO_FAIXA: Record<FaixaUrgencia, string> = {
  vencido: 'Já venceu',
  esta_semana: 'Vence em até 7 dias',
  duas_semanas: 'Vence em 8 a 14 dias',
  este_mes: 'Vence em 15 a 30 dias',
  depois: 'Depois de 30 dias',
  sem_data: 'Sem data de vencimento',
};

/**
 * Em que faixa de urgencia o contrato cai.
 *
 * Os cortes (7, 14, 30) sao de CALENDARIO — semana, quinzena, mes — e nao
 * limiares inventados sobre o negocio. Deliberadamente nao existe faixa de
 * "poucas aulas restantes": qual numero conta como poucas nao foi medido, e
 * inventar o limiar faria a tela afirmar uma urgencia que ninguem apurou. O
 * numero de aulas e exibido como DADO, ao lado da data.
 *
 * ⚠️ `vencido` existe porque o recorte "Este mes" nao filtra por janela como as
 * de dias: ele lista o que termina na competencia, e no fim do mes isso inclui
 * contrato com a data ja passada. Esse e o caso mais urgente de todos e nao
 * pode cair no mesmo balde de "ate 7 dias".
 */
export function faixaDeUrgencia(dias: number | null): FaixaUrgencia {
  if (dias === null) return 'sem_data';
  if (dias < 0) return 'vencido';
  if (dias <= 7) return 'esta_semana';
  if (dias <= 14) return 'duas_semanas';
  if (dias <= 30) return 'este_mes';
  return 'depois';
}

/** A ordem em que as faixas aparecem: da mais urgente para a menos. */
export const ORDEM_FAIXAS: FaixaUrgencia[] = [
  'vencido',
  'esta_semana',
  'duas_semanas',
  'este_mes',
  'depois',
  'sem_data',
];

export interface BlocoDeUrgencia {
  faixa: FaixaUrgencia;
  rotulo: string;
  itens: ContratoLike[];
}

/**
 * Agrupa os contratos por urgencia, da mais alta para a mais baixa.
 *
 * ⚠️ Faixa VAZIA nao vira bloco: um cabecalho "Já venceu" sobre nada afirma um
 * problema que nao existe. Mesma regua do `data-vazia` no card de tabela.
 *
 * ⚠️ A ordem DENTRO do bloco e preservada — a lista ja chega do banco ordenada
 * por data de vencimento crescente (`.order(COLUNA_ORDEM[criterio])`). Reordenar
 * aqui seria uma segunda resposta para "qual vem primeiro".
 */
export function agruparPorUrgencia(
  contratos: readonly ContratoLike[],
  criterio: CriterioVencimento,
): BlocoDeUrgencia[] {
  const porFaixa = new Map<FaixaUrgencia, ContratoLike[]>();
  for (const c of contratos) {
    const faixa = faixaDeUrgencia(diasParaVencer(c, criterio));
    const lista = porFaixa.get(faixa);
    if (lista) lista.push(c);
    else porFaixa.set(faixa, [c]);
  }
  return ORDEM_FAIXAS.filter((f) => (porFaixa.get(f)?.length ?? 0) > 0).map((faixa) => ({
    faixa,
    rotulo: ROTULO_FAIXA[faixa],
    itens: porFaixa.get(faixa) as ContratoLike[],
  }));
}

export interface ContatoDeRenovacao {
  /** O numero como esta no cadastro — e o que a pessoa reconhece. */
  numeroCadastrado: string;
  /** `55DDDNUMERO`, pronto para o link. */
  numeroDiscavel: string;
  linkWhatsApp: string;
}

/**
 * Com quem falar para renovar este contrato.
 *
 * ⚠️ Devolve null quando nao ha numero utilizavel — e `normalizarTelefone`
 * RECUSA menos de 10 digitos, entao cadastro pela metade nao vira link quebrado
 * que abre o WhatsApp em branco. Uma das cinco copias espalhadas pelo app faz
 * `'55' + digitos` sem essa checagem; esta nao repete isso.
 *
 * ⚠️ Sem `aluno_id` nao ha cadastro local (medido: 2 matriculas em producao, do
 * LEFT JOIN da view) — e sem cadastro nao ha telefone. O chamador mostra isso
 * como o que e: falta de vinculo, nao falta de interesse.
 */
export function contatoDeRenovacao(c: ContratoLike): ContatoDeRenovacao | null {
  const numeroCadastrado = numeroDeEnvioDoCadastro(c);
  if (!numeroCadastrado) return null;
  const numeroDiscavel = normalizarTelefone(numeroCadastrado);
  if (!numeroDiscavel) return null;
  return {
    numeroCadastrado,
    numeroDiscavel,
    linkWhatsApp: `https://wa.me/${numeroDiscavel}`,
  };
}

export type SinalContrato = 'inadimplente' | 'sem_cadastro_local' | 'pagamento_a_vista';

/**
 * O que precisa ser dito sobre este contrato antes de alguem ligar.
 *
 * ⚠️ `inadimplente` vem do CONTRATO e nao tem limite de competencia;
 * `faturas_vencidas_abertas` e um PISO, porque `emusys_faturas` so cobre de
 * jun/2026 em diante (medido: o Emusys mostra 2 onde temos 1). Por isso o SINAL
 * sai do booleano e a contagem, quando exibida, vai como "≥ N" — nunca o
 * contrário.
 *
 * ⚠️ Nao ha sinal de "poucas aulas": ver a nota em `faixaDeUrgencia`.
 */
export function sinaisDoContrato(c: ContratoLike): SinalContrato[] {
  const sinais: SinalContrato[] = [];
  if (c.inadimplente === true) sinais.push('inadimplente');
  if (c.aluno_id == null) sinais.push('sem_cadastro_local');
  // 1 parcela com aulas pela frente costuma ser pagamento a vista — a conversa
  // de renovacao com essa pessoa e outra.
  if (c.nr_faturas === 1 && (c.nr_aulas_futuras ?? 0) > 1) sinais.push('pagamento_a_vista');
  return sinais;
}

/**
 * Quantas faturas vencidas dizer na tela.
 *
 * Devolve a string pronta porque o "≥" nao e enfeite: sem ele a tela afirma um
 * numero exato que a fonte nao garante.
 */
export function rotuloFaturasVencidas(c: ContratoLike): string | null {
  const n = c.faturas_vencidas_abertas ?? 0;
  if (n <= 0) return null;
  return `≥ ${n} ${n === 1 ? 'fatura vencida' : 'faturas vencidas'}`;
}
