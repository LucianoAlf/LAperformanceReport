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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Archive, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LeadCRM } from '../types';

interface ModalArquivarProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  lead: LeadCRM | null;
}

const MOTIVOS_ARQUIVAMENTO = [
  'Não tem interesse',
  'Já matriculou em outra escola',
  'Sem condições financeiras',
  'Mudou de cidade',
  'Não responde há mais de 30 dias',
  'Número inválido / não existe',
  'Duplicado',
  'Lead de teste',
];

export function ModalArquivar({ aberto, onClose, onSalvo, lead }: ModalArquivarProps) {
  const [salvando, setSalvando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const handleClose = () => {
    setMotivo('');
    setObservacoes('');
    onClose();
  };

  const handleSalvar = async () => {
    if (!lead || !motivo) return;

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          arquivado: true,
          motivo_arquivamento: motivo,
          etapa_pipeline_id: 11, // Arquivado
          data_ultimo_contato: new Date().toISOString(),
        })
        .eq('id', lead.id);

      if (error) throw error;

      await supabase.from('crm_lead_historico').insert({
        lead_id: lead.id,
        tipo: 'arquivamento',
        descricao: `Arquivado: ${motivo}${observacoes ? ` — ${observacoes.trim()}` : ''}`,
      });

      handleClose();
      onSalvo?.();
    } catch (err) {
      console.error('Erro ao arquivar:', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/20">
              <Archive className="w-4 h-4 text-rose-400" />
            </div>
            Arquivar Lead
          </DialogTitle>
          <DialogDescription>
            {lead?.nome || 'Lead'} será movido para Arquivados e não aparecerá mais no pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Motivo do arquivamento *</label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_ARQUIVAMENTO.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Observações adicionais</label>
            <textarea
              placeholder="Detalhes sobre o arquivamento..."
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              className="w-full rounded-md bg-slate-800/50 border border-slate-700 text-sm text-white placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={!motivo || salvando}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {salvando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Arquivando...</>
            ) : (
              <><Archive className="w-4 h-4 mr-2" /> Arquivar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalArquivar;
