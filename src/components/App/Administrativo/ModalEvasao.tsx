import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { DoorOpen } from 'lucide-react';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface ModalEvasaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  professores: { id: number; nome: string }[];
  competencia: string;
}

const tiposEvasao = [
  { value: 'interrompido', label: 'Interrompido' },
  { value: 'nao_renovou', label: 'Não Renovou' },
  { value: 'interrompido_2_curso', label: 'Interrompido 2º Curso' },
  { value: 'interrompido_bolsista', label: 'Interrompido Bolsista' },
  { value: 'interrompido_banda', label: 'Interrompido Banda' },
];

export function ModalEvasao({ open, onOpenChange, onSave, editingItem, professores, competencia }: ModalEvasaoProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    data: new Date(),
    tipo_evasao: 'interrompido',
    aluno_nome: '',
    professor_id: '',
    motivo: '',
    tempo_permanencia_meses: '',
    valor_parcela_evasao: '',
  });

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData({
          data: new Date(editingItem.data),
          tipo_evasao: editingItem.tipo_evasao || 'interrompido',
          aluno_nome: editingItem.aluno_nome,
          professor_id: editingItem.professor_id?.toString() || '',
          motivo: editingItem.motivo || '',
          tempo_permanencia_meses: editingItem.tempo_permanencia_meses?.toString() || '',
          valor_parcela_evasao: editingItem.valor_parcela_evasao?.toString() || '',
        });
      } else {
        const [ano, mes] = competencia.split('-');
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          tipo_evasao: 'interrompido',
          aluno_nome: '',
          professor_id: '',
          motivo: '',
          tempo_permanencia_meses: '',
          valor_parcela_evasao: '',
        });
      }
    }
  }, [open, editingItem, competencia]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim() || !formData.motivo.trim() || !formData.tempo_permanencia_meses || !formData.valor_parcela_evasao) return;

    setLoading(true);
    const success = await onSave({
      tipo: 'evasao',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      tipo_evasao: formData.tipo_evasao,
      professor_id: formData.professor_id ? parseInt(formData.professor_id) : null,
      motivo: formData.motivo.trim(),
      tempo_permanencia_meses: parseInt(formData.tempo_permanencia_meses),
      valor_parcela_evasao: parseFloat(formData.valor_parcela_evasao),
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center">
              <DoorOpen className="w-5 h-5 text-white" />
            </div>
            {editingItem ? 'Editar Evasão' : 'Registrar Evasão'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Data da Evasão</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => date && setFormData({ ...formData, data: date })}
              />
            </div>
            <div>
              <Label className="text-slate-300">Tipo de Evasão</Label>
              <Select
                value={formData.tipo_evasao}
                onValueChange={(value) => setFormData({ ...formData, tipo_evasao: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {tiposEvasao.map((tipo) => (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      {tipo.label}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Tempo na Escola (meses) *</Label>
              <Input
                type="number"
                min="1"
                value={formData.tempo_permanencia_meses}
                onChange={(e) => setFormData({ ...formData, tempo_permanencia_meses: e.target.value })}
                placeholder="Ex: 18"
                className="bg-slate-800 border-slate-700"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Usado para calcular LTV</p>
            </div>
            <div>
              <Label className="text-slate-300">Valor da Parcela (R$) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.valor_parcela_evasao}
                onChange={(e) => setFormData({ ...formData, valor_parcela_evasao: e.target.value })}
                placeholder="Ex: 450.00"
                className="bg-slate-800 border-slate-700"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Usado para calcular MRR Perdido</p>
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Motivo *</Label>
            <Textarea
              value={formData.motivo}
              onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
              placeholder="Descreva o motivo da evasão..."
              className="bg-slate-800 border-slate-700 min-h-[100px]"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim() || !formData.motivo.trim() || !formData.tempo_permanencia_meses || !formData.valor_parcela_evasao}
            className="w-full bg-gradient-to-r from-rose-500 to-pink-500"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Evasão'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
