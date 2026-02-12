import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  FarmerChecklistItem,
  FarmerChecklistContato,
  CreateChecklistItemInput,
} from '../types';

interface ChecklistDetailData {
  checklist_id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  periodicidade: string | null;
  departamento: string | null;
  tipo_vinculo: string | null;
  filtro_vinculo: Record<string, unknown> | null;
  data_inicio: string | null;
  data_prazo: string | null;
  prioridade: string;
  status: string;
  lembrete_whatsapp: boolean;
  alerta_dias_antes: number;
  alerta_hora: string | null;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_apelido: string | null;
  unidade_id: string;
  created_at: string;
}

export function useChecklistDetail(checklistId: string | null) {
  const [detail, setDetail] = useState<ChecklistDetailData | null>(null);
  const [items, setItems] = useState<FarmerChecklistItem[]>([]);
  const [contatos, setContatos] = useState<FarmerChecklistContato[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!checklistId) {
      setDetail(null);
      setItems([]);
      setContatos([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Buscar detalhe via RPC
      const { data: detailData, error: detailError } = await supabase
        .rpc('get_checklist_detail', { p_checklist_id: checklistId });

      if (detailError) throw detailError;
      if (detailData && detailData.length > 0) {
        setDetail(detailData[0]);
      }

      // Buscar itens
      const { data: itemsData, error: itemsError } = await supabase
        .from('farmer_checklist_items')
        .select('*')
        .eq('checklist_id', checklistId)
        .order('ordem')
        .order('created_at');

      if (itemsError) throw itemsError;

      // Organizar itens em árvore (pais + sub-itens)
      const allItems = itemsData || [];
      const parentItems = allItems.filter(i => !i.parent_id);
      const organized = parentItems.map(parent => ({
        ...parent,
        sub_items: allItems.filter(i => i.parent_id === parent.id),
      }));
      setItems(organized);

      // Buscar contatos com joins
      const { data: contatosData, error: contatosError } = await supabase
        .from('farmer_checklist_contatos')
        .select(`
          *,
          alunos:aluno_id(nome, whatsapp, health_score, cursos:curso_id(nome), professores:professor_atual_id(nome)),
          colaboradores:farmer_id(nome, apelido)
        `)
        .eq('checklist_id', checklistId)
        .order('created_at');

      if (contatosError) throw contatosError;
      setContatos(contatosData || []);
    } catch (err) {
      console.error('Erro ao buscar detalhe do checklist:', err);
    } finally {
      setLoading(false);
    }
  }, [checklistId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Marcar/desmarcar item
  const toggleItem = async (itemId: string, concluida: boolean, colaboradorId: number) => {
    try {
      await supabase.rpc('marcar_checklist_item', {
        p_item_id: itemId,
        p_concluida: concluida,
        p_colaborador_id: colaboradorId,
      });
      await fetchDetail();
    } catch (err) {
      console.error('Erro ao marcar item:', err);
    }
  };

  // Adicionar item ao checklist
  const adicionarItem = async (input: CreateChecklistItemInput) => {
    if (!checklistId) return;

    const { error } = await supabase
      .from('farmer_checklist_items')
      .insert({
        checklist_id: checklistId,
        ...input,
      });

    if (error) throw error;
    await fetchDetail();
  };

  // Editar item existente (descrição, canal, info)
  const editarItem = async (itemId: string, dados: { descricao?: string; canal?: string | null; info?: string | null }) => {
    const updateData: Record<string, unknown> = {};
    if (dados.descricao !== undefined) updateData.descricao = dados.descricao;
    if (dados.canal !== undefined) updateData.canal = dados.canal;
    if (dados.info !== undefined) updateData.info = dados.info;

    const { error } = await supabase
      .from('farmer_checklist_items')
      .update(updateData)
      .eq('id', itemId);

    if (error) throw error;
    await fetchDetail();
  };

  // Remover item
  const removerItem = async (itemId: string) => {
    const { error } = await supabase
      .from('farmer_checklist_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
    await fetchDetail();
  };

  // Atualizar status de contato
  const atualizarContato = async (
    contatoId: string,
    status: string,
    canalContato?: string,
    observacoes?: string
  ) => {
    const updateData: Record<string, unknown> = { status };
    if (canalContato) updateData.canal_contato = canalContato;
    if (observacoes !== undefined) updateData.observacoes = observacoes;
    if (status !== 'pendente') updateData.contatado_em = new Date().toISOString();

    const { error } = await supabase
      .from('farmer_checklist_contatos')
      .update(updateData)
      .eq('id', contatoId);

    if (error) throw error;
    await fetchDetail();
  };

  // Calcular progresso
  const totalItems = items.reduce(
    (acc, item) => acc + 1 + (item.sub_items?.length || 0),
    0
  );
  const itemsConcluidos = items.reduce(
    (acc, item) =>
      acc +
      (item.concluida ? 1 : 0) +
      (item.sub_items?.filter(s => s.concluida).length || 0),
    0
  );
  const percentualProgresso =
    totalItems > 0 ? Math.round((itemsConcluidos / totalItems) * 100) : 0;

  // Calcular taxa de sucesso dos contatos
  const totalContatos = contatos.length;
  const contatosResponderam = contatos.filter(c => c.status === 'respondeu').length;
  const taxaSucesso =
    totalContatos > 0 ? Math.round((contatosResponderam / totalContatos) * 100) : 0;

  return {
    detail,
    items,
    contatos,
    loading,
    totalItems,
    itemsConcluidos,
    percentualProgresso,
    totalContatos,
    contatosResponderam,
    taxaSucesso,
    toggleItem,
    adicionarItem,
    editarItem,
    removerItem,
    atualizarContato,
    refetch: fetchDetail,
  };
}
