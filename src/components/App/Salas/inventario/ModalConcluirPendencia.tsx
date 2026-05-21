import { type FormEvent, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ItemInventario, PendenciaInventario } from './types';

interface ModalConcluirPendenciaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendencia: PendenciaInventario | null;
  itensDaSala: ItemInventario[];
  onSave: (payload: { resolucao_obs: string; item_vinculado_id: number | null }) => Promise<boolean>;
}

export function ModalConcluirPendencia({
  open,
  onOpenChange,
  pendencia,
  itensDaSala,
  onSave,
}: ModalConcluirPendenciaProps) {
  const [loading, setLoading] = useState(false);
  const [resolucaoObs, setResolucaoObs] = useState('');
  const [itemVinculadoId, setItemVinculadoId] = useState<string>('sem_item');

  useEffect(() => {
    if (!open) return;
    setResolucaoObs(pendencia?.resolucao_obs || '');
    setItemVinculadoId(pendencia?.item_vinculado_id ? String(pendencia.item_vinculado_id) : 'sem_item');
  }, [open, pendencia]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resolucaoObs.trim()) return;

    setLoading(true);
    const success = await onSave({
      resolucao_obs: resolucaoObs.trim(),
      item_vinculado_id: itemVinculadoId === 'sem_item' ? null : Number(itemVinculadoId),
    });
    setLoading(false);

    if (success) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-slate-700 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            Concluir pendência
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <p className="text-sm font-semibold text-white">{pendencia?.titulo || 'Pendência'}</p>
            <p className="mt-1 text-xs text-slate-400">
              {pendencia?.sala_nome || 'Sala'} · {pendencia?.unidade_nome || 'Unidade'}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Como resolveu? *</Label>
            <Textarea
              value={resolucaoObs}
              onChange={(e) => setResolucaoObs(e.target.value)}
              placeholder="Descreva a resolução aplicada"
              className="min-h-[140px] border-slate-700 bg-slate-800"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Vincular a item?</Label>
            <Select value={itemVinculadoId} onValueChange={setItemVinculadoId}>
              <SelectTrigger className="border-slate-700 bg-slate-800">
                <SelectValue placeholder="Selecione um item da sala" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem_item">Não vincular</SelectItem>
                {itensDaSala.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !resolucaoObs.trim()}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {loading ? 'Concluindo...' : 'Concluir pendência'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
