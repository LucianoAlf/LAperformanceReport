import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PendenciaInventario, Sala, Unidade } from './types';
import { CATEGORIAS_PENDENCIA, PRIORIDADES_PENDENCIA } from './types';

interface PendenciaDraft {
  unidade_id: string;
  sala_id: number | null;
  titulo: string;
  categoria: PendenciaInventario['categoria'];
  prioridade: PendenciaInventario['prioridade'];
  descricao: string;
  solicitante: string;
}

interface ModalPendenciaInventarioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: PendenciaDraft) => Promise<boolean>;
  pendencia?: PendenciaInventario | null;
  unidades: Unidade[];
  salas: Sala[];
  defaultUnidadeId?: string;
  defaultSalaId?: number | null;
  defaultSolicitante?: string;
}

export function ModalPendenciaInventario({
  open,
  onOpenChange,
  onSave,
  pendencia,
  unidades,
  salas,
  defaultUnidadeId,
  defaultSalaId,
  defaultSolicitante,
}: ModalPendenciaInventarioProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<PendenciaDraft>({
    unidade_id: defaultUnidadeId || '',
    sala_id: defaultSalaId || null,
    titulo: '',
    categoria: 'compra',
    prioridade: 'importante',
    descricao: '',
    solicitante: defaultSolicitante || '',
  });

  useEffect(() => {
    if (!open) return;

    if (pendencia) {
      setFormData({
        unidade_id: pendencia.unidade_id,
        sala_id: pendencia.sala_id,
        titulo: pendencia.titulo,
        categoria: pendencia.categoria,
        prioridade: pendencia.prioridade,
        descricao: pendencia.descricao || '',
        solicitante: pendencia.solicitante || defaultSolicitante || '',
      });
      return;
    }

    setFormData({
      unidade_id: defaultUnidadeId || '',
      sala_id: defaultSalaId || null,
      titulo: '',
      categoria: 'compra',
      prioridade: 'importante',
      descricao: '',
      solicitante: defaultSolicitante || '',
    });
  }, [open, pendencia, defaultSalaId, defaultSolicitante, defaultUnidadeId]);

  const salasFiltradas = useMemo(() => {
    if (!formData.unidade_id) return salas;
    return salas.filter((sala) => sala.unidade_id === formData.unidade_id);
  }, [formData.unidade_id, salas]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!formData.unidade_id || !formData.sala_id || !formData.titulo.trim()) {
      return;
    }

    setLoading(true);
    const success = await onSave({
      ...formData,
      titulo: formData.titulo.trim(),
      descricao: formData.descricao.trim(),
      solicitante: formData.solicitante.trim(),
    });
    setLoading(false);

    if (success) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-slate-700 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            {pendencia ? 'Editar pendência' : 'Nova pendência'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-300">Unidade *</Label>
              <Select
                value={formData.unidade_id}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    unidade_id: value,
                    sala_id: prev.sala_id && salas.some((sala) => sala.id === prev.sala_id && sala.unidade_id === value)
                      ? prev.sala_id
                      : null,
                  }))
                }
              >
                <SelectTrigger className="border-slate-700 bg-slate-800">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((unidade) => (
                    <SelectItem key={unidade.id} value={unidade.id}>
                      {unidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Sala *</Label>
              <Select
                value={formData.sala_id ? String(formData.sala_id) : ''}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, sala_id: Number(value) }))}
              >
                <SelectTrigger className="border-slate-700 bg-slate-800">
                  <SelectValue placeholder="Selecione a sala" />
                </SelectTrigger>
                <SelectContent>
                  {salasFiltradas.map((sala) => (
                    <SelectItem key={sala.id} value={String(sala.id)}>
                      {sala.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Título *</Label>
            <Input
              value={formData.titulo}
              onChange={(e) => setFormData((prev) => ({ ...prev, titulo: e.target.value }))}
              placeholder="Ex: Cabo P10 3m"
              className="border-slate-700 bg-slate-800"
              maxLength={200}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-300">Categoria</Label>
              <Select
                value={formData.categoria}
                onValueChange={(value: PendenciaInventario['categoria']) =>
                  setFormData((prev) => ({ ...prev, categoria: value }))
                }
              >
                <SelectTrigger className="border-slate-700 bg-slate-800">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_PENDENCIA.map((categoria) => (
                    <SelectItem key={categoria.value} value={categoria.value}>
                      {categoria.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Prioridade *</Label>
              <Select
                value={formData.prioridade}
                onValueChange={(value: PendenciaInventario['prioridade']) =>
                  setFormData((prev) => ({ ...prev, prioridade: value }))
                }
              >
                <SelectTrigger className="border-slate-700 bg-slate-800">
                  <SelectValue placeholder="Selecione a prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES_PENDENCIA.map((prioridade) => (
                    <SelectItem key={prioridade.value} value={prioridade.value}>
                      {prioridade.emoji} {prioridade.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Solicitante</Label>
            <Input
              value={formData.solicitante}
              onChange={(e) => setFormData((prev) => ({ ...prev, solicitante: e.target.value }))}
              placeholder="Quem pediu essa pendência"
              className="border-slate-700 bg-slate-800"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Descrição</Label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))}
              placeholder="Detalhes adicionais"
              className="min-h-[120px] border-slate-700 bg-slate-800"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.unidade_id || !formData.sala_id || !formData.titulo.trim()}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {loading ? 'Salvando...' : pendencia ? 'Salvar alterações' : 'Criar pendência'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
