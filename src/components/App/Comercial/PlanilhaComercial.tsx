import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { cn } from '../../../lib/utils';
import { EditableCell, DropdownCell } from '../Spreadsheet';
import { toast } from 'sonner';

// Tipos
interface LeadDiario {
  id?: number;
  unidade_id: string;
  data: string;
  tipo: string;
  canal_origem_id: number | null;
  curso_id: number | null;
  quantidade: number;
  observacoes: string | null;
  // Campos de matrícula
  aluno_nome: string | null;
  aluno_idade: number | null;
  professor_experimental_id: number | null;
  professor_fixo_id: number | null;
  agente_comercial: string | null;
  valor_passaporte: number | null;
  valor_parcela: number | null;
  forma_pagamento_id: number | null;
  tipo_matricula: string | null;
  aluno_novo_retorno: string | null;
}

interface Option {
  value: number;
  label: string;
}

const TIPOS_COMERCIAL = [
  { value: 'lead', label: 'Lead' },
  { value: 'experimental_agendada', label: 'Exp. Agendada' },
  { value: 'experimental_realizada', label: 'Exp. Realizada' },
  { value: 'experimental_faltou', label: 'Exp. Faltou' },
  { value: 'visita_escola', label: 'Visita à Escola' },
  { value: 'matricula', label: 'Matrícula' },
];

const TIPOS_MATRICULA = [
  { value: 'EMLA', label: 'EMLA (Adulto)' },
  { value: 'LAMK', label: 'LAMK (Kids)' },
];

const ALUNO_TIPO = [
  { value: 'novo', label: 'Aluno Novo' },
  { value: 'retorno', label: 'Retorno (Ex-aluno)' },
];

export function PlanilhaComercial() {
  const { usuario } = useAuth();
  const [rows, setRows] = useState<(LeadDiario & { isNew?: boolean; isDirty?: boolean; expanded?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canais, setCanais] = useState<Option[]>([]);
  const [cursos, setCursos] = useState<Option[]>([]);
  const [professores, setProfessores] = useState<Option[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<Option[]>([]);

  // Carregar dados mestres
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const [canaisRes, cursosRes, professoresRes, formasRes] = await Promise.all([
          sb.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
          sb.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
          sb.from('professores').select('id, nome').eq('ativo', true).order('nome'),
          sb.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
        ]);

        if (canaisRes.data) setCanais(canaisRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        if (cursosRes.data) setCursos(cursosRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        if (professoresRes.data) setProfessores(professoresRes.data.map((p: any) => ({ value: p.id, label: p.nome })));
        if (formasRes.data) setFormasPagamento(formasRes.data.map((f: any) => ({ value: f.id, label: f.nome })));
      } catch (error) {
        console.error('Erro ao carregar dados mestres:', error);
      }
    };

    loadMasterData();
  }, []);

  // Carregar dados da planilha
  const loadData = useCallback(async () => {
    if (!usuario?.unidade_id && usuario?.perfil !== 'admin') return;

    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('leads_diarios')
        .select('*')
        .order('data', { ascending: false })
        .order('id', { ascending: false });

      // Filtrar por unidade se não for admin
      if (usuario?.perfil !== 'admin' && usuario?.unidade_id) {
        query = query.eq('unidade_id', usuario.unidade_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      setRows((data || []).map((item: LeadDiario) => ({
        ...item,
        isNew: false,
        isDirty: false,
        expanded: false,
      })));
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [usuario?.unidade_id, usuario?.perfil]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Adicionar nova linha
  const addRow = () => {
    const newRow: LeadDiario & { isNew: boolean; isDirty: boolean; expanded: boolean } = {
      unidade_id: usuario?.unidade_id || '',
      data: new Date().toISOString().split('T')[0],
      tipo: 'lead',
      canal_origem_id: null,
      curso_id: null,
      quantidade: 1,
      observacoes: null,
      aluno_nome: null,
      aluno_idade: null,
      professor_experimental_id: null,
      professor_fixo_id: null,
      agente_comercial: null,
      valor_passaporte: null,
      valor_parcela: null,
      forma_pagamento_id: null,
      tipo_matricula: null,
      aluno_novo_retorno: null,
      isNew: true,
      isDirty: true,
      expanded: false,
    };

    setRows(prev => [newRow, ...prev]);
  };

  // Atualizar célula
  const updateCell = (index: number, field: keyof LeadDiario, value: unknown) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        [field]: value,
        isDirty: true,
      };

      // Se mudou para matrícula, expandir automaticamente
      if (field === 'tipo' && value === 'matricula') {
        newRows[index].expanded = true;
        newRows[index].quantidade = 1; // Matrícula sempre é 1
      }

      return newRows;
    });
  };

  // Toggle expansão
  const toggleExpand = (index: number) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        expanded: !newRows[index].expanded,
      };
      return newRows;
    });
  };

  // Salvar linha
  const saveRow = async (index: number) => {
    const row = rows[index];
    if (!row.isDirty) return;

    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dataToSave: any = {
        unidade_id: row.unidade_id,
        data: row.data,
        tipo: row.tipo,
        canal_origem_id: row.canal_origem_id,
        curso_id: row.curso_id,
        quantidade: row.quantidade,
        observacoes: row.observacoes,
        updated_at: new Date().toISOString(),
      };

      // Campos de matrícula
      if (row.tipo === 'matricula') {
        dataToSave.aluno_nome = row.aluno_nome;
        dataToSave.aluno_idade = row.aluno_idade;
        dataToSave.professor_experimental_id = row.professor_experimental_id;
        dataToSave.professor_fixo_id = row.professor_fixo_id;
        dataToSave.agente_comercial = row.agente_comercial;
        dataToSave.valor_passaporte = row.valor_passaporte;
        dataToSave.valor_parcela = row.valor_parcela;
        dataToSave.forma_pagamento_id = row.forma_pagamento_id;
        dataToSave.tipo_matricula = row.tipo_matricula;
        dataToSave.aluno_novo_retorno = row.aluno_novo_retorno;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAny = supabase as any;

      if (row.isNew) {
        dataToSave.created_by = usuario?.id;
        const { data, error } = await supabaseAny
          .from('leads_diarios')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;

        setRows(prev => {
          const newRows = [...prev];
          newRows[index] = { ...data, isNew: false, isDirty: false, expanded: row.expanded };
          return newRows;
        });

        toast.success('Registro salvo!');
      } else {
        const { data, error } = await supabaseAny
          .from('leads_diarios')
          .update(dataToSave)
          .eq('id', row.id)
          .select()
          .single();

        if (error) throw error;

        setRows(prev => {
          const newRows = [...prev];
          newRows[index] = { ...data, isNew: false, isDirty: false, expanded: row.expanded };
          return newRows;
        });

        toast.success('Registro atualizado!');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar registro');
    } finally {
      setSaving(false);
    }
  };

  // Deletar linha
  const deleteRow = async (index: number) => {
    const row = rows[index];

    if (row.isNew) {
      setRows(prev => prev.filter((_, i) => i !== index));
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leads_diarios')
        .delete()
        .eq('id', row.id);

      if (error) throw error;

      setRows(prev => prev.filter((_, i) => i !== index));
      toast.success('Registro removido!');
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro ao remover registro');
    }
  };

  // Formatar data para exibição
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planilha Comercial</h1>
          <p className="text-muted-foreground">Registro diário de leads, experimentais e matrículas</p>
        </div>
        <button
          onClick={addRow}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Adicionar Linha
        </button>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-2 text-left text-sm font-medium w-10"></th>
                <th className="px-3 py-2 text-left text-sm font-medium w-28">Data</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-36">Tipo</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-36">Canal</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-36">Curso</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-20">Qtd</th>
                <th className="px-3 py-2 text-left text-sm font-medium">Observações</th>
                <th className="px-3 py-2 text-center text-sm font-medium w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado. Clique em "Adicionar Linha" para começar.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <React.Fragment key={row.id || `new-${index}`}>
                    {/* Linha principal */}
                    <tr className={cn(
                      'border-b hover:bg-muted/30 transition-colors',
                      row.isDirty && 'bg-yellow-500/10',
                      row.isNew && 'bg-green-500/10'
                    )}>
                      <td className="px-3 py-1">
                        {row.tipo === 'matricula' && (
                          <button
                            onClick={() => toggleExpand(index)}
                            className="p-1 hover:bg-muted rounded"
                          >
                            {row.expanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        <EditableCell
                          value={row.data}
                          onChange={(v) => updateCell(index, 'data', v)}
                          type="date"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <DropdownCell
                          value={row.tipo}
                          options={TIPOS_COMERCIAL}
                          onChange={(v) => updateCell(index, 'tipo', v)}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <DropdownCell
                          value={row.canal_origem_id}
                          options={canais}
                          onChange={(v) => updateCell(index, 'canal_origem_id', v)}
                          placeholder="Selecione..."
                          allowClear
                          disabled={row.tipo !== 'lead'}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <DropdownCell
                          value={row.curso_id}
                          options={cursos}
                          onChange={(v) => updateCell(index, 'curso_id', v)}
                          placeholder="Selecione..."
                          allowClear
                        />
                      </td>
                      <td className="px-1 py-1">
                        <EditableCell
                          value={row.quantidade}
                          onChange={(v) => updateCell(index, 'quantidade', v)}
                          type="number"
                          min={1}
                          disabled={row.tipo === 'matricula'}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <EditableCell
                          value={row.observacoes}
                          onChange={(v) => updateCell(index, 'observacoes', v)}
                          placeholder="Observações..."
                        />
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex items-center justify-center gap-1">
                          {row.isDirty && (
                            <button
                              onClick={() => saveRow(index)}
                              disabled={saving}
                              className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                              title="Salvar"
                            >
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => deleteRow(index)}
                            className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Linha expandida para matrícula */}
                    {row.tipo === 'matricula' && row.expanded && (
                      <tr className="bg-muted/20 border-b">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-4 gap-4">
                            <div>
                              <label className="text-xs text-muted-foreground">Nome do Aluno</label>
                              <EditableCell
                                value={row.aluno_nome}
                                onChange={(v) => updateCell(index, 'aluno_nome', v)}
                                placeholder="Nome completo"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Idade</label>
                              <EditableCell
                                value={row.aluno_idade}
                                onChange={(v) => updateCell(index, 'aluno_idade', v)}
                                type="number"
                                min={3}
                                max={100}
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Prof. Experimental</label>
                              <DropdownCell
                                value={row.professor_experimental_id}
                                options={professores}
                                onChange={(v) => updateCell(index, 'professor_experimental_id', v)}
                                placeholder="Selecione..."
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Prof. Fixo</label>
                              <DropdownCell
                                value={row.professor_fixo_id}
                                options={professores}
                                onChange={(v) => updateCell(index, 'professor_fixo_id', v)}
                                placeholder="Selecione..."
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Agente Comercial</label>
                              <EditableCell
                                value={row.agente_comercial}
                                onChange={(v) => updateCell(index, 'agente_comercial', v)}
                                placeholder="Nome do agente"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Passaporte (R$)</label>
                              <EditableCell
                                value={row.valor_passaporte}
                                onChange={(v) => updateCell(index, 'valor_passaporte', v)}
                                type="number"
                                prefix="R$"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Parcela (R$)</label>
                              <EditableCell
                                value={row.valor_parcela}
                                onChange={(v) => updateCell(index, 'valor_parcela', v)}
                                type="number"
                                prefix="R$"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Forma Pagamento</label>
                              <DropdownCell
                                value={row.forma_pagamento_id}
                                options={formasPagamento}
                                onChange={(v) => updateCell(index, 'forma_pagamento_id', v)}
                                placeholder="Selecione..."
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Tipo Matrícula</label>
                              <DropdownCell
                                value={row.tipo_matricula}
                                options={TIPOS_MATRICULA}
                                onChange={(v) => updateCell(index, 'tipo_matricula', v)}
                                placeholder="Selecione..."
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Aluno</label>
                              <DropdownCell
                                value={row.aluno_novo_retorno}
                                options={ALUNO_TIPO}
                                onChange={(v) => updateCell(index, 'aluno_novo_retorno', v)}
                                placeholder="Selecione..."
                                className="border rounded mt-1"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Leads Hoje</div>
          <div className="text-2xl font-bold">
            {rows
              .filter(r => r.tipo === 'lead' && r.data === new Date().toISOString().split('T')[0])
              .reduce((sum, r) => sum + (r.quantidade || 0), 0)}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Experimentais Hoje</div>
          <div className="text-2xl font-bold">
            {rows
              .filter(r => r.tipo.startsWith('experimental') && r.data === new Date().toISOString().split('T')[0])
              .reduce((sum, r) => sum + (r.quantidade || 0), 0)}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Matrículas Hoje</div>
          <div className="text-2xl font-bold">
            {rows
              .filter(r => r.tipo === 'matricula' && r.data === new Date().toISOString().split('T')[0])
              .length}
          </div>
        </div>
      </div>
    </div>
  );
}
