import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import {
  LANCAMENTOS,
  agruparPorDia,
  filasDoMes,
  montarLinha,
  numerosDoMes,
  precisaMostrarUnidade,
  totalDeMovimentacoes,
  type FilaId,
  type LancamentoId,
  type ListasDoMes,
  type MovimentacaoLike,
  type ResumoLike,
} from '@/lib/administrativoMobile';
import { LinhaMovimentacao } from './LinhaMovimentacao';
import { useTrilhoRolavel } from '@/mobile/useTrilhoRolavel';
import { cn } from '@/lib/utils';

/**
 * O Administrativo no celular: lançar e conferir, não analisar.
 *
 * O recorte e os números que o motivam estão em `@/lib/administrativoMobile`.
 * Resumindo: a tela do computador tem 8,6 telas de rolagem a 390px, com 80%
 * dos alvos abaixo de 44px e uma tabela 4,3× mais larga que o telefone — e
 * nada disso é defeito dela, é a pergunta que muda entre a mesa e o balcão.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada**. Recebe as listas já
 * derivadas pela `AdministrativoPage` (que aplica `filtrarRetencaoCanonica`) e
 * devolve, por callback, qual modal abrir — os MESMOS oito modais do
 * computador, que já cabem no telefone. Toda a lógica testável mora em funções
 * puras na lib.
 */

interface Props {
  listas: ListasDoMes;
  resumo: ResumoLike | null;
  /** Abre um dos oito modais de lançamento do computador. */
  onLancar: (id: LancamentoId) => void;
  /** Abre o modal de edição da movimentação tocada. */
  onEditar?: (mov: MovimentacaoLike) => void;
  /** Rótulo da competência à vista ("Setembro de 2026"). */
  periodo: string;
  /** Slot do seletor de competência, montado pela página. */
  seletorPeriodo?: React.ReactNode;
}

export function AdministrativoMobile({
  listas,
  resumo,
  onLancar,
  onEditar,
  periodo,
  seletorPeriodo,
}: Props) {
  const filas = useMemo(() => filasDoMes(listas), [listas]);
  const total = useMemo(() => totalDeMovimentacoes(listas), [listas]);
  const numeros = useMemo(() => numerosDoMes(resumo), [resumo]);

  // A primeira fila com conteúdo é a que abre. Abrir sempre em "Renovações"
  // mostraria uma lista vazia no dia 1º do mês, que parece tela quebrada.
  const [filaAberta, setFilaAberta] = useState<FilaId | null>(null);
  const filaAtiva: FilaId = filaAberta ?? (filas.find((f) => f.quantidade > 0)?.id ?? 'renovacoes');

  const [lancarAberto, setLancarAberto] = useState(false);

  // O trilho de filas esconde 7 dos 9 chips a 390px (medido: 1322px de
  // conteúdo em 380px de tela). Sem isto ele não diz que há mais, e o chip
  // aceso pode ficar fora da vista — a lista apareceria filtrada sem que
  // nada na tela explicasse por quê.
  const trilho = useTrilhoRolavel<HTMLDivElement>();
  const { trazerAtivoAVista } = trilho;
  useEffect(() => {
    trazerAtivoAVista();
  }, [filaAtiva, trazerAtivoAVista]);

  const itens = (listas[filaAtiva] ?? []) as MovimentacaoLike[];
  const blocos = useMemo(() => agruparPorDia(itens), [itens]);
  const mostrarUnidade = useMemo(() => precisaMostrarUnidade(itens), [itens]);

  return (
    <div className="flex flex-col">
      {/* O cabeçalho é fixo: numa lista de 40 linhas, sem ele some a única
          coisa que diz de que mês se está falando.
          ⚠️ `top-0` gruda no topo do CONTEÚDO do <main>, não do padding dele —
          o pseudo-elemento cobre os 12px por onde as linhas passariam por cima
          (mesma armadilha da Agenda e da Chamada; margem negativa não resolve). */}
      <div className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 border-b border-slate-800 bg-slate-950 px-3 pb-2.5 pt-1 before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-slate-950">
        {seletorPeriodo}
        <p className="text-[12px] leading-tight text-slate-400">
          <span className="font-semibold text-slate-100">{periodo}</span>
          <span className="text-slate-500">
            {` · ${total} ${total === 1 ? 'movimentação' : 'movimentações'}`}
          </span>
        </p>
      </div>

      {/* ── 1. Lançar ────────────────────────────────────────────────────────
          Vem ANTES dos números de propósito. No computador o "Lançamento
          Rápido" fica depois de 589px de KPIs, o que é natural numa tela de
          1440px onde tudo está à vista. No telefone, o que é ação tem de vir
          antes do que é leitura: a ADM abre esta tela para registrar algo. */}
      <section className="pt-3">
        <button
          type="button"
          onClick={() => setLancarAberto((v) => !v)}
          aria-expanded={lancarAberto}
          className="flex min-h-[48px] w-full items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 text-[14px] font-semibold text-white active:opacity-90"
        >
          <Plus className="h-4.5 w-4.5" />
          Lançar movimentação
          <ChevronDown
            className={cn('ml-auto h-4 w-4 transition-transform', lancarAberto && 'rotate-180')}
          />
        </button>

        {lancarAberto && (
          <div className="mt-2 flex flex-col gap-1.5">
            {LANCAMENTOS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLancarAberto(false);
                  onLancar(l.id);
                }}
                className={cn(
                  'flex min-h-[52px] flex-col justify-center rounded-lg border-l-[3px] bg-slate-900/70 px-3 py-2 text-left active:bg-slate-800',
                  TOM_DO_LANCAMENTO[l.tom],
                )}
              >
                <span className="text-[13.5px] font-medium leading-tight text-slate-100">
                  {l.rotulo}
                </span>
                {/* O "quando" existe porque oito rótulos parecidos a um toque
                    de distância não se distinguem sozinhos — "Renovação" e
                    "Renovação antecipada" lançam coisas diferentes. */}
                <span className="text-[11.5px] leading-tight text-slate-400">{l.quando}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Os números ──────────────────────────────────────────────────── */}
      <section className="pt-4">
        <h2 className="px-0.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          O mês em números
        </h2>
        {/* `auto-rows-fr` porque a nota de um card pode quebrar em duas linhas
            ("cancelamento + não renovação") e sem isso a segunda fileira fica
            mais alta que a primeira — medido 75/75/88/88 na tela. */}
        <div className="grid auto-rows-fr grid-cols-2 gap-1.5">
          {numeros.map((n) => (
            <div key={n.rotulo} className="flex flex-col rounded-lg bg-slate-900/70 px-3 py-2.5">
              <p className="text-[10.5px] font-medium uppercase tracking-wide text-slate-500">
                {n.rotulo}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[20px] font-semibold leading-none tabular-nums',
                  n.tom === 'bom' && 'text-emerald-300',
                  n.tom === 'ruim' && 'text-rose-300',
                  n.tom === 'neutro' && 'text-slate-100',
                )}
              >
                {n.valor}
              </p>
              {n.nota && (
                <p className="mt-auto pt-1 text-[10.5px] leading-tight text-slate-500">{n.nota}</p>
              )}
            </div>
          ))}
        </div>
        {/* O que ficou no computador é dito, não escondido: quem procura
            "motivos de saída" precisa saber que existe e onde está. */}
        <p className="px-0.5 pt-1.5 text-[10.5px] leading-tight text-slate-500">
          Motivos de saída, MRR perdido e LTV ficam no computador.
        </p>
      </section>

      {/* ── 3. O que foi lançado ───────────────────────────────────────────── */}
      <section className="pt-4">
        <h2 className="px-0.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Lançado no mês
        </h2>

        {/* Trilho de filas. Rola na horizontal SÓ ele — o resto da tela nunca
            rola para o lado. Fila vazia continua aqui (ver `filasDoMes`). */}
        {/* ⚠️ O esmaecimento das pontas é DINÂMICO (ver `mascaraDoTrilho`):
            máscara fixa à direita continuaria prometendo conteúdo depois de
            a pessoa ter chegado ao fim, e nunca diria que ficou fila para
            trás. `scroll-smooth` fica com o hook, que respeita
            `prefers-reduced-motion`. */}
        <div
          ref={trilho.refTrilho}
          style={trilho.estiloDaMascara}
          className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filas.map((f) => {
            const ativa = f.id === filaAtiva;
            return (
              <button
                key={f.id}
                ref={ativa ? trilho.refAtivo : undefined}
                type="button"
                onClick={() => setFilaAberta(f.id)}
                aria-pressed={ativa}
                className={cn(
                  'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium',
                  ativa ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-slate-300',
                  f.quantidade === 0 && !ativa && 'text-slate-600',
                )}
              >
                {f.rotulo}
                <span className={cn('tabular-nums', ativa ? 'text-slate-500' : 'text-slate-500')}>
                  {f.quantidade}
                </span>
              </button>
            );
          })}
        </div>

        {itens.length === 0 ? (
          <p className="px-0.5 py-8 text-center text-[12.5px] text-slate-500">
            Nenhum lançamento desta fila em {periodo.toLowerCase()}.
          </p>
        ) : (
          blocos.map((bloco) => (
            <div key={bloco.dataISO || 'sem-data'}>
              {/* A data é dita UMA vez por bloco. Como coluna, ela repetia em
                  43 linhas para 16 datas distintas — textura, não informação.
                  `sticky` para não se perder ao rolar um dia de 10 lançamentos.

                  ⚠️ `top-[30px]` é MEDIDO, não escolhido: é a ALTURA do
                  cabeçalho da tela, e nada mais. O padding de 12px do `<main>`
                  não entra na conta — o sticky mede a partir do padding box do
                  scrollport, então o cabeçalho com `top-0` já para depois dele.
                  Chutei 58px primeiro e depois 42px somando o padding; os dois
                  deixaram uma fresta (16px e 12px) por onde o nome do aluno
                  passava, e dava para ver "Giovanna Alves da Silva Mendonça"
                  cortada atrás do "21/09". Mesma armadilha que a Agenda mobile
                  pagou em 21/09, e que eu repeti aqui — duas vezes.

                  ⚠️ Fundo OPACO, sem `/95` nem `backdrop-blur`: translúcido,
                  ele deixava o texto de baixo aparecer através e o cabeçalho
                  ficava ilegível justamente enquanto grudado. */}
              <h3 className="sticky top-[30px] z-10 -mx-3 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                {bloco.rotulo}
                <span className="ml-1.5 font-normal text-slate-600">
                  {bloco.itens.length === 1 ? '1 lançamento' : `${bloco.itens.length} lançamentos`}
                </span>
              </h3>
              {bloco.itens.map((mov, i) => (
                <LinhaMovimentacao
                  key={(mov.id as number | undefined) ?? `${filaAtiva}-${bloco.dataISO}-${i}`}
                  linha={montarLinha(mov, filaAtiva)}
                  mostrarUnidade={mostrarUnidade}
                  // Aluno novo não é movimentação lançada por ninguém — veio do
                  // Emusys. Oferecer "editar" ali prometeria uma escrita que não
                  // existe.
                  onEditar={onEditar && filaAtiva !== 'alunos_novos' ? () => onEditar(mov) : undefined}
                />
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const TOM_DO_LANCAMENTO = {
  positivo: 'border-l-emerald-400',
  atencao: 'border-l-amber-400',
  saida: 'border-l-rose-400',
  neutro: 'border-l-slate-500',
} as const;
