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
  responsavel_id: number | null;
  responsavel_nome: string | null;
  responsavel_apelido: string | null;
}

export interface ColaboradorUnidade {
  id: number;
  nome: string;
  apelido: string | null;
  perfil: string;
}

export function useChecklistDetail(checklistId: string | null, unidadeId?: string) {
  const [detail, setDetail] = useState<ChecklistDetailData | null>(null);
  const [items, setItems] = useState<FarmerChecklistItem[]>([]);
  const [contatos, setContatos] = useState<FarmerChecklistContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [colaboradoresUnidade, setColaboradoresUnidade] = useState<ColaboradorUnidade[]>([]);
  const [cursosUnidade, setCursosUnidade] = useState<{ id: number; nome: string }[]>([]);
  const [professoresUnidade, setProfessoresUnidade] = useState<{ id: number; nome: string }[]>([]);

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

      // Buscar itens com responsável
      const { data: itemsData, error: itemsError } = await supabase
        .from('farmer_checklist_items')
        .select('*, responsavel:responsavel_id(id, nome, apelido)')
        .eq('checklist_id', checklistId)
        .order('ordem')
        .order('created_at');

      if (itemsError) throw itemsError;

      // Organizar itens em árvore (pais + sub-itens)
      const allItems = (itemsData || []).map((item: any) => ({
        ...item,
        responsavel_nome: item.responsavel?.nome || null,
        responsavel_apelido: item.responsavel?.apelido || null,
      }));
      const parentItems = allItems.filter((i: any) => !i.parent_id);
      const organized = parentItems.map((parent: any) => ({
        ...parent,
        sub_items: allItems.filter((i: any) => i.parent_id === parent.id),
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

  // Atualização otimista do estado local de um item (sem fetch)
  const updateItemLocally = (itemId: string, concluida: boolean) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) return { ...item, concluida };
      if (item.sub_items?.some(s => s.id === itemId)) {
        return {
          ...item,
          sub_items: item.sub_items.map(s =>
            s.id === itemId ? { ...s, concluida } : s
          ),
        };
      }
      return item;
    }));
  };

  // Reverter status do checklist para 'em_andamento' se estava 'concluido'
  const revertStatusSeNecessario = async (concluida: boolean) => {
    if (!concluida && detail?.status === 'concluido' && checklistId) {
      // Atualizar estado local imediatamente
      setDetail(prev => prev ? { ...prev, status: 'em_andamento' } : prev);
      // Persistir no banco
      await supabase
        .from('farmer_checklists')
        .update({ status: 'em_andamento', updated_at: new Date().toISOString() })
        .eq('id', checklistId);
    }
  };

  // Marcar/desmarcar item (otimista — atualiza UI imediatamente)
  const toggleItem = async (itemId: string, concluida: boolean, colaboradorId: number) => {
    // 1. Atualizar estado local imediatamente
    updateItemLocally(itemId, concluida);

    // 2. Se desmarcando e checklist estava concluido, reverter status
    await revertStatusSeNecessario(concluida);

    // 3. Persistir no banco em background
    try {
      await supabase.rpc('marcar_checklist_item', {
        p_item_id: itemId,
        p_concluida: concluida,
        p_colaborador_id: colaboradorId,
      });
    } catch (err) {
      console.error('Erro ao marcar item:', err);
      // Reverter em caso de erro
      updateItemLocally(itemId, !concluida);
    }
  };

  // Marcar/desmarcar vários itens de uma vez (para "Selecionar Todos")
  const toggleItemsBatch = async (itemIds: string[], concluida: boolean, colaboradorId: number) => {
    // 1. Atualizar estado local imediatamente para todos
    itemIds.forEach(id => updateItemLocally(id, concluida));

    // 2. Se desmarcando e checklist estava concluido, reverter status
    await revertStatusSeNecessario(concluida);

    // 3. Persistir todos em paralelo
    try {
      await Promise.all(
        itemIds.map(id =>
          supabase.rpc('marcar_checklist_item', {
            p_item_id: id,
            p_concluida: concluida,
            p_colaborador_id: colaboradorId,
          })
        )
      );
    } catch (err) {
      console.error('Erro ao marcar itens em batch:', err);
      // Em caso de erro, refetch para sincronizar
      await fetchDetail();
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

  // Editar item existente (descrição, canal, info, responsável)
  const editarItem = async (itemId: string, dados: { descricao?: string; canal?: string | null; info?: string | null; responsavel_id?: number | null }) => {
    const updateData: Record<string, unknown> = {};
    if (dados.descricao !== undefined) updateData.descricao = dados.descricao;
    if (dados.canal !== undefined) updateData.canal = dados.canal;
    if (dados.info !== undefined) updateData.info = dados.info;
    if (dados.responsavel_id !== undefined) updateData.responsavel_id = dados.responsavel_id;

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

  // Buscar colaboradores da unidade (para selects de responsável)
  const fetchColaboradoresUnidade = useCallback(async () => {
    const uid = (unidadeId && unidadeId !== 'todos') ? unidadeId : detail?.unidade_id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome, apelido, perfil')
      .eq('ativo', true)
      .or(`unidade_id.eq.${uid},perfil.eq.admin`)
      .order('nome');

    if (!error && data) {
      setColaboradoresUnidade(data);
    }
  }, [unidadeId, detail?.unidade_id]);

  useEffect(() => {
    fetchColaboradoresUnidade();
  }, [fetchColaboradoresUnidade]);

  // Buscar cursos e professores distintos da unidade (para filtros da Carteira)
  const fetchCursosEProfessores = useCallback(async () => {
    const uid = (unidadeId && unidadeId !== 'todos') ? unidadeId : detail?.unidade_id;
    if (!uid) return;

    // Cursos distintos via alunos ativos da unidade
    const { data: cursosData } = await supabase
      .from('alunos')
      .select('curso_id, cursos:curso_id(id, nome)')
      .eq('unidade_id', uid)
      .eq('status', 'ativo')
      .not('curso_id', 'is', null);

    if (cursosData) {
      const mapa = new Map<number, string>();
      cursosData.forEach((a: any) => {
        if (a.cursos?.id && a.cursos?.nome) mapa.set(a.cursos.id, a.cursos.nome);
      });
      setCursosUnidade(
        Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
      );
    }

    // Professores distintos via alunos ativos da unidade
    const { data: profsData } = await supabase
      .from('alunos')
      .select('professor_atual_id, professores:professor_atual_id(id, nome)')
      .eq('unidade_id', uid)
      .eq('status', 'ativo')
      .not('professor_atual_id', 'is', null);

    if (profsData) {
      const mapa = new Map<number, string>();
      profsData.forEach((a: any) => {
        if (a.professores?.id && a.professores?.nome) mapa.set(a.professores.id, a.professores.nome);
      });
      setProfessoresUnidade(
        Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
      );
    }
  }, [unidadeId, detail?.unidade_id]);

  useEffect(() => {
    fetchCursosEProfessores();
  }, [fetchCursosEProfessores]);

  // Atualizar responsável do checklist
  const atualizarResponsavel = async (responsavelId: number | null) => {
    if (!checklistId) return;
    const { error } = await supabase
      .from('farmer_checklists')
      .update({ responsavel_id: responsavelId, updated_at: new Date().toISOString() })
      .eq('id', checklistId);
    if (error) throw error;
    await fetchDetail();
  };

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
    toggleItemsBatch,
    adicionarItem,
    editarItem,
    removerItem,
    atualizarContato,
    atualizarResponsavel,
    colaboradoresUnidade,
    cursosUnidade,
    professoresUnidade,
    refetch: fetchDetail,
  };
}
