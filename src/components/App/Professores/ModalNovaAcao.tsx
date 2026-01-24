import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  onSave: () => void;
}

const TIPOS_ACAO = [
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'checkpoint', label: 'Checkpoint' },
  { value: 'remanejamento', label: 'Remanejamento' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'mentoria', label: 'Mentoria' },
  { value: 'outro', label: 'Outro' }
];

const DURACOES = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' }
];

export function ModalNovaAcao({ open, onClose, professorId, onSave }: Props) {
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState('reuniao');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState<Date | undefined>(new Date());
  const [horario, setHorario] = useState('10:00');
  const [duracao, setDuracao] = useState('60');
  const [local, setLocal] = useState('');

  useEffect(() => {
    if (open) {
      // Reset form
      setTipo('reuniao');
      setTitulo('');
      setDescricao('');
      setData(new Date());
      setHorario('10:00');
      setDuracao('60');
      setLocal('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!professorId || !titulo || !data) return;

    setLoading(true);
    try {
      const dataFormatada = format(data, 'yyyy-MM-dd');
      const dataAgendada = new Date(`${dataFormatada}T${horario}:00`);

      const { error } = await supabase
        .from('professor_acoes')
        .insert({
          professor_id: professorId,
          tipo,
          titulo,
          descricao: descricao || null,
          data_agendada: dataAgendada.toISOString(),
          duracao_minutos: parseInt(duracao),
          local: local || null,
          status: 'pendente'
        });

      if (error) throw error;

      onSave();
    } catch (error) {
      console.error('Erro ao salvar ação:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Calendar className="w-5 h-5 text-blue-400" />
            Nova Ação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-slate-400">Tipo de Ação</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ACAO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-400">Título *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Treinamento de engajamento"
              className="mt-1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-400">Data *</Label>
              <div className="mt-1">
                <DatePicker
                  date={data}
                  onDateChange={setData}
                  placeholder="Selecione a data"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-400">Horário</Label>
              <div className="mt-1">
                <TimePicker24h
                  value={horario}
                  onChange={setHorario}
                  placeholder="Selecione o horário"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-400">Duração</Label>
              <Select value={duracao} onValueChange={setDuracao}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURACOES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-400">Local</Label>
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex: Sala de Reuniões"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-400">Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes da ação..."
              className="mt-1 h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !titulo || !data}
            className="bg-gradient-to-r from-blue-500 to-purple-500"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Agendar Ação'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
