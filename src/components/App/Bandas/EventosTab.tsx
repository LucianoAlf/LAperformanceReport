import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar, CalendarDays, MapPin, Plus, Guitar, DollarSign, Pencil, Ban, Trash2,
  DoorOpen, List, Mic, CalendarClock,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  useBandaEventos, useBandasListar, cancelarEventoBanda, removerEventoBanda,
  type EventoBanda, type EventoStatus,
} from '@/hooks/useBandas';
import { CalendarioEventosBandas } from './CalendarioEventosBandas';
import { GradeEnsaiosBandas } from './GradeEnsaiosBandas';
import { BandaDetalheDialog } from './BandaDetalheDialog';
import { filtrarEventosDaLista } from './eventosBandasCalendario.mjs';
import { projetarEnsaiosNoIntervalo } from './ensaiosBandas.mjs';
import { ModalEventoBanda, EVENTO_TIPO_LABEL } from './ModalEventoBanda';

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

interface EventosTabProps {
  unidadeAtual: string;
}

type VisualizacaoEventos = 'lista' | 'calendario';
/**
 * Duas dimensões INDEPENDENTES: a agenda (o quê) e a visualização (como).
 * Show e ensaio moravam juntos em "Eventos" e se escondiam um no outro — a agenda de
 * shows é esporádica, a de ensaios é a rotina semanal de 27 bandas.
 */
type AgendaBandas = 'shows' | 'ensaios';

export function EventosTab({ unidadeAtual }: EventosTabProps) {
  const [mostrarPassados, setMostrarPassados] = useState(false);
  const [visualizacao, setVisualizacao] = useState<VisualizacaoEventos>(() => {
    const saved = localStorage.getItem('bandas_eventos_visualizacao');
    return saved === 'lista' ? 'lista' : 'calendario';
  });
  const [agenda, setAgenda] = useState<AgendaBandas>(() => {
    const saved = localStorage.getItem('bandas_agenda');
    return saved === 'shows' ? 'shows' : 'ensaios';
  });
  const [bandaAberta, setBandaAberta] = useState<number | null>(null);
  const [mesCalendario, setMesCalendario] = useState(() => startOfMonth(new Date()));
  const [diaCalendario, setDiaCalendario] = useState(() => new Date());
  const [agoraReferencia] = useState(() => new Date());
  const { eventos, loading, recarregar } = useBandaEventos(unidadeAtual, null);
  // Bandas ativas da unidade: seletor de participantes E fonte da grade fixa de ensaios
  const { bandas } = useBandasListar(unidadeAtual, 'ativa');

  const eventosDaAgenda = useMemo(
    () => eventos.filter((e) => (agenda === 'shows' ? e.tipo === 'show' : e.tipo === 'ensaio')),
    [eventos, agenda],
  );
  const eventosLista = useMemo(
    () => filtrarEventosDaLista(eventosDaAgenda, mostrarPassados, agoraReferencia) as EventoBanda[],
    [eventosDaAgenda, mostrarPassados, agoraReferencia],
  );

  // No calendário de ensaios, a grade fixa das bandas entra projetada como ocorrência
  // sintética (evento_id negativo) ao lado dos ensaios extras que existem em banda_evento.
  const eventosDoCalendario = useMemo(() => {
    if (agenda === 'shows') return eventosDaAgenda;
    const projetados = projetarEnsaiosNoIntervalo(
      bandas, startOfMonth(mesCalendario), endOfMonth(mesCalendario),
    ) as EventoBanda[];
    return [...projetados, ...eventosDaAgenda];
  }, [agenda, eventosDaAgenda, bandas, mesCalendario]);

  const [modalAberto, setModalAberto] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<EventoBanda | null>(null);
  const [dataInicial, setDataInicial] = useState<Date | null>(null);
  const [eventoCancelando, setEventoCancelando] = useState<EventoBanda | null>(null);
  const [eventoRemovendo, setEventoRemovendo] = useState<EventoBanda | null>(null);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    localStorage.setItem('bandas_eventos_visualizacao', visualizacao);
  }, [visualizacao]);

  useEffect(() => {
    localStorage.setItem('bandas_agenda', agenda);
  }, [agenda]);

  // Ocorrência projetada não existe em banda_evento: abrir a BANDA, nunca o modal de evento.
  function abrirDoCalendario(evento: EventoBanda) {
    const bandaId = (evento as EventoBanda & { banda_id?: number }).banda_id;
    if (evento.evento_id < 0 && bandaId) {
      setBandaAberta(bandaId);
      return;
    }
    abrirEdicao(evento);
  }

  function abrirCriacao(data?: Date) {
    setEventoEditando(null);
    setDataInicial(data ? new Date(data) : null);
    setModalAberto(true);
  }

  function abrirEdicao(evento: EventoBanda) {
    setDataInicial(null);
    setEventoEditando(evento);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEventoEditando(null);
    setDataInicial(null);
  }

  async function confirmarCancelamento() {
    if (!eventoCancelando) return;
    setProcessando(true);
    const { error } = await cancelarEventoBanda(eventoCancelando.evento_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao cancelar evento', { description: error.message });
      return;
    }
    toast.success('Evento cancelado', { description: eventoCancelando.titulo });
    setEventoCancelando(null);
    recarregar();
  }

  async function confirmarRemocao() {
    if (!eventoRemovendo) return;
    setProcessando(true);
    const { error } = await removerEventoBanda(eventoRemovendo.evento_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao excluir evento', { description: error.message });
      return;
    }
    toast.success('Evento excluído', { description: eventoRemovendo.titulo });
    setEventoRemovendo(null);
    recarregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 rounded-lg bg-slate-700/30 p-1"
            role="group"
            aria-label="Agenda"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={agenda === 'ensaios'}
              onClick={() => setAgenda('ensaios')}
              className={cn(
                'h-8 px-2.5 text-xs text-slate-400 hover:text-white',
                agenda === 'ensaios' && 'bg-cyan-600 text-white hover:bg-cyan-600',
              )}
            >
              <CalendarClock className="h-4 w-4" />
              Ensaios
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={agenda === 'shows'}
              onClick={() => setAgenda('shows')}
              className={cn(
                'h-8 px-2.5 text-xs text-slate-400 hover:text-white',
                agenda === 'shows' && 'bg-emerald-600 text-white hover:bg-emerald-600',
              )}
            >
              <Mic className="h-4 w-4" />
              Shows
            </Button>
          </div>

          <div
            className="flex items-center gap-1 rounded-lg bg-slate-700/30 p-1"
            role="group"
            aria-label="Visualização"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={visualizacao === 'lista'}
              onClick={() => setVisualizacao('lista')}
              className={cn(
                'h-8 px-2.5 text-xs text-slate-400 hover:text-white',
                visualizacao === 'lista' && 'bg-violet-600 text-white hover:bg-violet-600',
              )}
            >
              <List className="h-4 w-4" />
              Lista
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={visualizacao === 'calendario'}
              onClick={() => setVisualizacao('calendario')}
              className={cn(
                'h-8 px-2.5 text-xs text-slate-400 hover:text-white',
                visualizacao === 'calendario' && 'bg-violet-600 text-white hover:bg-violet-600',
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Calendário
            </Button>
          </div>

          {visualizacao === 'lista' && agenda === 'shows' && (
            <div className="flex items-center gap-2">
              <Switch
                id="mostrar-passados"
                checked={mostrarPassados}
                onCheckedChange={setMostrarPassados}
              />
              <Label htmlFor="mostrar-passados" className="cursor-pointer text-sm text-slate-300">
                Mostrar eventos passados
              </Label>
            </div>
          )}
        </div>
        <Button onClick={() => abrirCriacao()}>
          <Plus className="w-4 h-4 mr-2" />
          {agenda === 'shows' ? 'Novo show' : 'Novo ensaio'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Carregando eventos...</div>
      ) : visualizacao === 'lista' && agenda === 'ensaios' ? (
        <GradeEnsaiosBandas
          bandas={bandas}
          ensaiosPontuais={eventosLista}
          unidadeAtual={unidadeAtual}
          onAbrirBanda={setBandaAberta}
          onAbrirEvento={abrirEdicao}
        />
      ) : visualizacao === 'calendario' ? (
        <CalendarioEventosBandas
          eventos={eventosDoCalendario}
          mesAtual={mesCalendario}
          diaSelecionado={diaCalendario}
          onMesAtualChange={setMesCalendario}
          onDiaSelecionadoChange={setDiaCalendario}
          onCriarEvento={abrirCriacao}
          onAbrirEvento={abrirDoCalendario}
          onCancelarEvento={setEventoCancelando}
          onRemoverEvento={setEventoRemovendo}
        />
      ) : eventosLista.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhum show por aqui</p>
          <p className="text-slate-500 text-sm mt-1">
            Agende o primeiro show para as bandas {unidadeAtual === 'todos' ? 'da rede' : 'da unidade'}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {eventosLista.map((evento) => (
            <div
              key={evento.evento_id}
              className={cn(
                'bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4',
                evento.status === 'cancelado' && 'opacity-60',
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white">{evento.titulo}</p>
                    <Badge variant={evento.tipo === 'show' ? 'success' : 'secondary'}>
                      {EVENTO_TIPO_LABEL[evento.tipo]}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[evento.status]}>
                      {STATUS_LABEL[evento.status]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {format(new Date(evento.data_inicio), "dd/MM/yyyy 'às' HH'h'mm", { locale: ptBR })}
                    </span>
                    {evento.local && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        {evento.local}
                      </span>
                    )}
                    {evento.sala_nome && (
                      <span className="flex items-center gap-1.5">
                        <DoorOpen className="w-3.5 h-3.5 text-slate-500" />
                        {evento.sala_nome}
                      </span>
                    )}
                    {evento.orcamento != null && evento.orcamento > 0 && (
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                        {formatCurrency(Number(evento.orcamento))}
                      </span>
                    )}
                  </div>
                  {evento.bandas && (
                    <p className="text-xs text-slate-400 mt-2 flex items-start gap-1.5">
                      <Guitar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                      {evento.bandas}
                    </p>
                  )}
                </div>

                {evento.status === 'agendado' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => abrirEdicao(evento)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-amber-400 hover:text-amber-300"
                      onClick={() => setEventoCancelando(evento)}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" />
                      Cancelar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-rose-400 hover:text-rose-300"
                      onClick={() => setEventoRemovendo(evento)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {bandaAberta !== null && (
        <BandaDetalheDialog
          bandaId={bandaAberta}
          onClose={() => setBandaAberta(null)}
          onAlterado={recarregar}
        />
      )}

      <ModalEventoBanda
        aberto={modalAberto}
        evento={eventoEditando}
        dataInicial={dataInicial}
        unidadeAtual={unidadeAtual}
        bandas={bandas}
        onClose={fecharModal}
        onSalvo={() => { fecharModal(); recarregar(); }}
      />

      <ModalConfirmacao
        aberto={!!eventoCancelando}
        onClose={() => setEventoCancelando(null)}
        onConfirmar={confirmarCancelamento}
        titulo="Cancelar evento"
        mensagem={`Cancelar "${eventoCancelando?.titulo}"? O evento fica no histórico como cancelado.`}
        tipo="warning"
        textoConfirmar="Cancelar evento"
        carregando={processando}
      />
      <ModalConfirmacao
        aberto={!!eventoRemovendo}
        onClose={() => setEventoRemovendo(null)}
        onConfirmar={confirmarRemocao}
        titulo="Excluir evento"
        mensagem={`Excluir "${eventoRemovendo?.titulo}" de vez? Esta ação não pode ser desfeita — prefira cancelar para manter o histórico.`}
        tipo="danger"
        textoConfirmar="Excluir de vez"
        carregando={processando}
      />
    </div>
  );
}
