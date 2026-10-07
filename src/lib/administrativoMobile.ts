/**
 * O Administrativo no celular: as regras, sem JSX.
 *
 * ── Por que a tela do computador não atravessa ────────────────────────────
 *
 * Medido a 390px, na aba Lançamentos de Campo Grande (set/2026):
 *
 *   8,6 telas de rolagem (7.258px) · 66 de 82 alvos abaixo de 44px (80%),
 *   o menor com 12px · a tabela do detalhamento tem 1.320px de largura
 *   para 304px de espaço — 4,3 vezes a tela.
 *
 * ⚠️ Nada disso é defeito do computador: a 1440px aquela matriz de 11 colunas
 * é a leitura certa do mês. O que não atravessa é a PERGUNTA. Na mesa, ela é
 * "como foi o mês" — churn, motivos de saída, MRR perdido, LTV. No balcão,
 * com o celular na mão, é outra: **"o que eu preciso lançar agora, e o que já
 * lancei?"**.
 *
 * Por isso o corte aqui é de CONTEÚDO, não de layout — mesma régua da fila da
 * Chamada (`chamadaFila.ts`). Encolher a matriz daria 11 colunas ilegíveis;
 * o que a tela do celular faz é responder outra pergunta.
 *
 * ── O que fica de fora, declarado ─────────────────────────────────────────
 *
 * Motivos de saída, distribuição por categoria, MRR perdido e LTV médio
 * (1.625px de 7.258, 22% da tela) são leitura de gestão e seguem só no
 * computador. Não somem por acidente: somem porque ninguém decide nada sobre
 * eles de pé no balcão.
 *
 * ⚠️ Os oito MODAIS de lançamento NÃO foram reescritos, e não precisavam:
 * medidos a 390px, os quatro principais já cabem (390px de largura, zero
 * rolagem lateral, 0,7–0,9 tela de altura, Esc fecha). A tela do celular os
 * reusa inteiros. Reescrevê-los criaria uma segunda versão de cada regra de
 * escrita do Administrativo — que é a origem das duplicatas de renovação
 * deste repo.
 */

// ⚠️ Caminho relativo COM extensão, nunca o alias `@/`: os testes rodam esta
// lib em `node --test`, que não tem bundler e não resolve o alias do Vite.
// Mesma regra de `gradeHoraria.ts` e `distribuicaoTurmas.ts`.
import { fimDoAviso } from './avisoPrevioSaida.ts';
import { abreviarNome } from './nomeExibicao.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário
// ─────────────────────────────────────────────────────────────────────────────

/** As filas do mês. São as MESMAS nove sub-abas do computador, na mesma ordem. */
export type FilaId =
  | 'renovacoes'
  | 'renovacoes_pendentes'
  | 'renovacoes_antecipadas'
  | 'nao_renovacoes'
  | 'avisos'
  | 'cancelamentos'
  | 'trancamentos'
  | 'transferencias'
  | 'alunos_novos';

/** O que se pode lançar. Cada um abre o modal que o computador já usa. */
export type LancamentoId =
  | 'renovacao'
  | 'renovacao_pendente'
  | 'renovacao_antecipada'
  | 'nao_renovacao'
  | 'aviso_previo'
  | 'trancamento'
  | 'transferencia'
  | 'cancelamento';

export interface Lancamento {
  id: LancamentoId;
  rotulo: string;
  /** Uma linha dizendo QUANDO se usa. No computador o card não explica nada —
   *  cabe porque são oito lado a lado e o contexto está na tela toda. Numa
   *  lista de oito no celular, "Renovação" e "Renovação antecipada" a um
   *  toque de distância precisam se distinguir sem abrir os dois. */
  quando: string;
  tom: 'positivo' | 'atencao' | 'saida' | 'neutro';
}

/**
 * ⚠️ A ordem não é alfabética nem a do computador: é a da FREQUÊNCIA de uso.
 * Medido em CG/set-2026: renovação 21, cancelamento 22, aviso prévio 13,
 * não renovação 5, trancamento 3, antecipada 1, pendente 1, transferência 0.
 * O que se lança todo dia fica onde o polegar alcança sem rolar.
 */
export const LANCAMENTOS: readonly Lancamento[] = [
  { id: 'renovacao', rotulo: 'Renovação', quando: 'O aluno renovou o contrato', tom: 'positivo' },
  { id: 'cancelamento', rotulo: 'Cancelamento', quando: 'O aluno saiu agora', tom: 'saida' },
  { id: 'aviso_previo', rotulo: 'Aviso prévio', quando: 'Avisou que vai sair', tom: 'atencao' },
  { id: 'nao_renovacao', rotulo: 'Não renovação', quando: 'Acabou o contrato e não renovou', tom: 'saida' },
  { id: 'trancamento', rotulo: 'Trancamento', quando: 'Vai parar e voltar depois', tom: 'atencao' },
  { id: 'renovacao_antecipada', rotulo: 'Renovação antecipada', quando: 'Renovou um ciclo que começa depois', tom: 'positivo' },
  { id: 'renovacao_pendente', rotulo: 'Renovação pendente', quando: 'Renovou mas falta confirmar', tom: 'neutro' },
  { id: 'transferencia', rotulo: 'Transferência', quando: 'Mudou de unidade', tom: 'neutro' },
] as const;

export const ROTULO_DA_FILA: Readonly<Record<FilaId, string>> = {
  renovacoes: 'Renovações',
  renovacoes_pendentes: 'Renov. pendentes',
  renovacoes_antecipadas: 'Renov. antecipadas',
  nao_renovacoes: 'Não renovação',
  avisos: 'Avisos prévios',
  cancelamentos: 'Cancelamentos',
  trancamentos: 'Trancamentos',
  transferencias: 'Transferências',
  alunos_novos: 'Alunos novos',
};

// ─────────────────────────────────────────────────────────────────────────────
// As filas
// ─────────────────────────────────────────────────────────────────────────────

export interface ListasDoMes {
  renovacoes: unknown[];
  renovacoes_pendentes: unknown[];
  renovacoes_antecipadas: unknown[];
  nao_renovacoes: unknown[];
  avisos: unknown[];
  cancelamentos: unknown[];
  trancamentos: unknown[];
  transferencias: unknown[];
  alunos_novos: unknown[];
}

export interface FilaDoMes {
  id: FilaId;
  rotulo: string;
  quantidade: number;
}

/**
 * Os chips do mês, com contagem.
 *
 * 🔴 **Fila vazia continua na lista.** É tentador esconder os zeros — sobrariam
 * quatro chips em vez de nove, e a faixa caberia sem rolar. Mas "nenhuma
 * transferência este mês" é informação: a fila some e quem procura não sabe se
 * é porque não houve ou porque a tela do celular não tem aquilo. A mesma régua
 * do `sem_captura` que nunca vira "fora".
 *
 * ⚠️ Esta função NÃO decide o que entra em cada fila — ela recebe as listas já
 * derivadas pela página, que aplica `filtrarRetencaoCanonica` (banda e bolsista
 * fora dos KPIs, regra do Alf de 27/08). Refiltrar aqui seria a segunda régua
 * de "isto conta?", e no dia em que as duas discordassem a tela do celular e a
 * do computador mostrariam meses diferentes.
 */
export function filasDoMes(listas: ListasDoMes): FilaDoMes[] {
  const ordem: FilaId[] = [
    'renovacoes',
    'cancelamentos',
    'avisos',
    'nao_renovacoes',
    'trancamentos',
    'renovacoes_antecipadas',
    'renovacoes_pendentes',
    'transferencias',
    'alunos_novos',
  ];
  return ordem.map((id) => ({
    id,
    rotulo: ROTULO_DA_FILA[id],
    quantidade: (listas[id] ?? []).length,
  }));
}

export function totalDeMovimentacoes(listas: ListasDoMes): number {
  // ⚠️ `alunos_novos` fica FORA do total, de propósito: aluno novo não é uma
  // movimentação lançada por ninguém — é matrícula que chegou do Emusys. Somá-lo
  // faria o "188 movimentações" do cabeçalho discordar do computador.
  return filasDoMes(listas)
    .filter((f) => f.id !== 'alunos_novos')
    .reduce((soma, f) => soma + f.quantidade, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// A linha
// ─────────────────────────────────────────────────────────────────────────────

export interface MovimentacaoLike {
  id?: number | null;
  tipo?: string | null;
  data?: string | null;
  aluno_nome?: string | null;
  curso_nome?: string | null;
  professor_nome?: string | null;
  motivo?: string | null;
  mes_saida?: string | null;
  data_prevista_saida?: string | null;
  previsao_retorno?: string | null;
  valor_parcela_anterior?: number | null;
  valor_parcela_novo?: number | null;
  valor_parcela_evasao?: number | null;
  tempo_permanencia_meses?: number | null;
  tipo_evasao?: string | null;
  forma_pagamento_nome?: string | null;
  agente_comercial?: string | null;
  unidades?: { codigo?: string | null } | null;
  [chave: string]: unknown;
}

export interface LinhaDaMovimentacao {
  /** Sempre o nome do aluno, inteiro. */
  titulo: string;
  /** Curso · professor — o que situa quem é a pessoa. */
  contexto: string;
  /** A data da movimentação, curta. */
  data: string;
  /** O dado que ESTE tipo existe para mostrar. Varia por fila, de propósito. */
  destaque: string | null;
  /** Um qualificador curto ao lado do destaque (o motivo, o tipo de saída). */
  detalhe: string | null;
  unidade: string | null;
}

export function fmtBRL(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(Number(valor))) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** `YYYY-MM-DD` → `DD/MM`. Fatiado, nunca por `Date`: em BRT o `Date` de uma
 *  data pura volta um dia (o mesmo motivo do `paraISO` em `avisoPrevioSaida`). */
export function fmtDataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const casa = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!casa) return '—';
  return `${casa[3]}/${casa[2]}`;
}

/** `YYYY-MM-DD` → `mês/ano` por extenso curto, para o mês de saída. */
export function fmtMesCurto(iso: string | null | undefined): string {
  if (!iso) return '—';
  const casa = /^(\d{4})-(\d{2})/.exec(String(iso));
  if (!casa) return '—';
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mes = meses[Number(casa[2]) - 1];
  return mes ? `${mes}/${casa[1].slice(2)}` : '—';
}

/**
 * O reajuste de uma renovação, em pontos percentuais inteiros. `null` quando
 * não dá para calcular — nunca `0%`, que afirmaria "não teve reajuste".
 *
 * 🔴 **Ausência não é zero, e `Number(null)` é `0`.** A primeira versão desta
 * função checava só `Number.isFinite`, e `Number.isFinite(Number(null))` é
 * `true`: renovação com `valor_parcela_novo` nulo e anterior preenchido saía
 * como **−100%** — a tela afirmando que a parcela da aluna tinha ido a zero.
 * Medido: 5 renovações de 2026 estão exatamente assim, e uma delas apareceu na
 * primeira carga da tela no telefone (Maria Eduarda, set/26), com `—` no valor
 * e `-100%` ao lado. Os testes de valor não pegaram porque eu testei
 * `anterior: null`, e o buraco era do outro lado.
 *
 * ⚠️ Zero DECLARADO continua valendo: bolsista que passou a não pagar teve
 * −100% de verdade, e apagar isso seria o erro inverso.
 */
function valorDeclarado(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function reajusteDaRenovacao(mov: MovimentacaoLike): number | null {
  const antes = valorDeclarado(mov.valor_parcela_anterior);
  const depois = valorDeclarado(mov.valor_parcela_novo);
  if (antes == null || depois == null || antes <= 0) return null;
  return Math.round(((depois - antes) / antes) * 100);
}

/**
 * O que cada tipo de movimentação destaca.
 *
 * 🔴 **O destaque muda por fila, e é isso que faz a lista caber.** A tabela do
 * computador resolve isso com 11 colunas, a maioria vazia para a maioria das
 * linhas: `REAJUSTE` só diz algo em renovação, `MÊS SAÍDA` só em aviso prévio,
 * `PERMANÊNCIA` só em cancelamento. Numa linha de ~350px não há espaço para
 * onze campos, e não é preciso: a fila já diz qual é a pergunta, então a linha
 * responde só ela.
 *
 * ⚠️ Fila desconhecida NÃO inventa destaque — devolve `null` e a linha mostra
 * só nome, curso e data. Cair num `else` que exibe o primeiro campo preenchido
 * faria um tipo novo nascer mostrando um número sem rótulo.
 */
export function montarLinha(mov: MovimentacaoLike, fila: FilaId): LinhaDaMovimentacao {
  const titulo = String(mov.aluno_nome ?? '').trim() || 'Sem nome';
  // ⚠️ O nome do PROFESSOR entra abreviado, o do aluno nunca. Medido a 390px:
  // "Musicalização Preparatória · Willian De Souza Ferreira" tem 308px para
  // 233px de espaço, e o que sumia no corte era sempre o sobrenome do
  // professor. Abreviar é melhor que truncar porque devolve um nome inteiro
  // em vez de um pedaço ("Willian De"). A regra vem da fonte única que a
  // Chamada já usa — ela pula conectivos justamente para não cortar num "de".
  const professor = String(mov.professor_nome ?? '').trim();
  const contexto = [String(mov.curso_nome ?? '').trim(), professor ? abreviarNome(professor, 2) : '']
    .filter(Boolean)
    .join(' · ');

  const base: LinhaDaMovimentacao = {
    titulo,
    contexto,
    data: fmtDataCurta(mov.data),
    destaque: null,
    detalhe: null,
    unidade: mov.unidades?.codigo ? String(mov.unidades.codigo) : null,
  };

  switch (fila) {
    case 'renovacoes':
    case 'renovacoes_pendentes':
    case 'renovacoes_antecipadas': {
      const pct = reajusteDaRenovacao(mov);
      return {
        ...base,
        destaque: fmtBRL(mov.valor_parcela_novo),
        // ⚠️ Reajuste indisponível vira ausência, nunca "0%": a parcela anterior
        // falta em renovação de bolsista e de quem entrou sem valor no cadastro,
        // e "0%" ali afirmaria que a escola não reajustou.
        detalhe: pct == null ? null : `${pct > 0 ? '+' : ''}${pct}%`,
      };
    }
    case 'avisos': {
      // A data que vale é a MESMA que a aba Vencidos e a Sol leem — vem da
      // fonte única (`fimDoAviso`), nunca de `mes_saida` cru. Ler o mês aqui
      // repetiria o defeito de 03/09: a tela mostrando a data velha enquanto
      // a correção foi gravada no outro campo.
      const fim = fimDoAviso(mov.data_prevista_saida ?? null, mov.mes_saida ?? null);
      return {
        ...base,
        destaque: fim ? `Sai ${fmtDataCurta(fim)}` : 'Saída não informada',
        detalhe: String(mov.motivo ?? '').trim() || null,
      };
    }
    case 'cancelamentos': {
      const meses = mov.tempo_permanencia_meses;
      return {
        ...base,
        destaque: meses == null ? null : `${meses} ${meses === 1 ? 'mês' : 'meses'} de casa`,
        detalhe: String(mov.motivo ?? '').trim() || null,
      };
    }
    case 'nao_renovacoes': {
      const meses = mov.tempo_permanencia_meses;
      return {
        ...base,
        destaque: meses == null ? null : `${meses} ${meses === 1 ? 'mês' : 'meses'} de casa`,
        detalhe: String(mov.motivo ?? '').trim() || null,
      };
    }
    case 'trancamentos': {
      const volta = mov.previsao_retorno;
      return {
        ...base,
        destaque: volta ? `Volta ${fmtMesCurto(volta)}` : 'Sem previsão de volta',
        detalhe: String(mov.motivo ?? '').trim() || null,
      };
    }
    case 'alunos_novos': {
      return {
        ...base,
        destaque: fmtBRL(mov.valor_parcela_novo ?? (mov.valor_parcela_anterior as number | null)),
        detalhe: String(mov.agente_comercial ?? '').trim() || null,
      };
    }
    default:
      return base;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrupamento: o que se repete sai da linha e vira cabeçalho
// ─────────────────────────────────────────────────────────────────────────────

export interface BlocoDeDia<T> {
  /** `YYYY-MM-DD`, para a chave e a ordenação. */
  dataISO: string;
  /** "21/09" — escrito UMA vez, no cabeçalho do bloco. */
  rotulo: string;
  itens: T[];
}

/**
 * Agrupa as movimentações por dia.
 *
 * 🔴 **A data era uma coluna repetida em toda linha.** Medido na tela, na fila
 * de renovações de set/2026: **43 linhas para 16 datas distintas** — "21/09"
 * dez vezes, "17/08" sete vezes. É a mesma lição que a Agenda mobile já tinha
 * pago e que eu não apliquei aqui: *a hora é cabeçalho de bloco, não coluna*.
 * Repetida em 43 linhas, a data deixa de ser informação e vira textura.
 *
 * ⚠️ O grão é o DIA, não o mês: a ADM lança em lote e o que ela reconhece é
 * "o que entrou na segunda".
 *
 * ⚠️ Movimentação sem data entra num bloco próprio no fim, nunca some nem é
 * empurrada para um dia qualquer.
 */
export function agruparPorDia<T extends MovimentacaoLike>(itens: T[]): BlocoDeDia<T>[] {
  const porDia = new Map<string, T[]>();
  for (const item of itens) {
    const chave = String(item.data ?? '').slice(0, 10) || '';
    const lista = porDia.get(chave);
    if (lista) lista.push(item);
    else porDia.set(chave, [item]);
  }
  return [...porDia.entries()]
    // Mais recente primeiro; o bloco sem data vai para o fim (string vazia
    // ordena antes, então ele é tratado à parte).
    .sort((a, b) => {
      if (!a[0]) return 1;
      if (!b[0]) return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([dataISO, lista]) => ({
      dataISO,
      rotulo: dataISO ? fmtDataCurta(dataISO) : 'Sem data',
      itens: lista,
    }));
}

/**
 * A unidade deve aparecer na linha?
 *
 * 🔴 Só quando há mais de uma na lista. Com a unidade escolhida no cabeçalho,
 * o selo "CG" repete em 100% das linhas — e **sinal que acende em toda linha
 * deixa de ser sinal e vira fundo**, que é a lição do `opacity-50` da Agenda e
 * do aviso do Consolidado na Chamada. No Consolidado ele volta, porque ali
 * distingue de verdade (medido: 21 CG e 15 REC nas 43 renovações do mês).
 */
export function precisaMostrarUnidade(itens: MovimentacaoLike[]): boolean {
  const vistas = new Set<string>();
  for (const item of itens) {
    const codigo = item.unidades?.codigo;
    if (codigo) vistas.add(String(codigo));
    if (vistas.size > 1) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Os números do mês
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumoLike {
  alunos_ativos?: number | null;
  alunos_pagantes?: number | null;
  renovacoes_realizadas?: number | null;
  nao_renovacoes?: number | null;
  renovacoes_pendentes?: number | null;
  evasoes_interrompido?: number | null;
  evasoes_nao_renovou?: number | null;
}

export interface NumeroDoMes {
  rotulo: string;
  valor: string;
  /** Uma linha de contexto, quando o número sozinho engana. */
  nota: string | null;
  tom: 'neutro' | 'bom' | 'ruim';
}

/**
 * Quatro números, não dezesseis.
 *
 * O computador mostra ativos, pagantes, matrículas, bolsistas, trancados,
 * novos, taxa de renovação, cobertura, churn, permanência, sete motivos de
 * saída, cinco categorias, MRR e LTV. No celular ficam os quatro que mudam o
 * que a ADM faz no mesmo dia.
 *
 * 🔴 **Indicador que não pôde ser calculado mostra `—`, nunca `0`.** Taxa de
 * renovação de 0% e "não sei a taxa" são coisas opostas, e o `0` é o
 * tranquilizador dos dois: foi o defeito do card SOZINHOS, que afirmava zero
 * turmas em risco quando a fonte tinha falhado (22/09).
 */
export function numerosDoMes(
  resumo: ResumoLike | null | undefined,
  metas: { churnMax: number; renovacaoMin: number } = { churnMax: 4, renovacaoMin: 90 },
): NumeroDoMes[] {
  const ativos = resumo?.alunos_ativos ?? null;
  const pagantes = resumo?.alunos_pagantes ?? null;

  const evasoes =
    resumo == null
      ? null
      : (resumo.evasoes_interrompido ?? 0) + (resumo.evasoes_nao_renovou ?? 0);

  const churn = evasoes != null && pagantes != null && pagantes > 0 ? (evasoes / pagantes) * 100 : null;

  const renovadas = resumo?.renovacoes_realizadas ?? null;
  const vencimentos =
    resumo == null
      ? null
      : (resumo.renovacoes_realizadas ?? 0) +
        (resumo.nao_renovacoes ?? 0) +
        (resumo.renovacoes_pendentes ?? 0);
  const taxa = renovadas != null && vencimentos != null && vencimentos > 0 ? (renovadas / vencimentos) * 100 : null;

  return [
    {
      rotulo: 'Alunos ativos',
      valor: ativos == null ? '—' : ativos.toLocaleString('pt-BR'),
      nota: pagantes == null || ativos == null ? null : `${pagantes.toLocaleString('pt-BR')} pagantes`,
      tom: 'neutro',
    },
    {
      rotulo: 'Renovação',
      valor: taxa == null ? '—' : `${taxa.toFixed(0)}%`,
      nota:
        renovadas == null || vencimentos == null || vencimentos === 0
          ? 'sem vencimento no mês'
          : `${renovadas} de ${vencimentos} vencimentos`,
      tom: taxa == null ? 'neutro' : taxa >= metas.renovacaoMin ? 'bom' : 'ruim',
    },
    {
      rotulo: 'Churn',
      valor: churn == null ? '—' : `${churn.toFixed(1)}%`,
      nota: evasoes == null || pagantes == null ? null : `${evasoes} saídas · meta ≤ ${metas.churnMax}%`,
      tom: churn == null ? 'neutro' : churn <= metas.churnMax ? 'bom' : 'ruim',
    },
    {
      rotulo: 'Saídas no mês',
      valor: evasoes == null ? '—' : String(evasoes),
      nota: 'cancelamento + não renovação',
      tom: 'neutro',
    },
  ];
}
