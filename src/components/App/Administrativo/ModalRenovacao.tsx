import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { AutocompleteAluno, type Aluno } from '@/components/ui/AutocompleteAluno';
import { CheckCircle2 } from 'lucide-react';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface ModalRenovacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
  editingItem: MovimentacaoAdmin | null;
  formasPagamento: { id: number; nome: string; sigla: string }[];
  competencia: string;
  unidadeId?: string | null;
}

export function ModalRenovacao({ open, onOpenChange, onSave, editingItem, formasPagamento, competencia, unidadeId }: ModalRenovacaoProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    data: new Date(),
    aluno_nome: '',
    aluno_id: null as number | null,
    valor_parcela_anterior: '',
    valor_parcela_novo: '',
    forma_pagamento_id: '',
    agente_comercial: '',
  });

  // Resetar form quando abrir/fechar ou mudar item
  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData({
          data: new Date(editingItem.data),
          aluno_nome: editingItem.aluno_nome,
          valor_parcela_anterior: editingItem.valor_parcela_anterior?.toString() || '',
          valor_parcela_novo: editingItem.valor_parcela_novo?.toString() || '',
          forma_pagamento_id: editingItem.forma_pagamento_id?.toString() || '',
          agente_comercial: editingItem.agente_comercial || '',
        });
      } else {
        const [ano, mes] = competencia.split('-');
        setFormData({
          data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate()),
          aluno_nome: '',
          aluno_id: null,
          valor_parcela_anterior: '',
          valor_parcela_novo: '',
          forma_pagamento_id: '',
          agente_comercial: '',
        });
      }
    }
  }, [open, editingItem, competencia]);

  // Calcular reajuste
  const anterior = parseFloat(formData.valor_parcela_anterior) || 0;
  const novo = parseFloat(formData.valor_parcela_novo) || 0;
  const reajuste = anterior > 0 ? ((novo - anterior) / anterior) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aluno_nome.trim()) return;

    setLoading(true);
    const success = await onSave({
      tipo: 'renovacao',
      data: formData.data.toISOString().split('T')[0],
      aluno_nome: formData.aluno_nome.trim(),
      aluno_id: formData.aluno_id,
      valor_parcela_anterior: parseFloat(formData.valor_parcela_anterior) || null,
      valor_parcela_novo: parseFloat(formData.valor_parcela_novo) || null,
      forma_pagamento_id: formData.forma_pagamento_id ? parseInt(formData.forma_pagamento_id) : null,
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            {editingItem ? 'Editar Renovação' : 'Registrar Renovação'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-slate-300">Data da Renovação</Label>
            <DatePicker
              date={formData.data}
              onDateChange={(date) => date && setFormData({ ...formData, data: date })}
            />
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
                  valor_parcela_anterior: aluno?.valor_parcela?.toString() || formData.valor_parcela_anterior,
                });
              }}
              unidadeId={unidadeId}
              placeholder="Digite o nome do aluno..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Parcela Anterior (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.valor_parcela_anterior}
                onChange={(e) => setFormData({ ...formData, valor_parcela_anterior: e.target.value })}
                placeholder="0,00"
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <Label className="text-slate-300">Parcela Nova (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.valor_parcela_novo}
                onChange={(e) => setFormData({ ...formData, valor_parcela_novo: e.target.value })}
                placeholder="0,00"
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          {anterior > 0 && novo > 0 && (
            <div className={`p-3 rounded-lg text-center ${reajuste >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
              <p className="text-xs text-slate-400">Reajuste</p>
              <p className={`text-2xl font-bold ${reajuste >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {reajuste >= 0 ? '+' : ''}{reajuste.toFixed(1)}%
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Forma de Pagamento</Label>
              <Select
                value={formData.forma_pagamento_id}
                onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {formasPagamento.map((fp) => (
                    <SelectItem key={fp.id} value={fp.id.toString()}>
                      {fp.nome} ({fp.sigla})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>

          <Button
            type="submit"
            disabled={loading || !formData.aluno_nome.trim()}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500"
          >
            {loading ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Registrar Renovação'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
