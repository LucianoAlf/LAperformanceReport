import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { 
  FarmerChecklist, 
  FarmerChecklistTemplate, 
  CreateChecklistInput 
} from '../types';

export function useChecklists(
  colaboradorId: number | null,
  unidadeId: string,
  colaboradorUnidadeId?: string | null
) {
  const [checklists, setChecklists] = useState<FarmerChecklist[]>([]);
  const [templates, setTemplates] = useState<FarmerChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'ativo' | 'concluido' | 'todos'>('ativo');

  const fetchChecklists = useCallback(async () => {
    try {
      setLoading(true);

      // Buscar checklists via RPC
      const { data, error } = await supabase.rpc('get_checklists_farmer', {
        p_colaborador_id: colaboradorId,
        p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
        p_status: filtroStatus,
      });

      if (error) throw error;
      setChecklists(data || []);
    } catch (err) {
      console.error('Erro ao buscar checklists:', err);
    } finally {
      setLoading(false);
    }
  }, [colaboradorId, unidadeId, filtroStatus]);

  const fetchTemplates = useCallback(async () => {
    try {
      let query = supabase
        .from('farmer_checklist_templates')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      // Templates globais (unidade_id IS NULL) + templates da unidade
      if (unidadeId && unidadeId !== 'todos') {
        query = query.or(`unidade_id.is.null,unidade_id.eq.${unidadeId}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Erro ao buscar templates:', err);
    }
  }, [unidadeId]);

  useEffect(() => {
    fetchChecklists();
  }, [fetchChecklists]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Criar checklist manual
  const criarChecklist = async (input: CreateChecklistInput) => {
    if (!colaboradorId) return;

    // Usar unidade selecionada, ou fallback para unidade do colaborador logado
    const unidadeParaChecklist = unidadeId !== 'todos' ? unidadeId : colaboradorUnidadeId || null;
    if (!unidadeParaChecklist) {
      console.error('Selecione uma unidade para criar o checklist');
      return;
    }

    const { data, error } = await supabase
      .from('farmer_checklists')
      .insert({
        ...input,
        colaborador_id: colaboradorId,
        unidade_id: unidadeParaChecklist,
      })
      .select()
      .single();

    if (error) throw error;
    await fetchChecklists();
    return data;
  };

  // Criar checklist a partir de template
  const criarFromTemplate = async (
    templateId: string,
    titulo?: string,
    dataPrazo?: string
  ) => {
    if (!colaboradorId) return;

    // Usar unidade selecionada, ou fallback para unidade do colaborador logado
    const unidadeParaChecklist = unidadeId !== 'todos' ? unidadeId : colaboradorUnidadeId || null;
    if (!unidadeParaChecklist) {
      console.error('Selecione uma unidade para criar o checklist');
      return;
    }

    const { data, error } = await supabase.rpc('criar_checklist_from_template', {
      p_template_id: templateId,
      p_colaborador_id: colaboradorId,
      p_unidade_id: unidadeParaChecklist,
      p_titulo: titulo || null,
      p_data_prazo: dataPrazo || null,
    });

    if (error) throw error;
    await fetchChecklists();
    return data; // retorna o UUID do checklist criado
  };

  // Arquivar checklist (soft delete)
  const arquivarChecklist = async (checklistId: string) => {
    const { error } = await supabase
      .from('farmer_checklists')
      .update({ status: 'arquivado', ativo: false, updated_at: new Date().toISOString() })
      .eq('id', checklistId);

    if (error) throw error;
    await fetchChecklists();
  };

  // Contadores derivados
  const checklistsAtivos = checklists.filter(c => c.status === 'ativo');
  const checklistsConcluidos = checklists.filter(c => c.status === 'concluido');

  return {
    checklists,
    checklistsAtivos,
    checklistsConcluidos,
    templates,
    loading,
    filtroStatus,
    setFiltroStatus,
    criarChecklist,
    criarFromTemplate,
    arquivarChecklist,
    refetch: fetchChecklists,
  };
}
