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
}

export function AgendaTimeline({ aulas, agruparPor, selecionada, onSelecionar }: Props) {
  const [minutos, setMinutos] = useState(() => minutosAgora(new Date()));

  useEffect(() => {
    const id = setInterval(() => setMinutos(minutosAgora(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  const horas = Array.from(
    { length: AGENDA_HORA_FIM - AGENDA_HORA_INICIO },
    (_, i) => AGENDA_HORA_INICIO + i,
  );

  const grupos = new Map<string, AulaAgenda[]>();
  for (const aula of aulas) {
    const chave =
      (agruparPor === 'professor' ? aula.professor_nome : aula.sala_nome) ?? 'Sem alocação';
    const lista = grupos.get(chave);
    if (lista) lista.push(aula);
    else grupos.set(chave, [aula]);
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

        {[...grupos.entries()].map(([nome, doGrupo]) => {
          const comFaixa = alocarFaixas(doGrupo);
          const nFaixas = contarFaixas(comFaixa);
          const altura =
            PADDING_TRILHO * 2 + nFaixas * AGENDA_ALTURA_FAIXA_PX + (nFaixas - 1) * AGENDA_GAP_FAIXA_PX;

          return (
            <div
              key={nome}
              className="grid border-b border-slate-800"
              style={{ gridTemplateColumns: `${LARGURA_ROTULO}px 1fr` }}
            >
              <div className="flex flex-col justify-center border-r border-slate-700 px-3.5 py-2.5">
                <span className="truncate text-[13px] font-semibold">{nome}</span>
                <span className="text-[11px] text-slate-400">
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
