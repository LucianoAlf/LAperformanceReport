import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Target, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  onSave: () => void;
}

const TIPOS_META = [
  { value: 'media_turma', label: 'Média de Alunos por Turma' },
  { value: 'retencao', label: 'Taxa de Retenção' },
  { value: 'conversao', label: 'Taxa de Conversão' },
  { value: 'nps', label: 'NPS' },
  { value: 'presenca', label: 'Taxa de Presença' }
];

export function ModalNovaMeta({ open, onClose, professorId, onSave }: Props) {
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState('media_turma');
  const [valorAtual, setValorAtual] = useState('');
  const [valorMeta, setValorMeta] = useState('');
  const [dataInicio, setDataInicio] = useState<Date | undefined>(new Date());
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined);
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    if (open) {
      // Reset form
      setTipo('media_turma');
      setValorAtual('');
      setValorMeta('');
      setDataInicio(new Date());
      setDataFim(undefined);
      setObservacoes('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!professorId || !valorMeta) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('professor_metas')
        .insert({
          professor_id: professorId,
          tipo,
          valor_atual: valorAtual ? parseFloat(valorAtual) : null,
          valor_meta: parseFloat(valorMeta),
          data_inicio: dataInicio ? format(dataInicio, 'yyyy-MM-dd') : null,
          data_fim: dataFim ? format(dataFim, 'yyyy-MM-dd') : null,
          status: 'em_andamento',
          observacoes: observacoes || null
        });

      if (error) throw error;

      onSave();
    } catch (error) {
      console.error('Erro ao salvar meta:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Target className="w-5 h-5 text-blue-400" />
            Nova Meta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-slate-400">Tipo de Meta</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_META.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-400">Valor Atual</Label>
              <Input
                type="number"
                step="0.1"
                value={valorAtual}
                onChange={(e) => setValorAtual(e.target.value)}
                placeholder="Ex: 1.3"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-400">Valor Meta *</Label>
              <Input
                type="number"
                step="0.1"
                value={valorMeta}
                onChange={(e) => setValorMeta(e.target.value)}
                placeholder="Ex: 1.5"
                className="mt-1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-400">Data Início</Label>
              <div className="mt-1">
                <DatePicker
                  date={dataInicio}
                  onDateChange={setDataInicio}
                  placeholder="Selecione a data"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-400">Data Fim (opcional)</Label>
              <div className="mt-1">
                <DatePicker
                  date={dataFim}
                  onDateChange={setDataFim}
                  placeholder="Selecione a data"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-slate-400">Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas sobre a meta..."
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
            disabled={loading || !valorMeta}
            className="bg-gradient-to-r from-blue-500 to-purple-500"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Criar Meta'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
