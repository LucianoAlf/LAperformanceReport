import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AGENDA_ALTURA_FAIXA_AMPLA_PX,
  AGENDA_ALTURA_FAIXA_PX,
  AGENDA_GAP_FAIXA_PX,
  AGENDA_LARGURA_HORA_AMPLA_PX,
  alocarFaixas,
  contarFaixas,
  formatarRelogio,
  janelaDeHoras,
  larguraDaHora,
  larguraPx,
  posicaoPx,
  segundosAgora,
} from '@/lib/agenda';
import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { AgendaCard } from './AgendaCard';

const PADDING_TRILHO = 7;
const LARGURA_ROTULO = 150;

interface Props {
  aulas: AulaAgenda[];
  agruparPor: 'professor' | 'sala';
  selecionada: AulaAgenda | null;
  onSelecionar: (aula: AulaAgenda) => void;
  // Agenda consolidada (sem unidade selecionada no header): o trilho passa a
  // dizer de qual escola e cada professor/sala. Alem de rotular, isso muda a
  // CHAVE do agrupamento — sem unidade na chave, "Sala 1" das tres unidades
  // vira um trilho so e as aulas se sobrepoem como se fosse a mesma sala.
  // Com unidade selecionada fica desligado: repetir o nome dela seria ruido.
  mostrarUnidade?: boolean;
  // Dia exibido ('yyyy-MM-dd'). A regua de "agora" so faz sentido no dia de
  // hoje: desenhada num dia passado ou futuro ela marcaria um instante que nao
  // tem relacao nenhuma com as aulas ali.
  ehHoje?: boolean;
}

export function AgendaTimeline({
  aulas,
  agruparPor,
  selecionada,
  onSelecionar,
  mostrarUnidade = false,
  ehHoje = false,
}: Props) {
  // Relogio proprio, de segundo em segundo, isolado neste componente: a regua
  // e a unica coisa que precisa dessa resolucao, e re-renderizar a pagina
  // inteira (com todos os cards) uma vez por segundo seria desperdicio.
  const [segundos, setSegundos] = useState(() => segundosAgora(new Date()));
  useEffect(() => {
    if (!ehHoje) return;
    const id = setInterval(() => setSegundos(segundosAgora(new Date())), 1000);
    return () => clearInterval(id);
  }, [ehHoje]);

  // Largura util para decidir a escala. Medida em vez de fixa porque o mesmo
  // trilho aparece em telas bem diferentes e com o drawer aberto ou fechado.
  const containerRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entrada]) => {
      setLargura(entrada.contentRect.width);
    });
    observer.observe(el);
    setLargura(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const janela = useMemo(
    () => janelaDeHoras(aulas, ehHoje ? segundos : null),
    // `segundos` anda a cada tique, mas a janela so pode mudar quando muda de
    // HORA — depender do segundo cru recalcularia (e reposicionaria os cards)
    // 60 vezes por minuto sem necessidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aulas, ehHoje, Math.floor(segundos / 3600)],
  );

  const horas = Array.from({ length: janela.fim - janela.inicio }, (_, i) => janela.inicio + i);
  const larguraHora = larguraDaHora(largura - LARGURA_ROTULO, horas.length);
  const amplo = larguraHora >= AGENDA_LARGURA_HORA_AMPLA_PX;
  const alturaFaixa = amplo ? AGENDA_ALTURA_FAIXA_AMPLA_PX : AGENDA_ALTURA_FAIXA_PX;

  const grupos = new Map<string, { rotulo: string; unidade: string | null; aulas: AulaAgenda[] }>();
  for (const aula of aulas) {
    const rotulo =
      (agruparPor === 'professor' ? aula.professor_nome : aula.sala_nome) ?? 'Sem alocação';
    const unidade = mostrarUnidade ? aula.unidade_nome : null;
    const chave = unidade ? `${aula.unidade_id}|${rotulo}` : rotulo;
    const grupo = grupos.get(chave);
    if (grupo) grupo.aulas.push(aula);
    else grupos.set(chave, { rotulo, unidade, aulas: [aula] });
  }

  const relogio = formatarRelogio(segundos);
  const horaDaRegua = segundos / 3600;
  const reguaVisivel = ehHoje && horaDaRegua >= janela.inicio && horaDaRegua <= janela.fim;
  // A regua anda por segundo: posiciona pela fracao de hora, nao por 'HH:MM'.
  const posicaoRegua = (horaDaRegua - janela.inicio) * larguraHora;

  return (
    <div ref={containerRef} className="relative overflow-x-auto">
      <div style={{ minWidth: LARGURA_ROTULO + horas.length * larguraHora }} className="relative">
        <div
          className="sticky top-0 z-10 grid border-b border-slate-700 bg-slate-800/95"
          style={{
            gridTemplateColumns: `${LARGURA_ROTULO}px repeat(${horas.length}, ${larguraHora}px)`,
          }}
        >
          <div className="border-r border-slate-700 px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            {agruparPor === 'professor' ? 'Professor' : 'Sala'}
          </div>
          {horas.map((h) => (
            <div key={h} className="border-l border-slate-800 py-1.5 pl-2 text-[11.5px] tabular-nums text-slate-400">
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {[...grupos.entries()].map(([chave, { rotulo, unidade, aulas: doGrupo }]) => {
          const comFaixa = alocarFaixas(doGrupo);
          const nFaixas = contarFaixas(comFaixa);
          const altura = PADDING_TRILHO * 2 + nFaixas * alturaFaixa + (nFaixas - 1) * AGENDA_GAP_FAIXA_PX;

          return (
            <div
              key={chave}
              className="grid border-b border-slate-800"
              style={{ gridTemplateColumns: `${LARGURA_ROTULO}px 1fr` }}
            >
              <div className="flex flex-col justify-center border-r border-slate-700 px-3.5 py-2.5">
                <span className="truncate text-[13px] font-semibold">{rotulo}</span>
                <span className="truncate text-[11px] text-slate-400">
                  {unidade && <span className="text-cyan-400">{unidade} · </span>}
                  {doGrupo.filter((a) => !a.cancelada).length} aulas
                </span>
              </div>
              <div className="relative" style={{ height: Math.max(52, altura) }}>
                {comFaixa.map((aula) => (
                  <AgendaCard
                    key={aula.chave}
                    aula={aula}
                    selecionada={selecionada?.chave === aula.chave}
                    onSelecionar={onSelecionar}
                    amplo={amplo}
                    estilo={{
                      left: posicaoPx(aula.hora_inicio, larguraHora, janela.inicio),
                      width: Math.max(46, larguraPx(aula.duracao_minutos, larguraHora) - 4),
                      top: PADDING_TRILHO + aula.faixa * (alturaFaixa + AGENDA_GAP_FAIXA_PX),
                      height: alturaFaixa,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {reguaVisivel && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-red-500"
            style={{ left: LARGURA_ROTULO + posicaoRegua }}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b bg-red-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white">
              {relogio}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
