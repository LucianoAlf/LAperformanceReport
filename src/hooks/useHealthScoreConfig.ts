import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_HEALTH_WEIGHTS } from '@/components/App/Professores/HealthScoreConfig';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

type HealthWeights = typeof DEFAULT_HEALTH_WEIGHTS;

interface UseHealthScoreConfigReturn {
  weights: HealthWeights;
  loading: boolean;
  saveWeights: (weights: HealthWeights) => Promise<boolean>;
}

// Map TypeScript keys -> DB column names
function weightsToDb(w: HealthWeights) {
  return {
    peso_taxa_crescimento: w.taxaCrescimento,
    peso_media_turma: w.mediaTurma,
    peso_retencao: w.retencao,
    peso_conversao: w.conversao,
    peso_presenca: w.presenca,
    peso_evasoes: w.evasoes,
  };
}

// Map DB columns -> TypeScript keys
function dbToWeights(row: Record<string, unknown>): HealthWeights {
  return {
    taxaCrescimento: row.peso_taxa_crescimento as number,
    mediaTurma: row.peso_media_turma as number,
    retencao: row.peso_retencao as number,
    conversao: row.peso_conversao as number,
    presenca: row.peso_presenca as number,
    evasoes: row.peso_evasoes as number,
  };
}

export function useHealthScoreConfig(unidadeAtual: UnidadeId): UseHealthScoreConfigReturn {
  const [weights, setWeights] = useState<HealthWeights>(DEFAULT_HEALTH_WEIGHTS);
  const [loading, setLoading] = useState(true);

  // Load config on mount and when unidade changes
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const unidadeId = unidadeAtual !== 'todos' ? unidadeAtual : null;

        let query = supabase
          .from('config_health_score_professor')
          .select('*');

        if (unidadeId) {
          // Try unit-specific first, fallback to global (NULL)
          query = query.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
        } else {
          query = query.is('unidade_id', null);
        }

        const { data, error } = await query
          .order('unidade_id', { nullsFirst: false }) // unit-specific first
          .limit(1);

        if (error) throw error;
        if (data && data.length > 0) {
          setWeights(dbToWeights(data[0]));
        }
        // else: keep DEFAULT_HEALTH_WEIGHTS
      } catch (err) {
        console.error('Erro ao carregar config health score professor:', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, [unidadeAtual]);

  // Save (upsert) weights
  const saveWeights = useCallback(async (newWeights: HealthWeights): Promise<boolean> => {
    try {
      const unidadeId = unidadeAtual !== 'todos' ? unidadeAtual : null;
      const dbData = {
        ...weightsToDb(newWeights),
        unidade_id: unidadeId,
      };

      const { error } = await supabase
        .from('config_health_score_professor')
        .upsert(dbData, { onConflict: 'unidade_id' });

      if (error) throw error;
      setWeights(newWeights);
      return true;
    } catch (err) {
      console.error('Erro ao salvar config health score professor:', err);
      return false;
    }
  }, [unidadeAtual]);

  return { weights, loading, saveWeights };
}
