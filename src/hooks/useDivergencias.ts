import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type OrphanAntiga = {
  id: number;
  nome: string;
  unidade_id: string;
  unidade: string | null;
  curso: string | null;
  created_at: string;
  dias_sem_id: number;
};

export type InativoComPresenca = {
  id: number;
  nome: string;
  status: string;
  unidade: string | null;
  curso: string | null;
  aulas_30d: number;
  ultima_aula: string | null;
};

export type AtivoSemPresenca = {
  id: number;
  nome: string;
  data_matricula: string | null;
  unidade: string | null;
  curso: string | null;
  ultima_aula: string | null;
};

export type InativoSemDataSaida = {
  id: number;
  nome: string;
  status: string;
  data_matricula: string | null;
  updated_at: string | null;
  unidade: string | null;
  curso: string | null;
};

export type DuplicataCurso = {
  nome: string;
  unidade: string | null;
  curso: string | null;
  ids: number[];
  statuses: string[];
  qtd: number;
};

export type DivergenciasPayload = {
  orphans_antigas: OrphanAntiga[];
  inativo_com_presenca: InativoComPresenca[];
  ativo_sem_presenca: AtivoSemPresenca[];
  inativo_sem_data_saida: InativoSemDataSaida[];
  duplicatas_curso: DuplicataCurso[];
  atualizado_em: string;
};

const VAZIO: DivergenciasPayload = {
  orphans_antigas: [],
  inativo_com_presenca: [],
  ativo_sem_presenca: [],
  inativo_sem_data_saida: [],
  duplicatas_curso: [],
  atualizado_em: new Date().toISOString(),
};

export function useDivergencias() {
  const [dados, setDados] = useState<DivergenciasPayload>(VAZIO);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setErro(null);
    const { data, error } = await supabase.rpc('get_divergencias_alunos');
    if (error) {
      setErro(error.message);
    } else if (data) {
      setDados(data as DivergenciasPayload);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  return { dados, loading, erro, refetch: buscar };
}
