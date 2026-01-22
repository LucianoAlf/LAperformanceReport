import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { XCircle } from 'lucide-react';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface ModalNaoRenovacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  professores: { id: number; nome: string }[];
  competencia: string;
}

export function ModalNaoRenovacao({ open, onOpenChange, onSave, editingItem, professores, competencia }: ModalNaoRenovacaoProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    data: new Date(),
    aluno_nome: '',
    professor_id: '',
    motivo: '',
    agente_comercial: '',
  });

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData({
          data: new Date(editingItem.data),
          aluno_nome: editingItem.aluno_nome,
          professor_id: editingItem.professor_id?.toString() || '',
          motivo: editingItem.motivo || '',
          agente_comercial: editingItem.agente_comercial || '',
        });
      } else {
        const [ano, mes] = competencia.split('-');
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          aluno_nome: '',
          professor_id: '',
          motivo: '',
          agente_comercial: '',
        });
      }
    }
  }, [open, editingItem, competencia]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim() || !formData.motivo.trim()) return;

    setLoading(true);
    const success = await onSave({
      tipo: 'nao_renovacao',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      professor_id: formData.professor_id ? parseInt(formData.professor_id) : null,
      motivo: formData.motivo.trim(),
      agente_comercial: formData.agente_comercial.trim() || null,
    });
    setLoading(false);

    if (success) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-white text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-white" />
            </div>
            {editingItem ? 'Editar Não Renovação' : 'Registrar Não Renovação'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-slate-300">Data</Label>
            <DatePicker
              date={formData.data}
              onDateChange={(date) => date && setFormData({ ...formData, data: date })}
            />
          </div>

          <div>
            <Label className="text-slate-300">Nome do Aluno *</Label>
            <Input
              value={formData.aluno_nome}
              onChange={(e) => setFormData({ ...formData, aluno_nome: e.target.value })}
              placeholder="Nome completo"
              className="bg-slate-800 border-slate-700"
              required
            />
          </div>

          <div>
            <Label className="text-slate-300">Professor</Label>
            <Select
              value={formData.professor_id}
              onValueChange={(value) => setFormData({ ...formData, professor_id: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {professores.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id.toString()}>
                    {prof.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300">Motivo *</Label>
            <Textarea
              value={formData.motivo}
              onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
              placeholder="Descreva o motivo da não renovação..."
              className="bg-slate-800 border-slate-700 min-h-[100px]"
              required
            />
          </div>

          <div>
            <Label className="text-slate-300">Agente Comercial</Label>
            <Input
              value={formData.agente_comercial}
              onChange={(e) => setFormData({ ...formData, agente_comercial: e.target.value })}
              placeholder="Nome"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim() || !formData.motivo.trim()}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-900"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Não Renovação'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
