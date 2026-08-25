import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';
import { Calendar, MapPin, Plus, Guitar, DollarSign, Pencil, Ban, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import { supabase } from '@/lib/supabase';
import {
  criarEventoBanda, atualizarEventoBanda, definirBandasEvento, fetchParticipantesEvento,
  EVENTO_TIPOS,
  type BandaResumo, type EventoBanda, type EventoTipo,
} from '@/hooks/useBandas';

export const EVENTO_TIPO_LABEL: Record<EventoTipo, string> = {
  ensaio: 'Ensaio',
  show: 'Show',
};

interface Sala {
  id: number;
  nome: string;
  unidade_id: string;
}

interface ModalEventoBandaProps {
  aberto: boolean;
  /** null = criar; preenchido = editar */
  evento: EventoBanda | null;
  dataInicial?: Date | null;
  unidadeAtual: string;
  bandas: BandaResumo[];
  onClose: () => void;
  onSalvo: () => void;
}

function combinarDataHora(data: Date, hora: string): string {
  const [h, m] = (hora || '08:00').split(':').map(Number);
  const combinada = new Date(data);
  combinada.setHours(h || 0, m || 0, 0, 0);
  return combinada.toISOString();
}

function isoParaHoraLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ModalEventoBanda({
  aberto,
  evento,
  dataInicial = null,
  unidadeAtual,
  bandas,
  onClose,
  onSalvo,
}: ModalEventoBandaProps) {
  const isEdicao = !!evento;
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<EventoTipo>('ensaio');
  const [unidadeId, setUnidadeId] = useState('');
  const [data, setData] = useState<Date | undefined>(undefined);
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [local, setLocal] = useState('');
  const [salaId, setSalaId] = useState('');
  const [orcamento, setOrcamento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [bandasSelecionadas, setBandasSelecionadas] = useState<number[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Carregar salas e unidades (tabelas canônicas já expostas ao app, ex.: SalasPage)
  useEffect(() => {
    if (!aberto) return;
    supabase.from('salas').select('id, nome, unidade_id').eq('ativo', true).order('nome')
      .then(({ data }) => setSalas((data as Sala[]) || []));
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUnidades(data || []));
  }, [aberto]);

  // Preencher formulário na edição
  useEffect(() => {
    if (!aberto) return;
    setTitulo(evento?.titulo || '');
    setTipo(evento?.tipo || 'ensaio');
    setUnidadeId(unidadeAtual !== 'todos' ? unidadeAtual : '');
    setData(
      evento
        ? new Date(evento.data_inicio)
        : dataInicial
          ? new Date(dataInicial)
          : undefined,
    );
    setHoraInicio(evento ? isoParaHoraLocal(evento.data_inicio) : '');
    setHoraFim(evento?.data_fim ? isoParaHoraLocal(evento.data_fim) : '');
    setLocal(evento?.local || '');
    setSalaId('');
    setOrcamento(evento?.orcamento != null ? String(evento.orcamento) : '');
    setObservacoes('');
    setBandasSelecionadas([]);

    if (evento) {
      fetchParticipantesEvento(evento.evento_id).then((participantes) => {
        setBandasSelecionadas(participantes.map((p) => p.banda_id));
      });
    }
  }, [aberto, evento, unidadeAtual, dataInicial]);

  function alternarBanda(bandaId: number, marcada: boolean) {
    setBandasSelecionadas((prev) =>
      marcada ? [...prev, bandaId] : prev.filter((id) => id !== bandaId),
    );
  }

  const bandasDaUnidade = bandas.filter((b) => !unidadeId || b.unidade_id === unidadeId);

  async function handleSalvar() {
    if (!titulo.trim()) {
      toast.error('Informe o título do evento.');
      return;
    }
    if (!isEdicao && !unidadeId) {
      toast.error('Selecione a unidade do evento.');
      return;
    }
    if (!data) {
      toast.error('Selecione a data do evento.');
      return;
    }
    if (!horaInicio) {
      toast.error('Selecione o horário de início.');
      return;
    }
    const orcamentoNum = orcamento.trim() ? Number(orcamento.replace(',', '.')) : null;
    if (orcamento.trim() && (!Number.isFinite(orcamentoNum) || orcamentoNum! < 0)) {
      toast.error('Orçamento inválido', { description: 'Use um número maior ou igual a zero.' });
      return;
    }

    setSalvando(true);
    const dataInicio = combinarDataHora(data, horaInicio);
    const dataFim = horaFim ? combinarDataHora(data, horaFim) : null;

    if (isEdicao && evento) {
      const { error } = await atualizarEventoBanda(evento.evento_id, {
        titulo: titulo.trim(),
        tipo,
        dataInicio,
        dataFim,
        local: local.trim() || null,
        salaId: salaId ? Number(salaId) : null,
        orcamento: orcamentoNum,
        observacoes: observacoes.trim() || null,
      });
      if (!error) {
        const { error: erroBandas } = await definirBandasEvento(evento.evento_id, bandasSelecionadas);
        if (erroBandas) toast.error('Evento salvo, mas falhou ao atualizar bandas', { description: erroBandas.message });
      }
      setSalvando(false);
      if (error) {
        toast.error('Erro ao atualizar evento', { description: error.message });
        return;
      }
      toast.success('Evento atualizado', { description: titulo.trim() });
      onSalvo();
      return;
    }

    const { error } = await criarEventoBanda({
      unidadeId,
      tipo,
      titulo: titulo.trim(),
      dataInicio,
      dataFim,
      local: local.trim() || null,
      salaId: salaId ? Number(salaId) : null,
      orcamento: orcamentoNum,
      observacoes: observacoes.trim() || null,
      bandas: bandasSelecionadas,
    });
    setSalvando(false);
    if (error) {
      toast.error('Erro ao criar evento', { description: error.message });
      return;
    }
    toast.success('Evento criado', { description: titulo.trim() });
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdicao ? 'Editar evento' : 'Novo evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as EventoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENTO_TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>{EVENTO_TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isEdicao && (
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={unidadeId} onValueChange={setUnidadeId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-titulo">Título</Label>
            <Input
              id="evento-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Ensaio geral, Show de fim de semestre..."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <DatePicker date={data} onDateChange={setData} placeholder="Data" />
            </div>
            <div className="space-y-2">
              <Label>Início</Label>
              <TimePicker24h value={horaInicio} onChange={setHoraInicio} placeholder="Início" />
            </div>
            <div className="space-y-2">
              <Label>Fim (opcional)</Label>
              <TimePicker24h value={horaFim} onChange={setHoraFim} placeholder="Fim" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="evento-local">Local</Label>
              <Input
                id="evento-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex.: Teatro, pátio da unidade..."
              />
            </div>
            <div className="space-y-2">
              <Label>Sala (opcional)</Label>
              <Select value={salaId} onValueChange={setSalaId}>
                <SelectTrigger><SelectValue placeholder="Sem sala" /></SelectTrigger>
                <SelectContent>
                  {salas
                    .filter((s) => !unidadeId || s.unidade_id === unidadeId)
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-orcamento">Orçamento previsto (R$)</Label>
            <Input
              id="evento-orcamento"
              value={orcamento}
              onChange={(e) => setOrcamento(e.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              placeholder="Opcional — planejamento, não é lançamento financeiro"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-observacoes">Observações</Label>
            <Textarea
              id="evento-observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Bandas participantes</Label>
            {bandasDaUnidade.length === 0 ? (
              <p className="text-xs text-slate-500">
                {unidadeId ? 'Nenhuma banda ativa nesta unidade.' : 'Selecione a unidade para ver as bandas.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto rounded-xl border border-slate-700/50 p-3">
                {bandasDaUnidade.map((banda) => (
                  <label
                    key={banda.banda_id}
                    className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer"
                  >
                    <Checkbox
                      checked={bandasSelecionadas.includes(banda.banda_id)}
                      onCheckedChange={(checked) => alternarBanda(banda.banda_id, checked === true)}
                    />
                    <Guitar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{banda.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
