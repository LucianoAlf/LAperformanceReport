import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Mic2, Plus, CalendarDays, MapPin, Users, Music, Pencil } from 'lucide-react';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useEventos,
  EVENTO_STATUS_LABEL,
  type EventoComResumo,
  type EventoStatus,
} from '@/hooks/useEventos';
import { ModalNovoEvento } from './ModalNovoEvento';
import { ModalEditarEvento } from './ModalEditarEvento';
import { AvisoEmDesenvolvimento } from './AvisoEmDesenvolvimento';

const STATUS_VARIANT: Record<EventoStatus, 'default' | 'success' | 'warning' | 'error'> = {
  rascunho: 'warning',
  publicado: 'default',
  realizado: 'success',
  cancelado: 'error',
};

function CardEvento({
  evento,
  onEditar,
}: {
  evento: EventoComResumo;
  onEditar: () => void;
}) {
  const data = parseISO(evento.data_evento);
  const dataFim = evento.data_fim ? parseISO(evento.data_fim) : null;
  // Recital de varios dias mostra a FAIXA: "13 – 15 nov 2026". Os dias de cada bloco
  // ficam na Grade; aqui basta saber que o evento ocupa mais de uma data.
  const rotuloData =
    dataFim && evento.data_fim !== evento.data_evento
      ? `${format(data, 'd', { locale: ptBR })} – ${format(dataFim, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
      : format(data, "d 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div
      className="relative rounded-xl border border-slate-700 bg-slate-800/50 text-left transition-colors hover:border-slate-600 focus-within:ring-2 focus-within:ring-amber-500"
    >
      <Link
        to={`/app/eventos/${evento.id}`}
        className="block p-4 focus-visible:outline-none"
      >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-white">{evento.titulo}</h3>
          {evento.unidade_nome && (
            <p className="mt-0.5 text-[12.5px] text-slate-400">{evento.unidade_nome}</p>
          )}
        </div>
        <Badge variant={STATUS_VARIANT[evento.status]}>
          {EVENTO_STATUS_LABEL[evento.status]}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
          {rotuloData}
          <span className="text-slate-500">·</span>
          {evento.horario_inicio?.slice(0, 5)}
        </span>
        {evento.local && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-slate-500" />
            {evento.local}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-slate-700/60 pt-3 text-[12.5px]">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          <strong className="tabular-nums text-white">{evento.participantes}</strong> participantes
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <Music className="h-3.5 w-3.5 text-slate-500" />
          <strong className="tabular-nums text-white">{evento.apresentacoes}</strong> apresentações
        </span>
      </div>
      </Link>

      {/* Fora do Link: botao dentro de <a> e invalido e o clique navegaria junto. */}
      <button
        type="button"
        onClick={onEditar}
        aria-label={`Editar ${evento.titulo}`}
        className="absolute bottom-3 right-3 rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function EventosPage() {
  useSetPageTitle({
    titulo: 'Eventos',
    subtitulo: 'Recitais por unidade — participação, blocos e programação',
    icone: Mic2,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-amber-500 to-orange-500',
  });

  const context = useOutletContext<{ unidadeSelecionada: string | null } | undefined>();
  const unidadeAtual = context?.unidadeSelecionada ?? null;

  const { eventos, loading, erro, recarregar } = useEventos(unidadeAtual);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<EventoComResumo | null>(null);

  // Futuros primeiro (é neles que se trabalha); passados abaixo, na ordem inversa.
  const { proximos, passados } = useMemo(() => {
    const hoje = format(new Date(), 'yyyy-MM-dd');
    return {
      proximos: eventos.filter((e) => e.data_evento >= hoje),
      passados: eventos.filter((e) => e.data_evento < hoje),
    };
  }, [eventos]);

  return (
    <div className="space-y-4">
      <PageFilterBar />

      <AvisoEmDesenvolvimento />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-slate-400">
          Cada unidade tem o seu recital, com data própria.
        </p>
        <Button onClick={() => setModalAberto(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Novo evento
        </Button>
      </div>

      <div className={cn('space-y-6 transition-opacity', loading && 'opacity-50')}>
        {erro ? (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
            Não foi possível carregar os eventos: {erro}
          </p>
        ) : loading && eventos.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Carregando eventos…</p>
        ) : eventos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
            <Mic2 className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-300">Nenhum evento criado ainda.</p>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Crie o recital da unidade para começar a montar a programação.
            </p>
          </div>
        ) : (
          <>
            {proximos.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Próximos
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {proximos.map((e) => (
                    <CardEvento key={e.id} evento={e} onEditar={() => setEditando(e)} />
                  ))}
                </div>
              </section>
            )}

            {passados.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Realizados
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {passados.map((e) => (
                    <CardEvento key={e.id} evento={e} onEditar={() => setEditando(e)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <ModalNovoEvento
        aberto={modalAberto}
        unidadeAtual={unidadeAtual}
        onFechar={() => setModalAberto(false)}
        onCriado={() => {
          setModalAberto(false);
          toast.success('Evento criado');
          recarregar();
        }}
      />
      <ModalEditarEvento
        aberto={editando !== null}
        evento={editando}
        onFechar={() => setEditando(null)}
        onSalvo={recarregar}
      />
    </div>
  );
}

export default EventosPage;
