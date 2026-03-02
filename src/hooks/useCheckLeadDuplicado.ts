import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface LeadDuplicado {
  id: number;
  nome: string;
  telefone: string | null;
  status: string;
  etapa_pipeline_id: number | null;
  created_at: string;
}

/**
 * Hook para verificar leads duplicados antes da criação.
 *
 * Critérios:
 * - Mesmo telefone na mesma unidade → duplicata forte
 * - Mesmo nome exato + ambos sem telefone na mesma unidade → duplicata fraca
 * - Mesmo nome com telefones diferentes → NÃO é duplicata
 */
export function useCheckLeadDuplicado() {
  const [verificando, setVerificando] = useState(false);
  const [duplicados, setDuplicados] = useState<LeadDuplicado[]>([]);

  const verificar = useCallback(async (
    nome: string,
    telefone: string | null | undefined,
    unidadeId: string
  ): Promise<LeadDuplicado[]> => {
    if (!nome.trim() || !unidadeId) return [];

    setVerificando(true);
    try {
      const tel = telefone?.trim() || '';
      const nomeLimpo = nome.trim();

      let query = supabase
        .from('leads')
        .select('id, nome, telefone, status, etapa_pipeline_id, created_at')
        .eq('unidade_id', unidadeId)
        .eq('arquivado', false);

      if (tel) {
        // Se tem telefone: buscar por telefone exato
        query = query.eq('telefone', tel);
      } else {
        // Se não tem telefone: buscar por nome exato onde o lead existente também não tem telefone
        query = query
          .ilike('nome', nomeLimpo)
          .or('telefone.is.null,telefone.eq.');
      }

      const { data, error } = await query.limit(5);

      if (error) {
        console.error('Erro ao verificar duplicatas:', error);
        return [];
      }

      const resultado = data || [];
      setDuplicados(resultado);
      return resultado;
    } finally {
      setVerificando(false);
    }
  }, []);

  const limparDuplicados = useCallback(() => {
    setDuplicados([]);
  }, []);

  return { duplicados, verificando, verificar, limparDuplicados };
}

/**
 * Verificação em lote para batch inserts.
 * Recebe lista de telefones e retorna quais já existem na unidade.
 */
export async function verificarDuplicadosEmLote(
  telefones: string[],
  unidadeId: string
): Promise<Map<string, LeadDuplicado>> {
  const telefonesValidos = telefones.filter(t => t.trim());
  if (telefonesValidos.length === 0 || !unidadeId) return new Map();

  const { data, error } = await supabase
    .from('leads')
    .select('id, nome, telefone, status, etapa_pipeline_id, created_at')
    .eq('unidade_id', unidadeId)
    .eq('arquivado', false)
    .in('telefone', telefonesValidos)
    .limit(100);

  if (error) {
    console.error('Erro ao verificar duplicatas em lote:', error);
    return new Map();
  }

  const mapa = new Map<string, LeadDuplicado>();
  for (const lead of data || []) {
    if (lead.telefone) {
      mapa.set(lead.telefone, lead);
    }
  }
  return mapa;
}
