import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { AlertTriangle } from 'lucide-react';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface ModalAvisoPrevioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  professores: { id: number; nome: string }[];
  competencia: string;
}

export function ModalAvisoPrevio({ open, onOpenChange, onSave, editingItem, professores, competencia }: ModalAvisoPrevioProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    data: new Date(),
    mes_saida: '',
    aluno_nome: '',
    valor_parcela: '',
    professor_id: '',
    motivo: '',
  });

  // Gerar opções de mês de saída (próximos 6 meses)
  const mesesSaida = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i + 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData({
          data: new Date(editingItem.data),
          mes_saida: editingItem.mes_saida || '',
          aluno_nome: editingItem.aluno_nome,
          valor_parcela: editingItem.valor_parcela_novo?.toString() || editingItem.valor_parcela_anterior?.toString() || '',
          professor_id: editingItem.professor_id?.toString() || '',
          motivo: editingItem.motivo || '',
        });
      } else {
        const [ano, mes] = competencia.split('-');
        // Mês de saída padrão = próximo mês
        const proximoMes = new Date(parseInt(ano), parseInt(mes), 1);
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          mes_saida: `${proximoMes.getFullYear()}-${String(proximoMes.getMonth() + 1).padStart(2, '0')}-01`,
          aluno_nome: '',
          valor_parcela: '',
          professor_id: '',
          motivo: '',
        });
      }
    }
  }, [open, editingItem, competencia]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim() || !formData.motivo.trim()) return;

    setLoading(true);
    const success = await onSave({
      tipo: 'aviso_previo',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      valor_parcela_novo: parseFloat(formData.valor_parcela) || null,
      professor_id: formData.professor_id ? parseInt(formData.professor_id) : null,
      mes_saida: formData.mes_saida || null,
      motivo: formData.motivo.trim(),
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            {editingItem ? 'Editar Aviso Prévio' : 'Registrar Aviso Prévio'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Data do Aviso</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => date && setFormData({ ...formData, data: date })}
              />
            </div>
            <div>
              <Label className="text-slate-300">Mês de Saída</Label>
              <Select
                value={formData.mes_saida}
                onValueChange={(value) => setFormData({ ...formData, mes_saida: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {mesesSaida.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Parcela (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.valor_parcela}
                onChange={(e) => setFormData({ ...formData, valor_parcela: e.target.value })}
                placeholder="0,00"
                className="bg-slate-800 border-slate-700"
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
          </div>

          <div>
            <Label className="text-slate-300">Motivo *</Label>
            <Textarea
              value={formData.motivo}
              onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
              placeholder="Descreva o motivo da saída..."
              className="bg-slate-800 border-slate-700 min-h-[100px]"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim() || !formData.motivo.trim()}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Aviso Prévio'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
