import { useEffect, useState } from 'react';
import {
  AGENDA_ALTURA_FAIXA_PX,
  AGENDA_GAP_FAIXA_PX,
  AGENDA_HORA_FIM,
  AGENDA_HORA_INICIO,
  AGENDA_LARGURA_HORA_PX,
  alocarFaixas,
  contarFaixas,
  dentroDoExpediente,
  larguraPx,
  minutosAgora,
  posicaoPx,
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
  // Opcional: quando a pagina que envolve a timeline ja tem seu proprio
  // relogio (ex.: pra sincronizar com um KPI "em aula agora"), ela passa os
  // minutos aqui e os dois ficam no mesmo tique. Sem a prop, a timeline
  // mantem seu proprio intervalo — continua utilizavel isolada/em teste.
  minutos?: number;
}

export function AgendaTimeline({
  aulas,
  agruparPor,
  selecionada,
  onSelecionar,
  minutos: minutosProp,
  mostrarUnidade = false,
}: Props) {
  const [minutosProprio, setMinutosProprio] = useState(() => minutosAgora(new Date()));

  useEffect(() => {
    if (minutosProp !== undefined) return;
    const id = setInterval(() => setMinutosProprio(minutosAgora(new Date())), 30000);
    return () => clearInterval(id);
  }, [minutosProp]);

  const minutos = minutosProp ?? minutosProprio;

  const horas = Array.from(
    { length: AGENDA_HORA_FIM - AGENDA_HORA_INICIO },
    (_, i) => AGENDA_HORA_INICIO + i,
  );

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

  const reguaVisivel = dentroDoExpediente(minutos);
  const horaAgora = `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

  return (
    <div className="relative overflow-x-auto">
      <div style={{ minWidth: LARGURA_ROTULO + horas.length * AGENDA_LARGURA_HORA_PX }} className="relative">
        <div
          className="sticky top-0 z-10 grid border-b border-slate-700 bg-slate-800/95"
          style={{
            gridTemplateColumns: `${LARGURA_ROTULO}px repeat(${horas.length}, ${AGENDA_LARGURA_HORA_PX}px)`,
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
          const altura =
            PADDING_TRILHO * 2 + nFaixas * AGENDA_ALTURA_FAIXA_PX + (nFaixas - 1) * AGENDA_GAP_FAIXA_PX;

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
                    estilo={{
                      left: posicaoPx(aula.hora_inicio),
                      width: Math.max(46, larguraPx(aula.duracao_minutos) - 4),
                      top: PADDING_TRILHO + aula.faixa * (AGENDA_ALTURA_FAIXA_PX + AGENDA_GAP_FAIXA_PX),
                      height: AGENDA_ALTURA_FAIXA_PX,
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
            style={{ left: LARGURA_ROTULO + posicaoPx(horaAgora) }}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b bg-red-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white">
              {horaAgora}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
