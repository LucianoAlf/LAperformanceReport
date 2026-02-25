import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { cn } from '../../../lib/utils';
import { EditableCell, DropdownCell, AutocompleteCell } from '../Spreadsheet';
import { toast } from 'sonner';

// Tipos
interface RetencaoRow {
  id?: number;
  tipo: 'evasao' | 'renovacao' | 'nao_renovacao' | 'aviso_previo';
  // Campos comuns
  unidade_id: string;
  data: string;
  aluno_id: number | null;
  aluno_nome?: string;
  professor_id: number | null;
  valor_parcela: number | null;
  observacoes: string | null;
  // Campos de evasão
  tipo_saida_id?: number | null;
  motivo_saida_id?: number | null;
  situacao_pagamento?: string | null;
  data_prevista_saida?: string | null;
  // Campos de renovação
  valor_parcela_anterior?: number | null;
  valor_parcela_novo?: number | null;
  percentual_reajuste?: number | null;
  agente?: string | null;
  status?: string | null;
  motivo_nao_renovacao_id?: number | null;
  // Controle
  isNew?: boolean;
  isDirty?: boolean;
  expanded?: boolean;
  tabela?: 'movimentacoes_admin' | 'renovacoes';
}

interface Option {
  value: number;
  label: string;
}

const TIPOS_RETENCAO = [
  { value: 'evasao_interrompido', label: 'Evasão - Interrompido' },
  { value: 'evasao_nao_renovou', label: 'Evasão - Não Renovou' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'nao_renovacao', label: 'Não Renovação' },
  { value: 'aviso_previo', label: 'Aviso Prévio' },
];

const SITUACAO_PAGAMENTO = [
  { value: 'em_dia', label: 'Em dia' },
  { value: 'inadimplente', label: 'Inadimplente' },
];

export function PlanilhaRetencao() {
  const { usuario } = useAuth();
  const [rows, setRows] = useState<RetencaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [professores, setProfessores] = useState<Option[]>([]);
  const [motivosSaida, setMotivosSaida] = useState<Option[]>([]);
  const [tiposSaida, setTiposSaida] = useState<Option[]>([]);

  // Carregar dados mestres
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const [professoresRes, motivosRes, tiposRes] = await Promise.all([
          sb.from('professores').select('id, nome').eq('ativo', true).order('nome'),
          sb.from('motivos_saida').select('id, nome').eq('ativo', true).order('nome'),
          sb.from('tipos_saida').select('id, nome').eq('ativo', true).order('id'),
        ]);

        if (professoresRes.data) setProfessores(professoresRes.data.map((p: any) => ({ value: p.id, label: p.nome })));
        if (motivosRes.data) setMotivosSaida(motivosRes.data.map((m: any) => ({ value: m.id, label: m.nome })));
        if (tiposRes.data) setTiposSaida(tiposRes.data.map((t: any) => ({ value: t.id, label: t.nome })));
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
      const sb = supabase as any;

      // Buscar evasões
      let evasoesQuery = sb
        .from('movimentacoes_admin')
        .select(`
          id, unidade_id, data, aluno_id, aluno_nome, professor_id, valor_parcela_evasao, valor_parcela_anterior,
          tipo, tipo_evasao, motivo_saida_id, situacao_pagamento, data_prevista_saida, observacoes,
          alunos(nome)
        `)
        .in('tipo', ['evasao', 'nao_renovacao', 'aviso_previo'])
        .order('data', { ascending: false });

      if (usuario?.perfil !== 'admin' && usuario?.unidade_id) {
        evasoesQuery = evasoesQuery.eq('unidade_id', usuario.unidade_id);
      }

      // Buscar renovações
      let renovacoesQuery = sb
        .from('renovacoes')
        .select(`
          id, unidade_id, data_renovacao, aluno_id, valor_parcela_anterior, valor_parcela_novo,
          percentual_reajuste, status, motivo_nao_renovacao_id, agente, observacoes,
          alunos(nome)
        `)
        .order('data_renovacao', { ascending: false });

      if (usuario?.perfil !== 'admin' && usuario?.unidade_id) {
        renovacoesQuery = renovacoesQuery.eq('unidade_id', usuario.unidade_id);
      }

      const [evasoesRes, renovacoesRes] = await Promise.all([evasoesQuery, renovacoesQuery]);

      const allRows: RetencaoRow[] = [];

      // Processar evasões
      if (evasoesRes.data) {
        evasoesRes.data.forEach((e: any) => {
          allRows.push({
            id: e.id,
            tipo: e.tipo,
            unidade_id: e.unidade_id,
            data: e.data,
            aluno_id: e.aluno_id,
            aluno_nome: e.aluno_nome || e.alunos?.nome,
            professor_id: e.professor_id,
            valor_parcela: e.valor_parcela_evasao || e.valor_parcela_anterior,
            tipo_saida_id: e.tipo === 'evasao' ? 1 : e.tipo === 'nao_renovacao' ? 2 : 3,
            motivo_saida_id: e.motivo_saida_id,
            situacao_pagamento: e.situacao_pagamento,
            data_prevista_saida: e.data_prevista_saida,
            observacoes: e.observacoes,
            isNew: false,
            isDirty: false,
            expanded: false,
            tabela: 'movimentacoes_admin',
          });
        });
      }

      // Processar renovações
      if (renovacoesRes.data) {
        renovacoesRes.data.forEach((r: any) => {
          const tipo: RetencaoRow['tipo'] = r.status === 'nao_renovou' ? 'nao_renovacao' : 'renovacao';

          allRows.push({
            id: r.id,
            tipo,
            unidade_id: r.unidade_id,
            data: r.data_renovacao,
            aluno_id: r.aluno_id,
            aluno_nome: r.alunos?.nome,
            professor_id: null,
            valor_parcela: r.valor_parcela_novo || r.valor_parcela_anterior,
            valor_parcela_anterior: r.valor_parcela_anterior,
            valor_parcela_novo: r.valor_parcela_novo,
            percentual_reajuste: r.percentual_reajuste,
            status: r.status,
            motivo_nao_renovacao_id: r.motivo_nao_renovacao_id,
            agente: r.agente,
            observacoes: r.observacoes,
            isNew: false,
            isDirty: false,
            expanded: false,
            tabela: 'renovacoes',
          });
        });
      }

      // Ordenar por data
      allRows.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      setRows(allRows);
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
    const newRow: RetencaoRow = {
      tipo: 'evasao',
      unidade_id: usuario?.unidade_id || '',
      data: new Date().toISOString().split('T')[0],
      aluno_id: null,
      professor_id: null,
      valor_parcela: null,
      observacoes: null,
      tipo_saida_id: 1, // Interrompido
      motivo_saida_id: null,
      situacao_pagamento: 'em_dia',
      isNew: true,
      isDirty: true,
      expanded: false,
      tabela: 'movimentacoes_admin',
    };

    setRows(prev => [newRow, ...prev]);
  };

  // Atualizar célula
  const updateCell = (index: number, field: keyof RetencaoRow, value: unknown) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        [field]: value,
        isDirty: true,
      };

      // Ajustar tabela e tipo_saida_id baseado no tipo selecionado
      if (field === 'tipo') {
        const tipo = value as string;
        if (tipo === 'evasao_interrompido') {
          newRows[index].tabela = 'movimentacoes_admin';
          newRows[index].tipo_saida_id = 1;
          newRows[index].tipo = 'evasao';
        } else if (tipo === 'evasao_nao_renovou') {
          newRows[index].tabela = 'movimentacoes_admin';
          newRows[index].tipo_saida_id = 2;
          newRows[index].tipo = 'evasao';
        } else if (tipo === 'aviso_previo') {
          newRows[index].tabela = 'movimentacoes_admin';
          newRows[index].tipo_saida_id = 3;
          newRows[index].tipo = 'aviso_previo';
          newRows[index].expanded = true;
        } else if (tipo === 'renovacao') {
          newRows[index].tabela = 'renovacoes';
          newRows[index].status = 'renovado';
          newRows[index].tipo = 'renovacao';
          newRows[index].expanded = true;
        } else if (tipo === 'nao_renovacao') {
          newRows[index].tabela = 'renovacoes';
          newRows[index].status = 'nao_renovou';
          newRows[index].tipo = 'nao_renovacao';
        }
      }

      return newRows;
    });
  };

  // Selecionar aluno (autocomplete)
  const handleSelectAluno = (index: number, alunoId: number | null, alunoData: Record<string, unknown> | null) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = {
        ...newRows[index],
        aluno_id: alunoId,
        aluno_nome: alunoData?.nome as string || '',
        professor_id: alunoData?.professor_atual_id as number || null,
        valor_parcela: alunoData?.valor_parcela as number || null,
        valor_parcela_anterior: alunoData?.valor_parcela as number || null,
        isDirty: true,
      };
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
      const sb = supabase as any;

      if (row.tabela === 'movimentacoes_admin') {
        const dataToSave = {
          unidade_id: row.unidade_id,
          data: row.data,
          aluno_id: row.aluno_id,
          aluno_nome: row.aluno_nome,
          professor_id: row.professor_id,
          valor_parcela_evasao: row.valor_parcela,
          tipo: row.tipo,
          tipo_evasao: row.tipo === 'evasao' ? 'interrompido' : row.tipo === 'nao_renovacao' ? 'nao_renovou' : null,
          motivo_saida_id: row.motivo_saida_id,
          situacao_pagamento: row.situacao_pagamento,
          data_prevista_saida: row.data_prevista_saida,
          observacoes: row.observacoes,
          updated_at: new Date().toISOString(),
        };

        if (row.isNew) {
          const { data, error } = await sb
            .from('movimentacoes_admin')
            .insert({ ...dataToSave, created_by: usuario?.id })
            .select()
            .single();

          if (error) throw error;

          setRows(prev => {
            const newRows = [...prev];
            newRows[index] = { ...newRows[index], id: data.id, isNew: false, isDirty: false };
            return newRows;
          });
        } else {
          const { error } = await sb
            .from('movimentacoes_admin')
            .update(dataToSave)
            .eq('id', row.id);

          if (error) throw error;

          setRows(prev => {
            const newRows = [...prev];
            newRows[index] = { ...newRows[index], isDirty: false };
            return newRows;
          });
        }
      } else {
        // Renovações
        const dataToSave = {
          unidade_id: row.unidade_id,
          data_renovacao: row.data,
          aluno_id: row.aluno_id,
          valor_parcela_anterior: row.valor_parcela_anterior,
          valor_parcela_novo: row.valor_parcela_novo,
          percentual_reajuste: row.percentual_reajuste,
          status: row.status,
          motivo_nao_renovacao_id: row.motivo_nao_renovacao_id,
          agente: row.agente,
          observacoes: row.observacoes,
          updated_at: new Date().toISOString(),
        };

        if (row.isNew) {
          const { data, error } = await sb
            .from('renovacoes')
            .insert({ ...dataToSave, created_by: usuario?.id })
            .select()
            .single();

          if (error) throw error;

          setRows(prev => {
            const newRows = [...prev];
            newRows[index] = { ...newRows[index], id: data.id, isNew: false, isDirty: false };
            return newRows;
          });
        } else {
          const { error } = await sb
            .from('renovacoes')
            .update(dataToSave)
            .eq('id', row.id);

          if (error) throw error;

          setRows(prev => {
            const newRows = [...prev];
            newRows[index] = { ...newRows[index], isDirty: false };
            return newRows;
          });
        }
      }

      toast.success('Registro salvo!');
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
      const sb = supabase as any;
      const { error } = await sb
        .from(row.tabela)
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

  // Obter tipo para exibição
  const getTipoDisplay = (row: RetencaoRow) => {
    if (row.tipo === 'aviso_previo') return 'aviso_previo';
    if (row.tipo === 'renovacao') return 'renovacao';
    if (row.tipo === 'nao_renovacao') return 'nao_renovacao';
    if (row.tipo_saida_id === 1) return 'evasao_interrompido';
    if (row.tipo_saida_id === 2) return 'evasao_nao_renovou';
    return 'evasao_interrompido';
  };

  // Calcular reajuste
  const calcularReajuste = (anterior: number | null, novo: number | null) => {
    if (!anterior || !novo || anterior === 0) return null;
    return ((novo - anterior) / anterior) * 100;
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
          <h1 className="text-2xl font-bold">Planilha Retenção</h1>
          <p className="text-muted-foreground">Registro de evasões, renovações e avisos prévios</p>
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
                <th className="px-3 py-2 text-left text-sm font-medium w-44">Tipo</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-48">Aluno</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-36">Professor</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-36">Motivo</th>
                <th className="px-3 py-2 text-left text-sm font-medium w-28">Parcela</th>
                <th className="px-3 py-2 text-left text-sm font-medium">Obs</th>
                <th className="px-3 py-2 text-center text-sm font-medium w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado. Clique em "Adicionar Linha" para começar.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <React.Fragment key={`${row.tabela}-${row.id || `new-${index}`}`}>
                    {/* Linha principal */}
                    <tr className={cn(
                      'border-b hover:bg-muted/30 transition-colors',
                      row.isDirty && 'bg-yellow-500/10',
                      row.isNew && 'bg-green-500/10'
                    )}>
                      <td className="px-3 py-1">
                        {(row.tipo === 'renovacao' || row.tipo === 'aviso_previo') && (
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
                          value={getTipoDisplay(row)}
                          options={TIPOS_RETENCAO}
                          onChange={(v) => updateCell(index, 'tipo', v)}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <AutocompleteCell
                          value={row.aluno_id}
                          displayValue={row.aluno_nome}
                          onChange={(id, data) => handleSelectAluno(index, id, data)}
                          tableName="alunos"
                          searchField="nome"
                          displayField="nome"
                          filters={{ status: 'ativo', unidade_id: row.unidade_id }}
                          placeholder="Buscar aluno..."
                        />
                      </td>
                      <td className="px-1 py-1">
                        <DropdownCell
                          value={row.professor_id}
                          options={professores}
                          onChange={(v) => updateCell(index, 'professor_id', v)}
                          placeholder="Selecione..."
                          allowClear
                        />
                      </td>
                      <td className="px-1 py-1">
                        <DropdownCell
                          value={row.motivo_saida_id || row.motivo_nao_renovacao_id}
                          options={motivosSaida}
                          onChange={(v) => {
                            if (row.tabela === 'movimentacoes_admin') {
                              updateCell(index, 'motivo_saida_id', v);
                            } else {
                              updateCell(index, 'motivo_nao_renovacao_id', v);
                            }
                          }}
                          placeholder="Selecione..."
                          allowClear
                          disabled={row.tipo === 'renovacao'}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <EditableCell
                          value={row.valor_parcela}
                          onChange={(v) => updateCell(index, 'valor_parcela', v)}
                          type="number"
                          prefix="R$"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <EditableCell
                          value={row.observacoes}
                          onChange={(v) => updateCell(index, 'observacoes', v)}
                          placeholder="Obs..."
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

                    {/* Linha expandida para renovação */}
                    {row.tipo === 'renovacao' && row.expanded && (
                      <tr className="bg-muted/20 border-b">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-4 gap-4">
                            <div>
                              <label className="text-xs text-muted-foreground">Valor Anterior</label>
                              <EditableCell
                                value={row.valor_parcela_anterior}
                                onChange={(v) => {
                                  updateCell(index, 'valor_parcela_anterior', v);
                                  const reajuste = calcularReajuste(v as number, row.valor_parcela_novo || null);
                                  if (reajuste !== null) updateCell(index, 'percentual_reajuste', reajuste);
                                }}
                                type="number"
                                prefix="R$"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Valor Novo</label>
                              <EditableCell
                                value={row.valor_parcela_novo}
                                onChange={(v) => {
                                  updateCell(index, 'valor_parcela_novo', v);
                                  updateCell(index, 'valor_parcela', v);
                                  const reajuste = calcularReajuste(row.valor_parcela_anterior || null, v as number);
                                  if (reajuste !== null) updateCell(index, 'percentual_reajuste', reajuste);
                                }}
                                type="number"
                                prefix="R$"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Reajuste</label>
                              <div className="px-2 py-1.5 mt-1 border rounded bg-muted/50 text-sm">
                                {row.percentual_reajuste !== null && row.percentual_reajuste !== undefined
                                  ? `${row.percentual_reajuste >= 0 ? '+' : ''}${row.percentual_reajuste.toFixed(2)}%`
                                  : '--'}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Agente</label>
                              <EditableCell
                                value={row.agente}
                                onChange={(v) => updateCell(index, 'agente', v)}
                                placeholder="Nome do agente"
                                className="border rounded mt-1"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha expandida para aviso prévio */}
                    {row.tipo === 'aviso_previo' && row.expanded && (
                      <tr className="bg-muted/20 border-b">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-xs text-muted-foreground">Mês Previsto de Saída</label>
                              <EditableCell
                                value={row.data_prevista_saida}
                                onChange={(v) => updateCell(index, 'data_prevista_saida', v)}
                                type="date"
                                className="border rounded mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Situação Pagamento</label>
                              <DropdownCell
                                value={row.situacao_pagamento}
                                options={SITUACAO_PAGAMENTO}
                                onChange={(v) => updateCell(index, 'situacao_pagamento', v)}
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
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Evasões (Mês)</div>
          <div className="text-2xl font-bold text-red-400">
            {rows.filter(r => r.tipo === 'evasao' && r.data?.startsWith(new Date().toISOString().slice(0, 7))).length}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Renovações (Mês)</div>
          <div className="text-2xl font-bold text-green-400">
            {rows.filter(r => r.tipo === 'renovacao' && r.data?.startsWith(new Date().toISOString().slice(0, 7))).length}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Não Renovações (Mês)</div>
          <div className="text-2xl font-bold text-orange-400">
            {rows.filter(r => r.tipo === 'nao_renovacao' && r.data?.startsWith(new Date().toISOString().slice(0, 7))).length}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Avisos Prévios</div>
          <div className="text-2xl font-bold text-yellow-400">
            {rows.filter(r => r.tipo === 'aviso_previo').length}
          </div>
        </div>
      </div>
    </div>
  );
}
