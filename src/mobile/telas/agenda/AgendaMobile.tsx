import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';

import type { AgendaDiaV2, AulaAgenda } from '@/hooks/useAgendaDia';
import {
  colisoesDeSala,
  filtrarAulas,
  FILTROS_AGENDA_VAZIOS,
  minutosAgora,
  minutosDeHHMM,
  normalizarBusca,
  ordenarPorHora,
  professoresPorVolume,
  rotuloDiaCurto,
  type FiltrosAgenda,
} from '@/lib/agenda';
import { aoMover, aoPressionar, aoSoltar, swipeInicial, type EstadoSwipe } from '@/lib/swipeDia';
import { cn } from '@/lib/utils';

import { LinhaAula } from './LinhaAula';

interface Props {
  /**
   * Aulas do dia atual SEM filtro. A tela aplica `filtrarAulas` nos tres
   * paineis — os vizinhos vem de `lerDoCache`, que devolve o dia cru, entao
   * filtrar aqui e o que mantem os tres sob a mesma regra.
   */
  aulasDoDia: AulaAgenda[];
  data: string;
  hoje: string;
  onTrocarDia: (novaData: string) => void;
  lerDoCache: (data: string) => AgendaDiaV2 | undefined;
  filtros: FiltrosAgenda;
  onFiltrar: (filtros: FiltrosAgenda) => void;
  onAbrir: (aula: AulaAgenda) => void;
  /**
   * Resumo do dia ("158 aulas / 19 agora / 17 em risco") e seletor de visao,
   * montados pela AgendaPage — ela e quem tem os KPIs e o estado da visao.
   *
   * Chegam como SLOTS, e nao como faixas soltas acima desta tela, porque o
   * cabecalho precisa ser um bloco so: quatro faixas de largura total
   * empilhadas (visao, resumo, dia, chips) somavam ~216px e empurravam a
   * primeira aula para alem da metade do telefone.
   */
  resumo?: ReactNode;
  seletorVisao?: ReactNode;
}

const DELTAS = [-1, 0, 1] as const;

/** Igual a duracao da transicao no JSX. Se um mudar, o outro muda junto. */
const DURACAO_TROCA_MS = 260;

export function AgendaMobile({
  aulasDoDia,
  data,
  hoje,
  onTrocarDia,
  lerDoCache,
  filtros,
  onFiltrar,
  onAbrir,
  resumo,
  seletorVisao,
}: Props) {
  // O palco comeca ancorado no do meio: ha sempre um dia de cada lado.
  const [swipe, setSwipe] = useState<EstadoSwipe>({ ...swipeInicial, indice: 1 });
  const [reancorando, setReancorando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  // Medida, nao fixa: o limiar de troca e uma fracao da largura real, e chutar
  // 390 erraria em telas de 360 e 430.
  const palcoRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = palcoRef.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(el);
    setLargura(el.clientWidth);
    return () => observador.disconnect();
  }, []);

  // Relogio de minuto em minuto: a regua do agora e o selo AGORA mudam nessa
  // resolucao. O segundo a segundo do desktop existe para a regua deslizar
  // sobre a grade; aqui ela so muda de posicao na lista quando vira o minuto.
  const ehHoje = data === hoje;
  useEffect(() => {
    if (!ehHoje) return;
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, [ehHoje]);

  const opcoesSwipe = useMemo(() => ({ largura: largura || 390, total: 3 }), [largura]);

  const paineis = useMemo(
    () =>
      DELTAS.map((delta) => {
        const dataPainel = format(addDays(parseISO(data), delta), 'yyyy-MM-dd');
        // `undefined` = ainda nao adiantado pelo prefetch. Nunca colapsar para
        // [] aqui: "nao carregou" e "nao tem aula" sao coisas diferentes, e
        // colapsar faria o painel anunciar um domingo vazio que talvez tenha
        // dez aulas.
        const cru = delta === 0 ? aulasDoDia : lerDoCache(dataPainel)?.aulas;
        return { delta, data: dataPainel, cru };
      }),
    [data, aulasDoDia, lerDoCache],
  );

  // Por VOLUME, nao alfabetica: os primeiros chips tem de ser os que
  // respondem a maior parte do dia.
  const professores = useMemo(() => professoresPorVolume(aulasDoDia), [aulasDoDia]);

  // A lista inteira mora numa folha com busca. No Consolidado sao dezenas de
  // professores, e achar alguem arrastando um trilho horizontal as cegas nao e
  // navegacao, e sorte.
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [buscaProfessor, setBuscaProfessor] = useState('');
  const professoresFiltrados = useMemo(() => {
    const termo = normalizarBusca(buscaProfessor);
    if (termo === '') return professores;
    return professores.filter((p) => normalizarBusca(p.nome).includes(termo));
  }, [professores, buscaProfessor]);

  useEffect(() => {
    if (!folhaAberta) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFolhaAberta(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [folhaAberta]);

  const pressionar = useCallback((e: PointerEvent<HTMLDivElement>) => {
    setSwipe((s) => aoPressionar(s, { x: e.clientX, y: e.clientY }));
  }, []);

  const mover = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      setSwipe((s) => aoMover(s, { x: e.clientX, y: e.clientY }, opcoesSwipe));
    },
    [opcoesSwipe],
  );

  const soltar = useCallback(() => {
    setSwipe((s) => aoSoltar(s, opcoesSwipe));
  }, [opcoesSwipe]);

  /**
   * A troca de dia so acontece DEPOIS que a animacao termina — por RELOGIO,
   * nunca por `onTransitionEnd`.
   *
   * Trocar a data no `aoSoltar` faria o conteudo se remontar sob o painel que
   * ainda esta deslizando — o dia novo apareceria antes de chegar ao lugar.
   * Entao o palco anima ate 0 ou 2, e aqui, no fim da transicao, o pai troca a
   * data e o indice volta para 1.
   *
   * ⚠️ O reancoramento e um salto de W pixels e PRECISA acontecer sem
   * transicao: com ela ligada, o palco voltaria deslizando e a troca de dia
   * apareceria duas vezes. O duplo requestAnimationFrame existe para religar a
   * transicao so depois que o quadro do salto ja foi pintado — um rAF so ainda
   * cai no mesmo quadro.
   *
   * 🔴 Por que NAO `onTransitionEnd`: com `prefers-reduced-motion: reduce` a
   * classe `motion-reduce:transition-none` apaga a transicao, e transicao que
   * nao existe nunca termina — o evento nao dispara, o reancoramento nao
   * acontece e o dia NUNCA troca por arrasto. Quem pede menos animacao ficaria
   * com o palco travado no vizinho, exibindo a data errada no cabecalho. O
   * relogio funciona nos dois casos, e o `clearTimeout` cobre o desmonte e a
   * troca de dia pelas setas no meio do caminho.
   */
  useEffect(() => {
    if (swipe.indice === 1) return undefined;
    const delta = swipe.indice - 1;
    const id = setTimeout(() => {
      setReancorando(true);
      onTrocarDia(format(addDays(parseISO(data), delta), 'yyyy-MM-dd'));
      setSwipe((s) => ({ ...s, indice: 1 }));
      requestAnimationFrame(() => requestAnimationFrame(() => setReancorando(false)));
    }, DURACAO_TROCA_MS + 20);
    return () => clearTimeout(id);
  }, [swipe.indice, data, onTrocarDia]);

  const escolherProfessor = (nome: string | null) => onFiltrar({ ...filtros, professor: nome });

  const semTransicao = swipe.arrastando || reancorando;

  return (
    <div className="flex flex-col">
      {/* 🔴 O cabecalho e FIXO (sticky), nao rola com a lista.
          O <main> do shell e o container de rolagem e esta tela vive dentro
          dele — sem sticky, a data e o trilho de professores saiam da tela no
          primeiro arrasto para baixo, e num dia de 158 aulas eles passavam a
          maior parte do tempo fora de vista: trocar de dia com o dedo mudava o
          conteudo inteiro sem nada na tela dizendo para qual dia se foi.
          ⚠️ A sangria negativa vai ate a borda do telefone (o <main> tem p-3),
          senao o fundo opaco deixaria uma fresta de 12px de cada lado por onde
          a lista apareceria passando por baixo. */}
      <div className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 border-b border-slate-800 bg-slate-950 px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={() => onTrocarDia(format(addDays(parseISO(data), -1), 'yyyy-MM-dd'))}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 active:bg-slate-800"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* A data e o titulo da tela, nao um widget: uma linha so, com o
              "hoje" embutido. A versao anterior reservava uma segunda linha
              para ele e a deixava VAZIA nos outros dias — 11px de buraco que
              faziam a data pular de lugar ao trocar de dia. */}
          <h2 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-slate-100">
            {rotuloDiaCurto(data)}
            {ehHoje && <span className="ml-1.5 text-[12px] font-semibold text-cyan-300">hoje</span>}
          </h2>
          <button
            type="button"
            aria-label="Próximo dia"
            onClick={() => onTrocarDia(format(addDays(parseISO(data), 1), 'yyyy-MM-dd'))}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 active:bg-slate-800"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[12px] text-slate-400">{resumo}</p>
          {/* Sem isto, voltar de uma semana a frente e tocar a seta sete vezes
              ou arrastar sete telas. So aparece fora do dia de hoje — botao que
              nao faz nada ensina a ignorar o lugar dele. */}
          {!ehHoje && (
            <button
              type="button"
              onClick={() => onTrocarDia(hoje)}
              className="min-h-[32px] flex-shrink-0 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 text-[12px] font-semibold text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              Hoje
            </button>
          )}
          {seletorVisao}
        </div>

        {/* Trilho de professores. Rola no proprio eixo; o gesto de dia vive so
            no palco, abaixo. Ligado e pilula clara solida: ciano e exclusivo de
            navegacao (§6 do spec). */}
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              aria-pressed={filtros.professor === null}
              onClick={() => escolherProfessor(null)}
              className={cn(
                'inline-flex min-h-[34px] flex-shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px]',
                filtros.professor === null
                  ? 'border-slate-500 bg-slate-200 font-bold text-slate-900'
                  : 'border-slate-700 bg-slate-800 font-semibold text-slate-300',
              )}
            >
              Todos · {aulasDoDia.length}
            </button>
            {professores.map(({ nome, qtd }) => {
              const ativo = filtros.professor === nome;
              return (
                <button
                  key={nome}
                  type="button"
                  aria-pressed={ativo}
                  aria-label={`${nome} · ${qtd} ${qtd === 1 ? 'aula' : 'aulas'}`}
                  onClick={() => escolherProfessor(ativo ? null : nome)}
                  className={cn(
                    'inline-flex min-h-[34px] flex-shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px]',
                    ativo
                      ? 'border-slate-500 bg-slate-200 font-bold text-slate-900'
                      : 'border-slate-700 bg-slate-800 font-semibold text-slate-300',
                  )}
                >
                  {/* Sem o disco de iniciais que havia aqui: ele repetia, em
                      20px, a mesma pessoa que o nome ao lado ja nomeia, e os
                      20px custavam um chip inteiro — cabiam tres professores na
                      faixa em vez de cinco. */}
                  {nome.split(' ')[0]} · {qtd}
                </button>
              );
            })}
          </div>

          {/* FIXO, fora da rolagem: com dezenas de professores, um atalho que so
              aparece depois de arrastar ate o fim do trilho nao e atalho.
              ⚠️ O icone e de PESSOAS, nao de funil: ao lado de chips que dizem
              "Nome · 11", um funil com "28" se le como 28 filtros ligados. */}
          {professores.length > 3 && (
            <button
              type="button"
              onClick={() => {
                setBuscaProfessor('');
                setFolhaAberta(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={folhaAberta}
              aria-label={`Ver os ${professores.length} professores do dia`}
              className="inline-flex min-h-[34px] flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-slate-700 bg-slate-800 px-2.5 text-[12.5px] font-semibold text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {professores.length}
            </button>
          )}
        </div>
      </div>

      {folhaAberta && (
        <>
          <button
            type="button"
            aria-label="Fechar lista de professores"
            onClick={() => setFolhaAberta(false)}
            className="fixed inset-0 z-50 bg-slate-950/70"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Professores do dia"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[84%] flex-col rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
            <h2 className="mb-2 px-1 font-grotesk text-sm font-bold text-slate-50">
              Professores do dia · {professores.length}
            </h2>
            <input
              type="search"
              value={buscaProfessor}
              onChange={(e) => setBuscaProfessor(e.target.value)}
              placeholder="Buscar professor…"
              aria-label="Buscar professor"
              className="mb-2 min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => { escolherProfessor(null); setFolhaAberta(false); }}
                className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold text-slate-300"
              >
                Todos os professores
                <span className="tabular-nums text-slate-400">{aulasDoDia.length}</span>
              </button>
              {professoresFiltrados.map(({ nome, qtd }) => (
                <button
                  key={nome}
                  type="button"
                  onClick={() => { escolherProfessor(nome); setFolhaAberta(false); }}
                  className={cn(
                    'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm',
                    filtros.professor === nome
                      ? 'bg-slate-800 font-bold text-cyan-400'
                      : 'font-semibold text-slate-300',
                  )}
                >
                  <span className="min-w-0 truncate">{nome}</span>
                  <span className="flex-shrink-0 tabular-nums text-slate-400">{qtd}</span>
                </button>
              ))}
              {professoresFiltrados.length === 0 && (
                <p className="px-3 py-6 text-center text-[13px] text-slate-400">
                  Nenhum professor com esse nome hoje.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <div
        ref={palcoRef}
        className="overflow-hidden [touch-action:pan-y]"
        onPointerDown={pressionar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <div
          className={cn(
            'flex w-[300%] items-start ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
            semTransicao ? 'transition-none' : 'transition-transform duration-[260ms]',
          )}
          style={{ transform: `translateX(calc(${-swipe.indice * (100 / 3)}% + ${swipe.dx}px))` }}
        >
          {paineis.map((painel) => (
            <PainelDoDia
              key={painel.data}
              data={painel.data}
              cru={painel.cru}
              filtros={filtros}
              agora={agora}
              ehHoje={painel.data === hoje}
              onAbrir={onAbrir}
              onLimparFiltro={() => onFiltrar(FILTROS_AGENDA_VAZIOS)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface PainelProps {
  data: string;
  cru: AulaAgenda[] | undefined;
  filtros: FiltrosAgenda;
  agora: Date;
  ehHoje: boolean;
  onAbrir: (aula: AulaAgenda) => void;
  onLimparFiltro: () => void;
}

function PainelDoDia({ data, cru, filtros, agora, ehHoje, onAbrir, onLimparFiltro }: PainelProps) {
  // ⚠️ `ordenarPorHora` e obrigatorio, nao cosmetico: a RPC devolve as aulas
  // agrupadas por professor, e nesta tela a hora E a ordem. Sem ele a lista
  // volta no tempo no meio da rolagem e a regua do "agora" cai em qualquer
  // ponto.
  const lista = useMemo(
    () => (cru ? ordenarPorHora(filtrarAulas(cru, filtros)) : []),
    [cru, filtros],
  );
  const colisoes = useMemo(() => colisoesDeSala(cru ?? []), [cru]);

  // A regua entra ANTES da primeira aula que ainda nao comecou. Sem nenhuma,
  // o dia ja acabou e ela nao e desenhada.
  const minutos = ehHoje ? minutosAgora(agora) : null;
  const iRegua =
    minutos === null ? -1 : lista.findIndex((a) => minutosDeHHMM(a.hora_inicio) > minutos);

  if (cru === undefined) {
    return (
      <div className="w-1/3 flex-shrink-0 space-y-2 pb-4 pt-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] bg-slate-800" />
        ))}
      </div>
    );
  }

  if (lista.length === 0) {
    const porFiltro = (cru?.length ?? 0) > 0;
    return (
      <div className="w-1/3 flex-shrink-0 px-6 pt-12 text-center">
        <div className="text-[14px] font-semibold text-slate-300">
          {!porFiltro
            ? 'Sem aulas neste dia'
            : filtros.professor !== null
              ? `${filtros.professor} não tem aula neste dia`
              : 'Nenhuma aula corresponde ao filtro'}
        </div>
        {porFiltro && (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
              O dia tem {cru.length} {cru.length === 1 ? 'aula' : 'aulas'}. O filtro continua ligado.
            </p>
            <button
              type="button"
              onClick={onLimparFiltro}
              className="mt-3.5 min-h-[44px] rounded-[10px] border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              Limpar filtros
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    /* ⚠️ Sem overflow-y-auto: quem rola e o <main> do shell. A rolagem
       interna aqui era LETRA MORTA — o pai nao tem altura definida, entao o
       painel nunca chegava a estourar — e, se um dia passasse a valer, criaria
       duas barras de rolagem aninhadas na mesma tela. */
    <div className="flex w-1/3 flex-shrink-0 flex-col gap-2 pb-6 pt-2.5">
      {lista.map((aula, k) => (
        <div key={aula.chave}>
          {k === iRegua && (
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[11px] font-bold tabular-nums text-emerald-300">
                {String(Math.floor((minutos ?? 0) / 60)).padStart(2, '0')}:
                {String((minutos ?? 0) % 60).padStart(2, '0')}
              </span>
              <span className="h-px flex-1 bg-emerald-500" />
            </div>
          )}
          <LinhaAula
            aula={aula}
            data={data}
            agora={agora}
            ehHoje={ehHoje}
            colisao={colisoes.get(aula.chave)}
            ocultarProfessor={filtros.professor !== null}
            /* ⚠️ A hora repetida ESMAECE, nao some. As 11:00 de um dia cheio
               sao seis linhas seguidas e o horario batendo seis vezes vira
               ruido — mas escondê-lo deixa quem rolou para o meio do bloco sem
               nenhuma hora na tela, que e pior: a hora e a unica coordenada
               desta lista. */
            horaRepetida={k > 0 && k !== iRegua && lista[k - 1].hora_inicio === aula.hora_inicio}
            onAbrir={onAbrir}
          />
        </div>
      ))}
    </div>
  );
}

export default AgendaMobile;
