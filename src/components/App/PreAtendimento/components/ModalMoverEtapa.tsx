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
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LeadCRM, PipelineEtapa } from '../types';

interface ModalMoverEtapaProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  lead: LeadCRM | null;
  etapas: PipelineEtapa[];
}

export function ModalMoverEtapa({ aberto, onClose, onSalvo, lead, etapas }: ModalMoverEtapaProps) {
  const [salvando, setSalvando] = useState(false);
  const [etapaDestinoId, setEtapaDestinoId] = useState('');

  const handleClose = () => {
    setEtapaDestinoId('');
    onClose();
  };

  const handleSalvar = async () => {
    if (!lead || !etapaDestinoId) return;
    const novaEtapaId = Number(etapaDestinoId);
    if (novaEtapaId === lead.etapa_pipeline_id) return;

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          etapa_pipeline_id: novaEtapaId,
          data_ultimo_contato: new Date().toISOString(),
        })
        .eq('id', lead.id);

      if (error) throw error;

      const etapaOrigem = etapas.find(e => e.id === lead.etapa_pipeline_id);
      const etapaDestino = etapas.find(e => e.id === novaEtapaId);
      await supabase.from('crm_lead_historico').insert({
        lead_id: lead.id,
        tipo: 'etapa_alterada',
        descricao: `Movido de "${etapaOrigem?.nome || '?'}" para "${etapaDestino?.nome || '?'}"`,
      });

      setEtapaDestinoId('');
      onClose();
      onSalvo?.();
    } catch (err) {
      console.error('Erro ao mover etapa:', err);
    } finally {
      setSalvando(false);
    }
  };

  const etapaAtual = etapas.find(e => e.id === lead?.etapa_pipeline_id);

  return (
    <Dialog open={aberto} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/20">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
            </div>
            Mover Etapa
          </DialogTitle>
          <DialogDescription>
            {lead?.nome || 'Lead'} — Etapa atual: {etapaAtual?.icone} {etapaAtual?.nome}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="text-xs text-slate-400 mb-1 block">Nova etapa</label>
          <Select value={etapaDestinoId} onValueChange={setEtapaDestinoId}>
            <SelectTrigger className="bg-slate-800/50 border-slate-700">
              <SelectValue placeholder="Selecione a etapa destino" />
            </SelectTrigger>
            <SelectContent>
              {etapas
                .filter(e => e.ativo && e.id !== lead?.etapa_pipeline_id)
                .map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.icone} {e.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={!etapaDestinoId || salvando}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {salvando ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Movendo...</>
            ) : (
              <><ArrowRightLeft className="w-4 h-4 mr-2" /> Mover</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalMoverEtapa;
