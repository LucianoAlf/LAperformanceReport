import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerNascimento } from '@/components/ui/date-picker-nascimento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface ModalNovoAlunoProps {
  onClose: () => void;
  onSalvar: () => void;
  professores: {id: number, nome: string}[];
  cursos: {id: number, nome: string}[];
  tiposMatricula: {id: number, nome: string}[];
  salas: {id: number, nome: string, capacidade_maxima: number}[];
  horarios: {id: number, nome: string, hora_inicio: string}[];
  unidadeAtual: string;
}

const TIPOS_ALUNO = [
  { value: 'pagante', label: 'Pagante' },
  { value: 'bolsista_integral', label: 'Bolsista Integral' },
  { value: 'bolsista_parcial', label: 'Bolsista Parcial' },
  { value: 'nao_pagante', label: 'Não Pagante' },
];

export function ModalNovoAluno({
  onClose,
  onSalvar,
  professores,
  cursos,
  tiposMatricula,
  salas,
  horarios,
  unidadeAtual
}: ModalNovoAlunoProps) {
  const { isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [canais, setCanais] = useState<{value: number, label: string}[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<{value: number, label: string}[]>([]);
  const [unidades, setUnidades] = useState<{value: string, label: string}[]>([]);
  
  const [formData, setFormData] = useState({
    data: new Date(),
    aluno_nome: '',
    unidade_id: unidadeAtual,
    aluno_data_nascimento: null as Date | null,
    tipo_aluno: 'pagante',
    curso_id: null as number | null,
    canal_origem_id: null as number | null,
    teve_experimental: false,
    professor_experimental_id: null as number | null,
    professor_fixo_id: null as number | null,
    valor_passaporte: null as number | null,
    forma_pagamento_passaporte: '',
    parcelas_passaporte: 1,
    valor_parcela: null as number | null,
    forma_pagamento_id: null as number | null,
    dia_vencimento: 5,
  });

  useEffect(() => {
    async function loadData() {
      const [canaisRes, formasPagamentoRes, unidadesRes] = await Promise.all([
        supabase.from('canais_origem').select('id, nome').eq('ativo', true),
        supabase.from('formas_pagamento').select('id, nome').eq('ativo', true),
        supabase.from('unidades').select('id, nome').eq('ativo', true),
      ]);

      if (canaisRes.data) {
        setCanais(canaisRes.data.map(c => ({ value: c.id, label: c.nome })));
      }
      if (formasPagamentoRes.data) {
        setFormasPagamento(formasPagamentoRes.data.map(f => ({ value: f.id, label: f.nome })));
      }
      if (unidadesRes.data) {
        setUnidades(unidadesRes.data.map(u => ({ value: u.id, label: u.nome })));
      }
    }
    loadData();
  }, []);

  async function handleSave() {
    if (!formData.aluno_nome || !formData.aluno_data_nascimento || !formData.forma_pagamento_id) {
      alert('Preencha os campos obrigatórios: Nome, Data de Nascimento e Forma de Pagamento');
      return;
    }

    setSaving(true);

    try {
      // Calcular classificação baseada na idade
      const idade = Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      const classificacao = idade < 12 ? 'LAMK' : 'EMLA';

      // Determinar tipo_matricula_id baseado em tipo_aluno
      let tipo_matricula_id = 1; // Regular por padrão
      if (formData.tipo_aluno === 'bolsista_integral') tipo_matricula_id = 2;
      else if (formData.tipo_aluno === 'bolsista_parcial') tipo_matricula_id = 3;
      else if (formData.tipo_aluno === 'nao_pagante') tipo_matricula_id = 4;

      const { error } = await supabase
        .from('alunos')
        .insert({
          nome: formData.aluno_nome.trim(),
          data_nascimento: formData.aluno_data_nascimento.toISOString().split('T')[0],
          unidade_id: formData.unidade_id,
          classificacao,
          curso_id: formData.curso_id,
          professor_atual_id: formData.professor_fixo_id,
          valor_parcela: formData.valor_parcela,
          valor_passaporte: formData.valor_passaporte,
          tipo_matricula_id,
          tipo_aluno: formData.tipo_aluno,
          forma_pagamento_id: formData.forma_pagamento_id,
          dia_vencimento: formData.dia_vencimento || 5,
          canal_origem_id: formData.canal_origem_id,
          professor_experimental_id: formData.teve_experimental ? formData.professor_experimental_id : null,
          status: 'ativo',
          data_matricula: formData.data.toISOString().split('T')[0],
        });

      if (error) throw error;

      onSalvar();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      alert(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormData({
      data: new Date(),
      aluno_nome: '',
      unidade_id: unidadeAtual,
      aluno_data_nascimento: null,
      tipo_aluno: 'pagante',
      curso_id: null,
      canal_origem_id: null,
      teve_experimental: false,
      professor_experimental_id: null,
      professor_fixo_id: null,
      valor_passaporte: null,
      forma_pagamento_passaporte: '',
      parcelas_passaporte: 1,
      valor_parcela: null,
      forma_pagamento_id: null,
      dia_vencimento: 5,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">Registrar Matrícula</h3>
          <button onClick={() => { onClose(); resetForm(); }} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Data da Matrícula</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => setFormData({ ...formData, data: date || new Date() })}
                placeholder="Selecione a data"
              />
            </div>
            <div>
              <Label className="mb-2 block">Nome do Aluno *</Label>
              <Input
                type="text"
                value={formData.aluno_nome}
                onChange={(e) => setFormData({ ...formData, aluno_nome: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            {isAdmin && (
              <div>
                <Label className="mb-2 block">Unidade *</Label>
                <Select
                  value={formData.unidade_id || ''}
                  onValueChange={(value) => setFormData({ ...formData, unidade_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.value} value={u.value.toString()}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">Data de Nascimento *</Label>
                <DatePickerNascimento
                  date={formData.aluno_data_nascimento || undefined}
                  onDateChange={(date) => setFormData({ ...formData, aluno_data_nascimento: date || null })}
                  placeholder="Selecione..."
                />
                {formData.aluno_data_nascimento && (
                  <p className="text-xs text-slate-400 mt-1">
                    Idade: {Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000))} anos
                    {' → '}
                    <span className={Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) < 12 ? 'text-cyan-400' : 'text-violet-400'}>
                      {Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) < 12 ? 'LAMK' : 'EMLA'}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Tipo Aluno</Label>
                <Select
                  value={formData.tipo_aluno}
                  onValueChange={(value) => setFormData({ ...formData, tipo_aluno: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ALUNO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Curso</Label>
              <Select
                value={formData.curso_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, curso_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {cursos.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Canal de Origem</Label>
              <Select
                value={formData.canal_origem_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, canal_origem_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {canais.map((c) => (
                    <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="teveExp" className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    id="teveExp"
                    checked={formData.teve_experimental}
                    onChange={(e) => setFormData({ ...formData, teve_experimental: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-800 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all group-hover:border-slate-500 peer-checked:group-hover:bg-emerald-400 flex items-center justify-center">
                    <svg className={`w-3 h-3 text-white transition-opacity ${formData.teve_experimental ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <span className="text-slate-300 group-hover:text-white transition-colors">Teve aula experimental?</span>
              </label>
            </div>
            {formData.teve_experimental && (
              <div>
                <Label className="mb-2 block">Professor da Experimental</Label>
                <Select
                  value={formData.professor_experimental_id?.toString() || ''}
                  onValueChange={(value) => setFormData({ ...formData, professor_experimental_id: parseInt(value) || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {professores.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="mb-2 block">Professor Fixo</Label>
              <Select
                value={formData.professor_fixo_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, professor_fixo_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {professores.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-amber-400">🎫 Passaporte</h4>
              <div className={`grid gap-3 ${formData.forma_pagamento_passaporte === 'cartao_credito' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <Label className="mb-1 block text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_passaporte || ''}
                    onChange={(e) => setFormData({ ...formData, valor_passaporte: parseFloat(e.target.value) || null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Forma Pagamento</Label>
                  <Select
                    value={formData.forma_pagamento_passaporte}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_passaporte: value, parcelas_passaporte: value === 'cartao_credito' ? 1 : 1 })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="link">Link de Pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.forma_pagamento_passaporte === 'cartao_credito' && (
                  <div>
                    <Label className="mb-1 block text-xs">Parcelas</Label>
                    <Select
                      value={formData.parcelas_passaporte?.toString() || '1'}
                      onValueChange={(value) => setFormData({ ...formData, parcelas_passaporte: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="1x" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x (à vista)</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                        <SelectItem value="3">3x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-cyan-400">📅 Parcela Mensal</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_parcela || ''}
                    onChange={(e) => setFormData({ ...formData, valor_parcela: parseFloat(e.target.value) || null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Forma Pagamento *</Label>
                  <Select
                    value={formData.forma_pagamento_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: parseInt(value) || null })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formasPagamento.map((f) => (
                        <SelectItem key={f.value} value={f.value.toString()}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Vencimento</Label>
                  <Select
                    value={formData.dia_vencimento?.toString() || '5'}
                    onValueChange={(value) => setFormData({ ...formData, dia_vencimento: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Dia..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Dia 5</SelectItem>
                      <SelectItem value="20">Dia 20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.aluno_nome || !formData.aluno_data_nascimento || !formData.forma_pagamento_id}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Matrícula
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
