import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { AutocompleteAluno } from '@/components/ui/AutocompleteAluno';
import { PauseCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface MotivoTrancamento {
  id: number;
  nome: string;
}

interface ModalTrancamentoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  professores: { id: number; nome: string }[];
  competencia: string;
  unidadeId?: string | null;
}

export function ModalTrancamento({ open, onOpenChange, onSave, editingItem, professores, competencia, unidadeId }: ModalTrancamentoProps) {
  const [loading, setLoading] = useState(false);
  const [motivosTrancamento, setMotivosTrancamento] = useState<MotivoTrancamento[]>([]);
  const [formData, setFormData] = useState({
    data: new Date(),
    aluno_nome: '',
    aluno_id: null as number | null,
    professor_id: '',
    motivo_trancamento_id: '',
    observacoes: '',
    previsao_retorno: null as Date | null,
  });

  // Carregar motivos de trancamento
  useEffect(() => {
    async function loadMotivos() {
      const { data } = await supabase
        .from('motivos_trancamento')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      setMotivosTrancamento(data || []);
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
          motivo_trancamento_id: (editingItem as any).motivo_trancamento_id?.toString() || '',
          observacoes: editingItem.motivo || '',
          previsao_retorno: editingItem.previsao_retorno ? new Date(editingItem.previsao_retorno) : null,
        });
      } else {
        const [ano, mes] = competencia.split('-');
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          aluno_nome: '',
          aluno_id: null,
          professor_id: '',
          motivo_trancamento_id: '',
          observacoes: '',
          previsao_retorno: null,
        });
      }
    }
  }, [open, editingItem, competencia]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim() || !formData.motivo_trancamento_id || !formData.previsao_retorno) return;

    const motivoSelecionado = motivosTrancamento.find(m => m.id.toString() === formData.motivo_trancamento_id);
    
    setLoading(true);
    const success = await onSave({
      tipo: 'trancamento',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      aluno_id: formData.aluno_id,
      professor_id: formData.professor_id ? parseInt(formData.professor_id) : null,
      motivo: motivoSelecionado?.nome || '',
      motivo_trancamento_id: parseInt(formData.motivo_trancamento_id),
      observacoes: formData.observacoes.trim() || null,
      previsao_retorno: formData.previsao_retorno ? formData.previsao_retorno.toISOString().split('T')[0] : null,
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
              <PauseCircle className="w-5 h-5 text-white" />
            </div>
            {editingItem ? 'Editar Trancamento' : 'Registrar Trancamento'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Data do Trancamento *</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => setFormData({ ...formData, data: date || new Date() })}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <Label className="text-slate-300">Previsão de Retorno *</Label>
              <DatePicker
                date={formData.previsao_retorno}
                onDateChange={(date) => setFormData({ ...formData, previsao_retorno: date })}
                className="bg-slate-800 border-slate-700"
                placeholder="Selecione uma data"
              />
              <p className="text-xs text-slate-500 mt-1">Quando o aluno pretende voltar</p>
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Nome do Aluno *</Label>
            <AutocompleteAluno
              value={formData.aluno_nome}
              onChange={(nome, aluno) => {
                // Salvar aluno_id e professor quando aluno é selecionado
                if (aluno) {
                  setFormData(prev => ({ 
                    ...prev, 
                    aluno_nome: nome,
                    aluno_id: aluno.id,
                    professor_id: aluno.professor_atual_id?.toString() || '' 
                  }));
                } else {
                  setFormData(prev => ({ 
                    ...prev, 
                    aluno_nome: nome,
                    aluno_id: null 
                  }));
                }
              }}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
              apenasAtivos={false}
            />
          </div>

          <div>
            <Label className="text-slate-300">Professor</Label>
            <Select value={formData.professor_id} onValueChange={(value) => setFormData({ ...formData, professor_id: value })}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Selecione o professor (opcional)" />
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
            <Label className="text-slate-300">Motivo do Trancamento *</Label>
            <Select
              value={formData.motivo_trancamento_id}
              onValueChange={(value) => setFormData({ ...formData, motivo_trancamento_id: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {motivosTrancamento.map((motivo) => (
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

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <p className="text-sm text-amber-400">
              💡 <strong>Importante:</strong> O trancamento pausa temporariamente a matrícula do aluno. 
              Quando o aluno retornar, será necessário reativá-lo no sistema.
            </p>
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim() || !formData.motivo_trancamento_id || !formData.previsao_retorno}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Trancamento'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
