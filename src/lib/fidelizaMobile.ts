/**
 * Regras da aba FIDELIZA+ no celular (LAPE-32).
 *
 * 🔴 O corte aqui é de EIXO, não de largura. A tela do computador tem uma
 * matriz — linha = métrica, coluna = dupla — e ela custa **1.609px, 38% da
 * tela** a 390px. Quebrada linha a linha, cada bloco responde *"como as três
 * duplas estão no churn"*. Mas quem abre o Fideliza+ no telefone é **uma
 * dupla**, e a pergunta dela é *"como está a minha, e o que falta"*.
 *
 * Decisão do Hugo em 25/09/2026, perguntado qual dos dois eixos a equipe usa:
 * *"acompanhar a própria dupla"*. Então a dupla vem primeiro e a comparação
 * fica no pódio, que já entrega as três em três linhas.
 *
 * 🔴 **A dupla é atributo da UNIDADE, não do usuário** — medido: os nomes
 * moram em `unidades.farmers_apelidos` (Barra `Duda & Arthur`, CG
 * `Mayra & Jhon`, Recreio `Fefe & Vi`). Não existe, e não precisa existir,
 * vínculo usuário→dupla: o vínculo é usuário→unidade, que já é o seletor do
 * shell mobile. Por isso `duplaDaUnidade` recebe a unidade escolhida.
 *
 * ⚠️ **Nada aqui recalcula pontuação.** Pontos, bônus, critérios batidos e
 * tipo de experiência saem de `calcularPontuacao`, no `useFidelizaPrograma`,
 * e a tela pequena lê o que a grande já calculou. Reimplementar o placar
 * daria duas respostas para "quantos pontos a dupla tem" — a causa-raiz das
 * duplicatas de renovação. O que este arquivo faz é derivar a LEITURA por
 * métrica (valor, meta, bateu, quanto falta), que hoje está repetida inline
 * cinco vezes dentro do JSX da tabela do desktop.
 */

/** A meta de lojinha é por unidade, guardada no config sob uma chave própria. */
const CHAVE_META_LOJINHA: Record<string, 'lojinha_campo_grande' | 'lojinha_recreio' | 'lojinha_barra'> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'lojinha_campo_grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'lojinha_recreio',
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'lojinha_barra',
};

/** Fallback herdado do desktop — unidade fora do mapa usa 3.000. */
export const META_LOJINHA_PADRAO = 3000;

/**
 * ⚠️ **Meta ZERO cai no padrão, e isso é herdado de propósito.** O desktop
 * escrevia `metas[chave] || 3000`, e `||` trata `0` como ausente — então uma
 * meta de lojinha zerada na tela de Configurações vira 3.000, não "qualquer
 * venda serve". Medido em 25/09/2026: nenhuma das três está zerada hoje
 * (CG 5.000, Barra e Recreio 3.000), logo a diferença é teórica — mas
 * "corrigir" isto aqui mudaria o placar do computador, que é justamente o que
 * esta frente não faz. Se um dia virar decisão, muda-se nos dois ao mesmo
 * tempo.
 */

export interface MetasLike {
  churn_maximo: number;
  inadimplencia_maxima: number;
  renovacao_minima: number;
  reajuste_minimo: number;
  lojinha_campo_grande?: number;
  lojinha_recreio?: number;
  lojinha_barra?: number;
}

/**
 * Qual é a meta de lojinha desta unidade.
 *
 * ⚠️ Fonte única: `useFidelizaPrograma` importa daqui em vez de repetir o
 * mapa. Duas tabelas de UUID→chave divergiriam no dia em que uma unidade
 * nascesse.
 */
export function metaLojinhaDaUnidade(metas: MetasLike, unidadeId: string): number {
  const chave = CHAVE_META_LOJINHA[unidadeId];
  const valor = chave ? metas[chave] : undefined;
  // `||` e não `??`: ver a nota sobre meta zero acima.
  return (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0) || META_LOJINHA_PADRAO;
}

export type ChaveMetrica = 'churn' | 'inadimplencia' | 'renovacao' | 'reajuste' | 'lojinha';

/** `menor` = bate quando fica ABAIXO da meta. `maior` = quando fica acima. */
export type DirecaoMetrica = 'menor' | 'maior';

export type FormatoMetrica = 'percentual' | 'moeda';

export interface DefinicaoMetrica {
  chave: ChaveMetrica;
  /** O rótulo do programa, como a equipe o conhece. */
  rotulo: string;
  direcao: DirecaoMetrica;
  formato: FormatoMetrica;
}

/**
 * As cinco métricas do programa, na ordem em que o desktop as lista.
 *
 * ⚠️ Declarativa de propósito: a tabela do computador repete o mesmo bloco de
 * JSX cinco vezes, e foi assim que `Reajuste Campeão` ganhou uma comparação
 * diferente das outras quatro em algum momento. Uma lista, um render.
 */
export const METRICAS_FIDELIZA: readonly DefinicaoMetrica[] = [
  { chave: 'churn', rotulo: 'Churn Premiado', direcao: 'menor', formato: 'percentual' },
  { chave: 'inadimplencia', rotulo: 'Inadimplência Zero', direcao: 'menor', formato: 'percentual' },
  { chave: 'renovacao', rotulo: 'Max Renovação', direcao: 'maior', formato: 'percentual' },
  { chave: 'reajuste', rotulo: 'Reajuste Campeão', direcao: 'maior', formato: 'percentual' },
  { chave: 'lojinha', rotulo: 'Lojinha', direcao: 'maior', formato: 'moeda' },
];

export interface FarmerLike {
  unidade_id: string;
  unidade_nome?: string;
  farmers: { nomes?: string; apelidos: string };
  metricas: {
    churn_rate: number;
    inadimplencia_pct: number;
    taxa_renovacao: number;
    reajuste_medio: number;
    vendas_lojinha: number;
  };
  pontuacao?: {
    churn: number;
    inadimplencia: number;
    renovacao: number;
    reajuste: number;
    lojinha: number;
    bonus: number;
    penalidades: number;
    total: number;
  };
  criterios_batidos?: number;
  experiencia_tipo?: 'premium' | 'standard' | null;
  posicao?: number;
}

export interface ConfigLike {
  metas: MetasLike;
  pontuacao: { churn: number; inadimplencia: number; renovacao: number; reajuste: number; lojinha: number };
}

export interface LeituraMetrica {
  chave: ChaveMetrica;
  rotulo: string;
  direcao: DirecaoMetrica;
  formato: FormatoMetrica;
  valor: number;
  meta: number;
  bateu: boolean;
  /** Pontos que a dupla EFETIVAMENTE ganhou nesta métrica. */
  pontos: number;
  /** Pontos que a métrica vale quando batida. */
  pontosPossiveis: number;
  /**
   * Quanto falta para bater, na unidade da métrica. `0` quando já bateu.
   *
   * ⚠️ É o número que a matriz não dava: lá a pessoa lia `4,8%` ao lado de
   * `≤ 4%` e fazia a conta de cabeça, métrica por métrica.
   */
  falta: number;
}

function valorDaMetrica(f: FarmerLike, chave: ChaveMetrica): number {
  switch (chave) {
    case 'churn': return f.metricas.churn_rate;
    case 'inadimplencia': return f.metricas.inadimplencia_pct;
    case 'renovacao': return f.metricas.taxa_renovacao;
    case 'reajuste': return f.metricas.reajuste_medio;
    case 'lojinha': return f.metricas.vendas_lojinha;
  }
}

function metaDaMetrica(config: ConfigLike, chave: ChaveMetrica, unidadeId: string): number {
  switch (chave) {
    case 'churn': return config.metas.churn_maximo;
    case 'inadimplencia': return config.metas.inadimplencia_maxima;
    case 'renovacao': return config.metas.renovacao_minima;
    case 'reajuste': return config.metas.reajuste_minimo;
    case 'lojinha': return metaLojinhaDaUnidade(config.metas, unidadeId);
  }
}

/**
 * A leitura completa de uma métrica para uma dupla.
 *
 * ⚠️ `bateu` usa a MESMA comparação de `calcularPontuacao` (`<=` para as de
 * baixar, `>=` para as de subir), senão a tela poderia pintar de verde uma
 * métrica que não pontuou.
 */
export function lerMetrica(
  farmer: FarmerLike,
  config: ConfigLike,
  def: DefinicaoMetrica,
): LeituraMetrica {
  const valor = valorDaMetrica(farmer, def.chave);
  const meta = metaDaMetrica(config, def.chave, farmer.unidade_id);
  const bateu = def.direcao === 'menor' ? valor <= meta : valor >= meta;
  const falta = bateu ? 0 : def.direcao === 'menor' ? valor - meta : meta - valor;

  return {
    chave: def.chave,
    rotulo: def.rotulo,
    direcao: def.direcao,
    formato: def.formato,
    valor,
    meta,
    bateu,
    pontos: farmer.pontuacao?.[def.chave] ?? 0,
    pontosPossiveis: config.pontuacao[def.chave],
    falta,
  };
}

/** As cinco leituras de uma dupla, na ordem do programa. */
export function lerMetricas(farmer: FarmerLike, config: ConfigLike): LeituraMetrica[] {
  return METRICAS_FIDELIZA.map((def) => lerMetrica(farmer, config, def));
}

export interface PosicaoNaTrilha {
  /** Quanto da trilha o valor ocupa, 0–100. */
  preenchidoPct: number;
  /** Onde fica a marca da meta, 0–100. */
  marcaPct: number;
}

/**
 * Onde o valor e a meta caem numa trilha de 0 a 100.
 *
 * 🔴 A barra mostra o VALOR na escala e carrega a **marca da meta**, em vez de
 * medir "percentual da meta atingido". Para as métricas de baixar (churn,
 * inadimplência) o percentual da meta é enganoso por construção: churn de 0%
 * é o melhor resultado possível e daria barra vazia, enquanto 8% — o dobro da
 * meta — daria barra cheia. Com a marca, o lado em que a barra termina diz
 * tudo: antes da marca é bom nas de baixar, depois da marca é bom nas de
 * subir.
 *
 * ⚠️ A escala tem folga (`meta × 1,6`) para a marca não encostar na borda, e
 * se estica quando o valor passa disso — a barra nunca vaza do trilho.
 *
 * ⚠️ Meta `<= 0` não define escala nenhuma: devolve a marca no zero e o
 * preenchimento cheio se houver valor. "Meta zero" existe de verdade
 * (`inadimplencia_maxima` pode ser 0) e dividir por ela daria `Infinity`.
 */
export function posicaoNaTrilha(valor: number, meta: number): PosicaoNaTrilha {
  const v = Number.isFinite(valor) ? Math.max(0, valor) : 0;
  const m = Number.isFinite(meta) ? Math.max(0, meta) : 0;

  if (m <= 0) {
    return { preenchidoPct: v > 0 ? 100 : 0, marcaPct: 0 };
  }

  const escala = Math.max(m * 1.6, v);
  return {
    preenchidoPct: Math.min(100, (v / escala) * 100),
    marcaPct: Math.min(100, (m / escala) * 100),
  };
}

/**
 * A dupla da unidade escolhida — `null` no Consolidado.
 *
 * ⚠️ `null` NÃO é erro: admin com as três unidades vê a rede inteira, e ali
 * não existe "a minha dupla". A tela abre no pódio puro em vez de eleger a
 * primeira colocada como se fosse dele — mesma régua de `sem_captura` não
 * virar "fora da comunidade".
 */
export function duplaDaUnidade(
  farmers: readonly FarmerLike[],
  unidadeId: string | null | undefined,
): FarmerLike | null {
  if (!unidadeId) return null;
  return farmers.find((f) => f.unidade_id === unidadeId) ?? null;
}

/**
 * O pódio, da maior pontuação para a menor.
 *
 * ⚠️ Desempate por `unidade_id` para a ordem não dançar entre renderizações
 * quando duas duplas empatam — o mesmo cuidado do `ordenarPorHora` da Agenda.
 */
export function ordenarPodio(farmers: readonly FarmerLike[]): FarmerLike[] {
  return [...farmers].sort((a, b) => {
    const diff = (b.pontuacao?.total ?? 0) - (a.pontuacao?.total ?? 0);
    if (diff !== 0) return diff;
    return a.unidade_id.localeCompare(b.unidade_id);
  });
}

export function formatarValorMetrica(valor: number, formato: FormatoMetrica): string {
  if (formato === 'moeda') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  return `${valor.toFixed(1).replace('.', ',')}%`;
}

/** O texto da meta, com o sinal da direção — `≤ 4%` / `≥ 90%`. */
export function formatarMeta(leitura: LeituraMetrica): string {
  const sinal = leitura.direcao === 'menor' ? '≤' : '≥';
  return `${sinal} ${formatarValorMetrica(leitura.meta, leitura.formato)}`;
}

/**
 * O que falta, escrito por extenso. `null` quando a métrica já bateu.
 *
 * ⚠️ Diz o VERBO junto com o número ("baixar 0,8 ponto", "faltam R$ 420"),
 * porque `0,8%` sozinho não distingue "estou 0,8 acima" de "estou 0,8 abaixo"
 * — e as duas coisas pedem ações opostas.
 */
export function textoDoQueFalta(leitura: LeituraMetrica): string | null {
  if (leitura.bateu) return null;
  if (leitura.formato === 'moeda') {
    return `faltam ${formatarValorMetrica(leitura.falta, 'moeda')}`;
  }
  const n = leitura.falta.toFixed(1).replace('.', ',');
  return leitura.direcao === 'menor' ? `baixar ${n} ponto` : `faltam ${n} ponto`;
}

/** As duas medalhas que o programa premia, mais o rótulo de quem ficou fora. */
export function rotuloExperiencia(tipo: 'premium' | 'standard' | null | undefined): string | null {
  if (tipo === 'premium') return 'Experiência premium';
  if (tipo === 'standard') return 'Experiência standard';
  return null;
}
