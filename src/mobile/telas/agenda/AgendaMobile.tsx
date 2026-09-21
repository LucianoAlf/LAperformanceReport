import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';

import type { AgendaDiaV2, AulaAgenda } from '@/hooks/useAgendaDia';
import {
  colisoesDeSala,
  filtrarAulas,
  FILTROS_AGENDA_VAZIOS,
  iniciaisDoNome,
  minutosAgora,
  minutosDeHHMM,
  opcoesDoCampo,
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

  const professores = useMemo(() => opcoesDoCampo(aulasDoDia, 'professor_nome'), [aulasDoDia]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2.5 px-4 pb-3">
        <button
          type="button"
          aria-label="Dia anterior"
          onClick={() => onTrocarDia(format(addDays(parseISO(data), -1), 'yyyy-MM-dd'))}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-slate-700 bg-slate-800 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-bold tabular-nums text-slate-100">
            {format(parseISO(data), "EEEE, dd/MM")}
          </div>
          <div className="text-[11px] text-slate-400">{ehHoje ? 'hoje' : ''}</div>
        </div>
        <button
          type="button"
          aria-label="Próximo dia"
          onClick={() => onTrocarDia(format(addDays(parseISO(data), 1), 'yyyy-MM-dd'))}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-slate-700 bg-slate-800 text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* chip — trilho de professores. Rola no proprio eixo; o gesto de dia
          vive so no palco, abaixo. Ligado e pilula clara solida: ciano e
          exclusivo de navegacao (§6 do spec). */}
      <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        <button
          type="button"
          aria-pressed={filtros.professor === null}
          onClick={() => escolherProfessor(null)}
          className={cn(
            'inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[12.5px]',
            filtros.professor === null
              ? 'border-slate-500 bg-slate-200 font-bold text-slate-900'
              : 'border-slate-700 bg-slate-800 font-semibold text-slate-300',
          )}
        >
          Todos · {aulasDoDia.length}
        </button>
        {professores.map((nome) => {
          const ativo = filtros.professor === nome;
          const qtd = aulasDoDia.filter((a) => a.professor_nome === nome).length;
          return (
            <button
              key={nome}
              type="button"
              aria-pressed={ativo}
              onClick={() => escolherProfessor(ativo ? null : nome)}
              className={cn(
                'inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px]',
                ativo
                  ? 'border-slate-500 bg-slate-200 font-bold text-slate-900'
                  : 'border-slate-700 bg-slate-800 font-semibold text-slate-300',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-[8.5px] font-bold',
                  ativo ? 'bg-slate-400 text-slate-900' : 'bg-slate-700 text-slate-300',
                )}
              >
                {iniciaisDoNome(nome)}
              </span>
              {nome.split(' ')[0]} · {qtd}
            </button>
          );
        })}
      </div>

      <div
        ref={palcoRef}
        className="min-h-0 flex-1 overflow-hidden [touch-action:pan-y]"
        onPointerDown={pressionar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <div
          className={cn(
            'flex h-full w-[300%] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
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
  const lista = useMemo(() => (cru ? filtrarAulas(cru, filtros) : []), [cru, filtros]);
  const colisoes = useMemo(() => colisoesDeSala(cru ?? []), [cru]);

  // A regua entra ANTES da primeira aula que ainda nao comecou. Sem nenhuma,
  // o dia ja acabou e ela nao e desenhada.
  const minutos = ehHoje ? minutosAgora(agora) : null;
  const iRegua =
    minutos === null ? -1 : lista.findIndex((a) => minutosDeHHMM(a.hora_inicio) > minutos);

  if (cru === undefined) {
    return (
      <div className="w-1/3 flex-shrink-0 space-y-2 overflow-y-auto px-4 pb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] bg-slate-800" />
        ))}
      </div>
    );
  }

  if (lista.length === 0) {
    const porFiltro = (cru?.length ?? 0) > 0;
    return (
      <div className="w-1/3 flex-shrink-0 overflow-y-auto px-6 pt-12 text-center">
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
    <div className="flex w-1/3 flex-shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-4">
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
            onAbrir={onAbrir}
          />
        </div>
      ))}
    </div>
  );
}

export default AgendaMobile;
