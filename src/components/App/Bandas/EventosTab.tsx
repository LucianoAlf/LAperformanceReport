import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar, MapPin, Plus, Guitar, DollarSign, Pencil, Ban, Trash2, DoorOpen,
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

export function EventosTab({ unidadeAtual }: EventosTabProps) {
  const [mostrarPassados, setMostrarPassados] = useState(false);
  // Memoizado: um novo Date().toISOString() a cada render mudaria a referência
  // do parâmetro e re-dispararia o hook em loop (tela piscando)
  const desde = useMemo(
    () => (mostrarPassados ? null : new Date().toISOString()),
    [mostrarPassados],
  );
  const { eventos, loading, recarregar } = useBandaEventos(unidadeAtual, desde);
  // Bandas ativas da unidade para o seletor de participantes
  const { bandas } = useBandasListar(unidadeAtual, 'ativa');

  const [modalAberto, setModalAberto] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<EventoBanda | null>(null);
  const [eventoCancelando, setEventoCancelando] = useState<EventoBanda | null>(null);
  const [eventoRemovendo, setEventoRemovendo] = useState<EventoBanda | null>(null);
  const [processando, setProcessando] = useState(false);

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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="mostrar-passados"
            checked={mostrarPassados}
            onCheckedChange={setMostrarPassados}
          />
          <Label htmlFor="mostrar-passados" className="text-sm text-slate-300 cursor-pointer">
            Mostrar eventos passados
          </Label>
        </div>
        <Button onClick={() => { setEventoEditando(null); setModalAberto(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo evento
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Carregando eventos...</div>
      ) : eventos.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Nenhum evento por aqui</p>
          <p className="text-slate-500 text-sm mt-1">
            Crie o primeiro ensaio ou show para as bandas {unidadeAtual === 'todos' ? 'da rede' : 'da unidade'}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {eventos.map((evento) => (
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
                      onClick={() => { setEventoEditando(evento); setModalAberto(true); }}
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

      <ModalEventoBanda
        aberto={modalAberto}
        evento={eventoEditando}
        unidadeAtual={unidadeAtual}
        bandas={bandas}
        onClose={() => setModalAberto(false)}
        onSalvo={() => { setModalAberto(false); recarregar(); }}
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
