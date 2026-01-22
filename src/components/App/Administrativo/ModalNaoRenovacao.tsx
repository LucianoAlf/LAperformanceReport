import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { AutocompleteAluno } from '@/components/ui/AutocompleteAluno';
import { XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface MotivoSaida {
  id: number;
  nome: string;
  categoria: string;
}

interface ModalNaoRenovacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  professores: { id: number; nome: string }[];
  competencia: string;
  unidadeId?: string | null;
}

export function ModalNaoRenovacao({ open, onOpenChange, onSave, editingItem, professores, competencia, unidadeId }: ModalNaoRenovacaoProps) {
  const [loading, setLoading] = useState(false);
  const [motivosSaida, setMotivosSaida] = useState<MotivoSaida[]>([]);
  const [formData, setFormData] = useState({
    data: new Date(),
    aluno_nome: '',
    aluno_id: null as number | null,
    professor_id: '',
    motivo_saida_id: '',
    observacoes: '',
    agente_comercial: '',
    tempo_permanencia_meses: '',
    valor_parcela: '',
  });

  // Carregar motivos de saída
  useEffect(() => {
    async function loadMotivos() {
      const { data } = await supabase
        .from('motivos_saida')
        .select('id, nome, categoria')
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
          aluno_nome: editingItem.aluno_nome,
          professor_id: editingItem.professor_id?.toString() || '',
          motivo_saida_id: (editingItem as any).motivo_saida_id?.toString() || '',
          observacoes: editingItem.motivo || '',
          agente_comercial: editingItem.agente_comercial || '',
          tempo_permanencia_meses: editingItem.tempo_permanencia_meses?.toString() || '',
          valor_parcela: editingItem.valor_parcela_evasao?.toString() || '',
        });
      } else {
        const [ano, mes] = competencia.split('-');
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          aluno_nome: '',
          aluno_id: null,
          professor_id: '',
          motivo_saida_id: '',
          observacoes: '',
          agente_comercial: '',
          tempo_permanencia_meses: '',
          valor_parcela: '',
        });
      }
    }
  }, [open, editingItem, competencia]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim() || !formData.motivo_saida_id) return;

    const motivoSelecionado = motivosSaida.find(m => m.id.toString() === formData.motivo_saida_id);
    
    setLoading(true);
    const success = await onSave({
      tipo: 'nao_renovacao',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      aluno_id: formData.aluno_id,
      professor_id: formData.professor_id ? parseInt(formData.professor_id) : null,
      motivo: motivoSelecionado?.nome || '',
      motivo_saida_id: parseInt(formData.motivo_saida_id),
      observacoes: formData.observacoes.trim() || null,
      agente_comercial: formData.agente_comercial.trim() || null,
      tempo_permanencia_meses: formData.tempo_permanencia_meses ? parseInt(formData.tempo_permanencia_meses) : null,
      valor_parcela_evasao: formData.valor_parcela ? parseFloat(formData.valor_parcela) : null,
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
            <AutocompleteAluno
              value={formData.aluno_nome}
              onChange={(nome, aluno) => {
                setFormData({ 
                  ...formData, 
                  aluno_nome: nome,
                  aluno_id: aluno?.id || null,
                  professor_id: aluno?.professor_atual_id?.toString() || formData.professor_id
                });
              }}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
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
                value={formData.valor_parcela}
                onChange={(e) => setFormData({ ...formData, valor_parcela: e.target.value })}
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

          <div>
            <Label className="text-slate-300">Agente Administrativo</Label>
            <Input
              value={formData.agente_comercial}
              onChange={(e) => setFormData({ ...formData, agente_comercial: e.target.value })}
              placeholder="Nome"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim() || !formData.motivo_saida_id || !formData.tempo_permanencia_meses || !formData.valor_parcela}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-900"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Não Renovação'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
