import { useMemo } from 'react';
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  Guitar,
  MapPin,
  Mic,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EventoBanda, EventoStatus, EventoTipo } from '@/hooks/useBandas';
import { EVENTO_TIPO_LABEL } from './ModalEventoBanda';
import {
  agruparEventosPorDia,
  chaveDiaLocal,
  construirGradeMes,
  limitarEventosDoDia,
} from './eventosBandasCalendario.mjs';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const STATUS_LABEL: Record<EventoStatus, string> = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

const STATUS_VARIANT: Record<EventoStatus, 'default' | 'success' | 'error'> = {
  agendado: 'default',
  realizado: 'success',
  cancelado: 'error',
};

const TIPO_VARIANT: Record<EventoTipo, 'secondary' | 'success'> = {
  ensaio: 'secondary',
  show: 'success',
};

interface CalendarioEventosBandasProps {
  eventos: EventoBanda[];
  mesAtual: Date;
  diaSelecionado: Date;
  onMesAtualChange: (mes: Date) => void;
  onDiaSelecionadoChange: (dia: Date) => void;
  onCriarEvento: (data: Date) => void;
  onAbrirEvento: (evento: EventoBanda) => void;
  onCancelarEvento: (evento: EventoBanda) => void;
  onRemoverEvento: (evento: EventoBanda) => void;
}

function formatarDiaCompleto(data: Date) {
  return format(data, "EEEE, d 'de' MMMM", { locale: ptBR });
}

function EventoIcone({ tipo, className }: { tipo: EventoTipo; className?: string }) {
  const Icone = tipo === 'show' ? Mic : Guitar;
  return <Icone className={className} aria-hidden="true" />;
}

function EstadoIcone({ status }: { status: EventoStatus }) {
  if (status === 'realizado') {
    return <CheckCircle2 className="h-3 w-3 shrink-0" aria-label="Realizado" />;
  }
  if (status === 'cancelado') {
    return <Ban className="h-3 w-3 shrink-0" aria-label="Cancelado" />;
  }
  return null;
}

export function CalendarioEventosBandas({
  eventos,
  mesAtual,
  diaSelecionado,
  onMesAtualChange,
  onDiaSelecionadoChange,
  onCriarEvento,
  onAbrirEvento,
  onCancelarEvento,
  onRemoverEvento,
}: CalendarioEventosBandasProps) {
  const eventosPorDia = useMemo<Map<string, EventoBanda[]>>(
    () => agruparEventosPorDia(eventos),
    [eventos],
  );
  const dias = useMemo(() => construirGradeMes(mesAtual), [mesAtual]);
  const eventosSelecionados = eventosPorDia.get(chaveDiaLocal(diaSelecionado)) ?? [];

  function navegarParaMes(data: Date) {
    const inicio = startOfMonth(data);
    onMesAtualChange(inicio);
    onDiaSelecionadoChange(inicio);
  }

  function irParaMesAnterior() {
    navegarParaMes(subMonths(mesAtual, 1));
  }

  function irParaProximoMes() {
    navegarParaMes(addMonths(mesAtual, 1));
  }

  function irParaHoje() {
    const hoje = new Date();
    onMesAtualChange(startOfMonth(hoje));
    onDiaSelecionadoChange(hoje);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[760px]">
            <header className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-800 bg-slate-800/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 border-slate-700 p-0"
                  onClick={irParaMesAnterior}
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 border-slate-700 p-0"
                  onClick={irParaProximoMes}
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-slate-700 px-3"
                  onClick={irParaHoje}
                >
                  Hoje
                </Button>
              </div>

              <h2 className="text-base font-semibold capitalize text-white sm:text-lg">
                {format(mesAtual, 'MMMM yyyy', { locale: ptBR })}
              </h2>

              <div className="justify-self-end text-xs text-slate-500">
                Clique no espaço livre para agendar
              </div>
            </header>

            <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-800/20">
              {DIAS_SEMANA.map((dia) => (
                <div
                  key={dia}
                  className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  {dia}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {dias.map((dia) => {
                const chave = chaveDiaLocal(dia);
                const eventosNoDia = eventosPorDia.get(chave) ?? [];
                const { visiveis, restantes } = limitarEventosDoDia(eventosNoDia) as {
                  visiveis: EventoBanda[];
                  restantes: number;
                };
                const pertenceAoMes = isSameMonth(dia, mesAtual);
                const selecionado = isSameDay(dia, diaSelecionado);

                return (
                  <div
                    key={chave}
                    className={cn(
                      'group relative min-h-[118px] border-b border-r border-slate-800/70 p-2 text-left transition-colors',
                      !pertenceAoMes && 'bg-slate-950/25 text-slate-600',
                      isToday(dia) && 'bg-emerald-500/[0.07]',
                      selecionado && 'ring-1 ring-inset ring-violet-500/80',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`Agendar evento em ${formatarDiaCompleto(dia)}`}
                      onClick={() => onCriarEvento(dia)}
                      className="absolute inset-0 z-0 text-left outline-none transition-colors hover:bg-slate-800/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                    />

                    <div className="pointer-events-none relative z-10">
                      <button
                        type="button"
                        onClick={() => onDiaSelecionadoChange(dia)}
                        aria-label={`Ver eventos de ${formatarDiaCompleto(dia)}`}
                        aria-pressed={selecionado}
                        className={cn(
                          'pointer-events-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                          pertenceAoMes ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-800',
                          isToday(dia) && 'bg-emerald-500 text-white shadow-sm shadow-emerald-950/40 hover:bg-emerald-500',
                        )}
                      >
                        {format(dia, 'd')}
                      </button>

                    <div className="space-y-1">
                      {visiveis.map((evento) => (
                        <button
                          key={evento.evento_id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAbrirEvento(evento);
                          }}
                          title={`${EVENTO_TIPO_LABEL[evento.tipo]} · ${STATUS_LABEL[evento.status]} · ${evento.titulo}`}
                          className={cn(
                            'pointer-events-auto flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] leading-none transition-colors',
                            evento.tipo === 'show'
                              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                              : 'border-violet-500/25 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20',
                            evento.status === 'realizado' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                            evento.status === 'cancelado' && 'border-rose-500/20 bg-rose-500/[0.07] text-rose-300 opacity-60 line-through',
                          )}
                        >
                          <span className="shrink-0 font-semibold tabular-nums">
                            {format(new Date(evento.data_inicio), 'HH:mm')}
                          </span>
                          <EventoIcone tipo={evento.tipo} className="h-2.5 w-2.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{evento.titulo}</span>
                          <EstadoIcone status={evento.status} />
                          <span className="sr-only">
                            {EVENTO_TIPO_LABEL[evento.tipo]}, {STATUS_LABEL[evento.status]}
                          </span>
                        </button>
                      ))}

                      {restantes > 0 && (
                        <button
                          type="button"
                          onClick={() => onDiaSelecionadoChange(dia)}
                          className="pointer-events-auto flex h-5 items-center rounded px-1.5 text-[10px] font-semibold text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
                          aria-label={`Ver mais ${restantes} eventos de ${formatarDiaCompleto(dia)}`}
                        >
                          +{restantes} {restantes === 1 ? 'evento' : 'eventos'}
                        </button>
                      )}
                    </div>
                    </div>

                    <span className="pointer-events-none absolute bottom-2 right-2 z-10 flex h-6 w-6 translate-y-1 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400 opacity-0 transition-[transform,opacity] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                );
              })}
            </div>

            <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800 bg-slate-800/20 px-4 py-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Guitar className="h-3.5 w-3.5 text-violet-400" /> Ensaio
              </span>
              <span className="flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-emerald-400" /> Show
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Realizado
              </span>
              <span className="flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5 text-rose-400" /> Cancelado
              </span>
            </footer>
          </div>
        </div>
      </section>

      <aside className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-sm">
        <header className="border-b border-slate-800 bg-slate-800/30 px-4 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-300">
            <CalendarDays className="h-3.5 w-3.5" />
            Agenda do dia
          </div>
          <h3 className="mt-1.5 text-base font-semibold capitalize text-white">
            {formatarDiaCompleto(diaSelecionado)}
          </h3>
          <p className="mt-0.5 text-sm text-slate-400">
            {eventosSelecionados.length} {eventosSelecionados.length === 1 ? 'evento' : 'eventos'}
          </p>
        </header>

        <div className="max-h-[620px] space-y-2 overflow-y-auto p-3 scrollbar-thin">
          {eventosSelecionados.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800 text-slate-500">
                <CalendarDays className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-300">Nenhum evento neste dia</p>
              <p className="mt-1 max-w-52 text-xs leading-relaxed text-slate-500">
                Use o botão abaixo ou clique no espaço livre de um dia da grade.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 border-slate-700"
                onClick={() => onCriarEvento(diaSelecionado)}
              >
                <Plus className="h-4 w-4" />
                Agendar neste dia
              </Button>
            </div>
          ) : (
            eventosSelecionados.map((evento) => (
              <article
                key={evento.evento_id}
                className={cn(
                  'group relative rounded-xl border border-slate-800 bg-slate-800/25 p-3',
                  evento.status === 'cancelado' && 'opacity-65',
                )}
              >
                <button
                  type="button"
                  aria-label={`Abrir ${EVENTO_TIPO_LABEL[evento.tipo]}: ${evento.titulo}`}
                  onClick={() => onAbrirEvento(evento)}
                  className="absolute inset-0 z-0 rounded-xl outline-none transition-colors hover:bg-slate-800/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                />

                <div className="pointer-events-none relative z-10">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                      evento.tipo === 'show'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                        : 'border-violet-500/20 bg-violet-500/10 text-violet-300',
                    )}
                  >
                    <EventoIcone tipo={evento.tipo} className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'w-full truncate text-left text-sm font-semibold text-white transition-colors group-hover:text-emerald-300',
                        evento.status === 'cancelado' && 'line-through',
                      )}
                    >
                      {evento.titulo}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant={TIPO_VARIANT[evento.tipo]} className="px-2 py-0 text-[10px]">
                        {EVENTO_TIPO_LABEL[evento.tipo]}
                      </Badge>
                      <Badge variant={STATUS_VARIANT[evento.status]} className="px-2 py-0 text-[10px]">
                        {STATUS_LABEL[evento.status]}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                    {format(new Date(evento.data_inicio), 'HH:mm')}
                    {evento.data_fim && ` – ${format(new Date(evento.data_fim), 'HH:mm')}`}
                  </div>
                  {evento.local && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-500" />
                      <span className="truncate">{evento.local}</span>
                    </div>
                  )}
                  {evento.sala_nome && (
                    <div className="flex items-center gap-1.5">
                      <DoorOpen className="h-3.5 w-3.5 text-slate-500" />
                      <span className="truncate">{evento.sala_nome}</span>
                    </div>
                  )}
                  {evento.bandas && (
                    <div className="flex items-start gap-1.5">
                      <Guitar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="line-clamp-2">{evento.bandas}</span>
                    </div>
                  )}
                </div>

                {evento.status === 'agendado' && (
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-800 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="pointer-events-auto h-7 px-2 text-xs"
                      onClick={() => onAbrirEvento(evento)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="pointer-events-auto h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
                      onClick={() => onCancelarEvento(evento)}
                    >
                      <Ban className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="pointer-events-auto h-7 w-7 p-0 text-rose-400 hover:text-rose-300"
                      onClick={() => onRemoverEvento(evento)}
                      aria-label={`Excluir ${evento.titulo}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
