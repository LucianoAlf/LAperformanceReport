import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { AutocompleteAluno, type Aluno } from '@/components/ui/AutocompleteAluno';
import { DoorOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface MotivoSaida {
  id: number;
  nome: string;
}

interface ModalEvasaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  professores: { id: number; nome: string }[];
  competencia: string;
  unidadeId?: string | null;
}

const tiposCancelamento = [
  { value: 'interrompido', label: 'Interrompido' },
  { value: 'interrompido_2_curso', label: 'Interrompido 2º Curso' },
  { value: 'interrompido_bolsista', label: 'Interrompido Bolsista' },
  { value: 'interrompido_banda', label: 'Interrompido Banda' },
];

export function ModalEvasao({ open, onOpenChange, onSave, editingItem, professores, competencia, unidadeId }: ModalEvasaoProps) {
  const [loading, setLoading] = useState(false);
  const [motivosSaida, setMotivosSaida] = useState<MotivoSaida[]>([]);
  const [formData, setFormData] = useState({
    data: new Date(),
    tipo_evasao: 'interrompido',
    aluno_nome: '',
    aluno_id: null as number | null,
    professor_id: '',
    motivo_saida_id: '',
    observacoes: '',
    tempo_permanencia_meses: '',
    valor_parcela_evasao: '',
  });

  // Carregar motivos de saída
  useEffect(() => {
    async function loadMotivos() {
      const { data } = await supabase
        .from('motivos_saida')
        .select('id, nome')
        .eq('ativo', true)
        .order('ordem')
        .order('nome');
      setMotivosSaida(data || []);
    }
    loadMotivos();
  }, []);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData({
          data: new Date(editingItem.data),
          tipo_evasao: editingItem.tipo_evasao || 'interrompido',
          aluno_nome: editingItem.aluno_nome,
          professor_id: editingItem.professor_id?.toString() || '',
          motivo_saida_id: (editingItem as any).motivo_saida_id?.toString() || '',
          observacoes: editingItem.observacoes || '',
          tempo_permanencia_meses: editingItem.tempo_permanencia_meses?.toString() || '',
          valor_parcela_evasao: editingItem.valor_parcela_evasao?.toString() || '',
        });
      } else {
        const [ano, mes] = competencia.split('-');
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          tipo_evasao: 'interrompido',
          aluno_nome: '',
          aluno_id: null,
          professor_id: '',
          motivo_saida_id: '',
          observacoes: '',
          tempo_permanencia_meses: '',
          valor_parcela_evasao: '',
        });
      }
    }
  }, [open, editingItem, competencia]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim() || !formData.motivo_saida_id || !formData.tempo_permanencia_meses || !formData.valor_parcela_evasao) return;

    const motivoSelecionado = motivosSaida.find(m => m.id.toString() === formData.motivo_saida_id);
    
    setLoading(true);
    const success = await onSave({
      tipo: 'evasao',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      aluno_id: formData.aluno_id,
      tipo_evasao: formData.tipo_evasao,
      professor_id: formData.professor_id ? parseInt(formData.professor_id) : null,
      motivo: motivoSelecionado?.nome || '',
      motivo_saida_id: parseInt(formData.motivo_saida_id),
      observacoes: formData.observacoes.trim() || null,
      tempo_permanencia_meses: parseInt(formData.tempo_permanencia_meses),
      valor_parcela_evasao: parseFloat(formData.valor_parcela_evasao),
    } as any);
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
            {editingItem ? 'Editar Cancelamento' : 'Registrar Cancelamento'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Data do Cancelamento</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => date && setFormData({ ...formData, data: date })}
              />
            </div>
            <div>
              <Label className="text-slate-300">Tipo de Cancelamento</Label>
              <Select
                value={formData.tipo_evasao}
                onValueChange={(value) => setFormData({ ...formData, tipo_evasao: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {tiposCancelamento.map((tipo) => (
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
            <AutocompleteAluno
              value={formData.aluno_nome}
              onChange={(nome: string, aluno?: Aluno) => {
                setFormData({ 
                  ...formData, 
                  aluno_nome: nome,
                  aluno_id: aluno?.id || null,
                  valor_parcela_evasao: aluno?.valor_parcela?.toString() || formData.valor_parcela_evasao,
                  professor_id: aluno?.professor_atual_id?.toString() || formData.professor_id
                });
              }}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
              apenasAtivos={false}
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
            <Select
              value={formData.motivo_saida_id}
              onValueChange={(value) => setFormData({ ...formData, motivo_saida_id: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {motivosSaida.map((motivo) => (
                  <SelectItem key={motivo.id} value={motivo.id.toString()}>
                    {motivo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300">Observações (opcional)</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Detalhes adicionais..."
              className="bg-slate-800 border-slate-700 min-h-[80px]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim() || !formData.motivo_saida_id || !formData.tempo_permanencia_meses || !formData.valor_parcela_evasao}
            className="w-full bg-gradient-to-r from-rose-500 to-pink-500"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Cancelamento'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
