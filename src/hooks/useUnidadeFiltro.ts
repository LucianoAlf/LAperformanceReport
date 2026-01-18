import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface UseUnidadeFiltroReturn {
  unidadeSelecionada: string | null;
  setUnidadeSelecionada: (unidadeId: string | null) => void;
  filtroAtivo: string | null;
  isConsolidado: boolean;
  canChangeUnidade: boolean;
}

/**
 * Hook para gerenciar o filtro de unidade
 * - Admin: pode alternar entre consolidado e unidades específicas
 * - Unidade: sempre filtrado pela sua unidade (não pode alterar)
 */
export function useUnidadeFiltro(): UseUnidadeFiltroReturn {
  const { isAdmin, unidadeId } = useAuth();
  
  // Estado local para admin selecionar unidade
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string | null>(null);

  // Quando usuário de unidade loga, força o filtro para sua unidade
  useEffect(() => {
    if (!isAdmin && unidadeId) {
      setUnidadeSelecionada(unidadeId);
    }
  }, [isAdmin, unidadeId]);

  // Filtro ativo: para admin é o selecionado, para unidade é fixo
  const filtroAtivo = isAdmin ? unidadeSelecionada : unidadeId;

  // Consolidado = admin sem unidade selecionada
  const isConsolidado = isAdmin && !unidadeSelecionada;

  // Só admin pode mudar unidade
  const canChangeUnidade = isAdmin;

  return {
    unidadeSelecionada,
    setUnidadeSelecionada,
    filtroAtivo,
    isConsolidado,
    canChangeUnidade,
  };
}

export default useUnidadeFiltro;
