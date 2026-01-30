import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ============================================
// Tipos
// ============================================

export interface NotificacaoConfig {
  id: number;
  tipo: 'tarefa_atrasada' | 'tarefa_vencendo' | 'projeto_parado' | 'resumo_semanal';
  ativo: boolean;
  antecedencia_dias: number;
  dias_inatividade: number;
  dia_semana: number;
  hora_envio: string;
  created_at: string;
  updated_at: string;
}

export interface NotificacaoDestinatario {
  id: number;
  config_id: number;
  pessoa_tipo: 'usuario' | 'professor';
  pessoa_id: number;
  canal: 'whatsapp' | 'sistema' | 'ambos';
  created_at: string;
}

export interface NotificacaoLog {
  id: number;
  config_id: number | null;
  tipo: string;
  destinatario_tipo: string;
  destinatario_id: number;
  canal: string;
  mensagem: string;
  projeto_id: number | null;
  tarefa_id: number | null;
  status: 'pendente' | 'enviado' | 'erro' | 'lido';
  erro_mensagem: string | null;
  enviado_at: string;
  lido_at: string | null;
}

// Labels amigáveis para os tipos de notificação
export const NOTIFICACAO_TIPO_LABELS: Record<NotificacaoConfig['tipo'], string> = {
  tarefa_atrasada: 'Tarefas Atrasadas',
  tarefa_vencendo: 'Tarefas Vencendo',
  projeto_parado: 'Projetos Parados',
  resumo_semanal: 'Resumo Semanal',
};

export const NOTIFICACAO_TIPO_DESCRICOES: Record<NotificacaoConfig['tipo'], string> = {
  tarefa_atrasada: 'Alerta quando uma tarefa passa do prazo',
  tarefa_vencendo: 'Alerta X dias antes do prazo vencer',
  projeto_parado: 'Alerta quando projeto fica X dias sem atividade',
  resumo_semanal: 'Resumo semanal de projetos e tarefas',
};

// ============================================
// Hook para Configurações de Notificação
// ============================================
export function useNotificacaoConfig() {
  const [data, setData] = useState<NotificacaoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notificacao_config')
        .select('*')
        .order('id');

      if (error) throw error;
      setData(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Atualizar configuração
  const updateConfig = useCallback(async (
    id: number, 
    updates: Partial<Pick<NotificacaoConfig, 'ativo' | 'antecedencia_dias' | 'dias_inatividade' | 'dia_semana' | 'hora_envio'>>
  ) => {
    try {
      const { error } = await supabase
        .from('notificacao_config')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      // Atualiza localmente
      setData(prev => prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
      
      return { success: true };
    } catch (err) {
      console.error('[useNotificacaoConfig] Erro ao atualizar:', err);
      return { success: false, error: err as Error };
    }
  }, []);

  // Toggle ativo/inativo
  const toggleAtivo = useCallback(async (id: number) => {
    const config = data.find(c => c.id === id);
    if (!config) return { success: false, error: new Error('Configuração não encontrada') };
    
    return updateConfig(id, { ativo: !config.ativo });
  }, [data, updateConfig]);

  return { 
    data, 
    loading, 
    error, 
    refetch, 
    updateConfig,
    toggleAtivo,
  };
}

// ============================================
// Hook para Destinatários de Notificação
// ============================================
export function useNotificacaoDestinatarios(configId?: number) {
  const [data, setData] = useState<NotificacaoDestinatario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('notificacao_destinatarios')
        .select('*')
        .order('id');

      if (configId) {
        query = query.eq('config_id', configId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setData(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [configId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Adicionar destinatário
  const addDestinatario = useCallback(async (
    destinatario: Omit<NotificacaoDestinatario, 'id' | 'created_at'>
  ) => {
    try {
      const { data: newData, error } = await supabase
        .from('notificacao_destinatarios')
        .insert(destinatario)
        .select()
        .single();

      if (error) throw error;
      
      setData(prev => [...prev, newData]);
      return { success: true, data: newData };
    } catch (err) {
      console.error('[useNotificacaoDestinatarios] Erro ao adicionar:', err);
      return { success: false, error: err as Error };
    }
  }, []);

  // Remover destinatário
  const removeDestinatario = useCallback(async (id: number) => {
    try {
      const { error } = await supabase
        .from('notificacao_destinatarios')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setData(prev => prev.filter(item => item.id !== id));
      return { success: true };
    } catch (err) {
      console.error('[useNotificacaoDestinatarios] Erro ao remover:', err);
      return { success: false, error: err as Error };
    }
  }, []);

  // Atualizar canal
  const updateCanal = useCallback(async (
    id: number, 
    canal: NotificacaoDestinatario['canal']
  ) => {
    try {
      const { error } = await supabase
        .from('notificacao_destinatarios')
        .update({ canal })
        .eq('id', id);

      if (error) throw error;
      
      setData(prev => prev.map(item => 
        item.id === id ? { ...item, canal } : item
      ));
      return { success: true };
    } catch (err) {
      console.error('[useNotificacaoDestinatarios] Erro ao atualizar canal:', err);
      return { success: false, error: err as Error };
    }
  }, []);

  return { 
    data, 
    loading, 
    error, 
    refetch,
    addDestinatario,
    removeDestinatario,
    updateCanal,
  };
}

// ============================================
// Hook para Log de Notificações
// ============================================
export function useNotificacaoLog(options?: {
  limit?: number;
  tipo?: string;
  status?: NotificacaoLog['status'];
}) {
  const [data, setData] = useState<NotificacaoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('notificacao_log')
        .select('*')
        .order('enviado_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.tipo) {
        query = query.eq('tipo', options.tipo);
      }
      if (options?.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      setData(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [options?.limit, options?.tipo, options?.status]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Registrar nova notificação no log
  const logNotificacao = useCallback(async (
    log: Omit<NotificacaoLog, 'id' | 'enviado_at' | 'lido_at'>
  ) => {
    try {
      const { data: newData, error } = await supabase
        .from('notificacao_log')
        .insert(log)
        .select()
        .single();

      if (error) throw error;
      
      setData(prev => [newData, ...prev]);
      return { success: true, data: newData };
    } catch (err) {
      console.error('[useNotificacaoLog] Erro ao registrar:', err);
      return { success: false, error: err as Error };
    }
  }, []);

  return { 
    data, 
    loading, 
    error, 
    refetch,
    logNotificacao,
  };
}
