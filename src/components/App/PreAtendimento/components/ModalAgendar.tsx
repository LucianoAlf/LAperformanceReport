import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LeadCRM } from '../types';

interface ModalAgendarProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  lead: LeadCRM | null;
}

export function ModalAgendar({ aberto, onClose, onSalvo, lead }: ModalAgendarProps) {
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState<Date | undefined>(undefined);
  const [horario, setHorario] = useState('');
  const [tipo, setTipo] = useState<string>('experimental');
  const [observacoes, setObservacoes] = useState('');

  const limpar = () => {
    setData(undefined);
    setHorario('');
    setTipo('experimental');
    setObservacoes('');
  };

  const handleClose = () => {
    limpar();
    onClose();
  };

  const handleSalvar = async () => {
    if (!lead || !data) return;

    setSalvando(true);
    try {
      const dataISO = data.toISOString().split('T')[0];

      const updates: Record<string, any> = {
        data_experimental: dataISO,
        horario_experimental: horario || null,
        experimental_agendada: true,
        etapa_pipeline_id: 5, // Experimental Agendada
        data_ultimo_contato: new Date().toISOString(),
      };

      if (observacoes.trim()) {
        updates.observacoes = [lead.observacoes, observacoes.trim()].filter(Boolean).join('\n---\n');
      }

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id);

      if (error) throw error;

      // Registrar no histórico
      await supabase.from('crm_lead_historico').insert({
        lead_id: lead.id,
        tipo: 'agendamento',
        descricao: `${tipo === 'experimental' ? 'Experimental' : 'Visita'} agendada para ${dataISO}${horario ? ` às ${horario}` : ''}`,
      });

      limpar();
      onClose();
      onSalvo?.();
    } catch (err) {
      console.error('Erro ao agendar:', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/20">
              <Calendar className="w-4 h-4 text-violet-400" />
            </div>
            Agendar {tipo === 'experimental' ? 'Experimental' : 'Visita'}
          </DialogTitle>
          <DialogDescription>
            {lead?.nome || 'Lead'} — {getUnidadeCodigo(lead?.unidade_id || '')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="experimental">Aula Experimental</SelectItem>
                <SelectItem value="visita">Visita à Escola</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Data *</label>
              <DatePicker
                date={data}
                onDateChange={setData}
                placeholder="Selecione"
                minDate={new Date()}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Horário</label>
              <Input
                placeholder="14:00"
                value={horario}
                onChange={e => setHorario(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Observações</label>
            <textarea
              placeholder="Notas sobre o agendamento..."
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={!data || salvando}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {salvando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              <><Calendar className="w-4 h-4 mr-2" /> Agendar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getUnidadeCodigo(unidadeId: string): string {
  const map: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  };
  return map[unidadeId] || '';
}

export default ModalAgendar;
