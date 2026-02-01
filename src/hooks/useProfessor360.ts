import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================================
// TIPOS
// ============================================================================

export interface Criterio360 {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  tipo: 'penalidade' | 'bonus';
  peso: number;
  pontos_perda: number;
  tolerancia: number;
  regra_detalhada: string | null;
  ativo: boolean;
  ordem: number;
}

export interface Ocorrencia360 {
  id: number;
  professor_id: number;
  unidade_id: string;
  criterio_id: number;
  competencia: string;
  data_ocorrencia: string;
  descricao: string | null;
  escopo: 'unidade' | 'todas';
  registrado_por: string | null;
  notificado: boolean;
  data_notificacao: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  criterio?: Criterio360;
  professor?: { id: number; nome: string; foto_url: string | null };
  unidade?: { id: string; nome: string; codigo: string };
  registrador?: { id: string; nome: string };
}

export interface Avaliacao360 {
  id: number;
  professor_id: number;
  unidade_id: string;
  competencia: string;
  pontos_atrasos: number;
  pontos_faltas: number;
  pontos_organizacao_sala: number;
  pontos_uniforme: number;
  pontos_prazos: number;
  pontos_emusys: number;
  pontos_projetos: number;
  qtd_atrasos: number;
  qtd_faltas: number;
  qtd_organizacao_sala: number;
  qtd_uniforme: number;
  qtd_prazos: number;
  qtd_emusys: number;
  qtd_projetos: number;
  nota_base: number;
  bonus_projetos: number;
  nota_final: number;
  status: 'pendente' | 'avaliado' | 'fechado';
  avaliador_id: string | null;
  data_fechamento: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  professor?: { id: number; nome: string; foto_url: string | null };
  unidade?: { id: string; nome: string; codigo: string };
}

export interface Config360 {
  peso_health_score: number;
  bonus_max_projetos: number;
  pontos_por_projeto: number;
  nota_minima_corte: number;
}

export interface OcorrenciaFormData {
  professor_id: number;
  unidade_id: string;
  criterio_id: number;
  data_ocorrencia: string;
  descricao?: string;
  escopo?: 'unidade' | 'todas';
  notificado?: boolean;
  observacoes?: string;
}

export interface Professor360Resumo {
  professor_id: number;
  professor_nome: string;
  professor_foto: string | null;
  unidade_id: string;
  unidade_nome: string;
  unidade_codigo: string;
  nota_final: number;
  status: string;
  qtd_ocorrencias: number;
  avaliacao?: Avaliacao360;
}

// ============================================================================
// HOOK: useCriterios360
// ============================================================================

export function useCriterios360() {
  const [criterios, setCriterios] = useState<Criterio360[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCriterios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[useCriterios360] Buscando critérios...');
      const { data, error: queryError } = await supabase
        .from('professor_360_criterios')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (queryError) {
        console.error('[useCriterios360] Erro na query:', queryError);
        throw queryError;
      }
      
      console.log('[useCriterios360] Critérios carregados:', data?.length || 0, data);
      setCriterios(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('[useCriterios360] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCriterios();
  }, [fetchCriterios]);

  const updateCriterio = useCallback(async (id: number, updates: Partial<Criterio360>) => {
    const { error } = await supabase
      .from('professor_360_criterios')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    await fetchCriterios();
  }, [fetchCriterios]);

  const createCriterio = useCallback(async (criterio: Omit<Criterio360, 'id'>) => {
    const { error } = await supabase
      .from('professor_360_criterios')
      .insert(criterio);

    if (error) throw error;
    await fetchCriterios();
  }, [fetchCriterios]);

  return {
    criterios,
    loading,
    error,
    refetch: fetchCriterios,
    updateCriterio,
    createCriterio,
  };
}

// ============================================================================
// HOOK: useConfig360
// ============================================================================

export function useConfig360() {
  const [config, setConfig] = useState<Config360>({
    peso_health_score: 20,
    bonus_max_projetos: 10,
    pontos_por_projeto: 5,
    nota_minima_corte: 80,
  });
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('professor_360_config')
        .select('chave, valor');

      if (error) throw error;

      const configObj: Config360 = {
        peso_health_score: 20,
        bonus_max_projetos: 10,
        pontos_por_projeto: 5,
        nota_minima_corte: 80,
      };

      data?.forEach((item: { chave: string; valor: string }) => {
        if (item.chave === 'peso_health_score') configObj.peso_health_score = parseInt(item.valor);
        if (item.chave === 'bonus_max_projetos') configObj.bonus_max_projetos = parseInt(item.valor);
        if (item.chave === 'pontos_por_projeto') configObj.pontos_por_projeto = parseInt(item.valor);
        if (item.chave === 'nota_minima_corte') configObj.nota_minima_corte = parseInt(item.valor);
      });

      setConfig(configObj);
    } catch (err) {
      console.error('[useConfig360] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(async (chave: string, valor: string) => {
    const { error } = await supabase
      .from('professor_360_config')
      .upsert({ chave, valor, updated_at: new Date().toISOString() }, { onConflict: 'chave' });

    if (error) throw error;
    await fetchConfig();
  }, [fetchConfig]);

  return { config, loading, refetch: fetchConfig, updateConfig };
}

// ============================================================================
// HOOK: useOcorrencias360
// ============================================================================

export function useOcorrencias360(competencia: string, unidadeId?: string) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia360[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOcorrencias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('professor_360_ocorrencias')
        .select(`
          *,
          criterio:criterio_id (id, codigo, nome, tipo, peso, pontos_perda, tolerancia),
          professor:professor_id (id, nome, foto_url),
          unidade:unidade_id (id, nome, codigo)
        `)
        .eq('competencia', competencia)
        .order('data_ocorrencia', { ascending: false });

      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;
      setOcorrencias(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('[useOcorrencias360] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [competencia, unidadeId]);

  useEffect(() => {
    fetchOcorrencias();
  }, [fetchOcorrencias]);

  const createOcorrencia = useCallback(async (
    data: OcorrenciaFormData,
    userId?: string,
    professorUnidades?: string[]
  ) => {
    // Remover campos que não existem no banco (são apenas para UI/WhatsApp)
    const { atraso_grave, tolerancia_info, ...dadosBanco } = data as any;
    
    // Se escopo = 'todas', criar ocorrência para todas as unidades do professor
    if (dadosBanco.escopo === 'todas' && professorUnidades && professorUnidades.length > 1) {
      const ocorrencias = professorUnidades.map(unidadeId => ({
        ...dadosBanco,
        unidade_id: unidadeId,
        competencia,
        registrado_por: userId,
      }));

      const { error } = await supabase
        .from('professor_360_ocorrencias')
        .insert(ocorrencias);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('professor_360_ocorrencias')
        .insert({
          ...dadosBanco,
          competencia,
          registrado_por: userId,
        });

      if (error) throw error;
    }

    await fetchOcorrencias();
  }, [competencia, fetchOcorrencias]);

  const updateOcorrencia = useCallback(async (id: number, updates: Partial<Ocorrencia360>) => {
    const { error } = await supabase
      .from('professor_360_ocorrencias')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    await fetchOcorrencias();
  }, [fetchOcorrencias]);

  const deleteOcorrencia = useCallback(async (id: number) => {
    const { error } = await supabase
      .from('professor_360_ocorrencias')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchOcorrencias();
  }, [fetchOcorrencias]);

  return {
    ocorrencias,
    loading,
    error,
    refetch: fetchOcorrencias,
    createOcorrencia,
    updateOcorrencia,
    deleteOcorrencia,
  };
}

// ============================================================================
// HOOK: useAvaliacoes360
// ============================================================================

export function useAvaliacoes360(competencia: string, unidadeId?: string) {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao360[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAvaliacoes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('professor_360_avaliacoes')
        .select(`
          *,
          professor:professor_id (id, nome, foto_url),
          unidade:unidade_id (id, nome, codigo)
        `)
        .eq('competencia', competencia)
        .order('nota_final', { ascending: false });

      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;
      setAvaliacoes(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('[useAvaliacoes360] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [competencia, unidadeId]);

  useEffect(() => {
    fetchAvaliacoes();
  }, [fetchAvaliacoes]);

  const fecharAvaliacao = useCallback(async (id: number, userId: string, observacoes?: string) => {
    const { error } = await supabase
      .from('professor_360_avaliacoes')
      .update({
        status: 'fechado',
        avaliador_id: userId,
        data_fechamento: new Date().toISOString(),
        observacoes,
      })
      .eq('id', id);

    if (error) throw error;
    await fetchAvaliacoes();
  }, [fetchAvaliacoes]);

  return {
    avaliacoes,
    loading,
    error,
    refetch: fetchAvaliacoes,
    fecharAvaliacao,
  };
}

// ============================================================================
// HOOK: useProfessor360 (Principal - Combina tudo)
// ============================================================================

export function useProfessor360(competencia: string, unidadeId?: string) {
  const { criterios, loading: loadingCriterios } = useCriterios360();
  const { config, loading: loadingConfig } = useConfig360();
  const { 
    ocorrencias, 
    loading: loadingOcorrencias, 
    createOcorrencia, 
    updateOcorrencia, 
    deleteOcorrencia,
    refetch: refetchOcorrencias 
  } = useOcorrencias360(competencia, unidadeId);
  const { 
    avaliacoes, 
    loading: loadingAvaliacoes, 
    fecharAvaliacao,
    refetch: refetchAvaliacoes 
  } = useAvaliacoes360(competencia, unidadeId);

  const [professores, setProfessores] = useState<any[]>([]);
  const [loadingProfessores, setLoadingProfessores] = useState(true);

  // Buscar professores ativos com suas unidades
  const fetchProfessores = useCallback(async () => {
    setLoadingProfessores(true);
    try {
      // Buscar apenas professores ativos (consistente com aba Cadastro)
      const { data: profs } = await supabase
        .from('professores')
        .select('id, nome, foto_url, ativo, telefone_whatsapp')
        .eq('ativo', true)
        .order('nome');

      const { data: unidadesRel } = await supabase
        .from('professores_unidades')
        .select('professor_id, unidade_id, unidades:unidade_id (id, nome, codigo)');

      // Buscar todas as unidades para associar professores sem unidade
      const { data: todasUnidades } = await supabase
        .from('unidades')
        .select('id, nome, codigo')
        .eq('ativo', true);

      const professoresComUnidades = (profs || []).map(prof => {
        const unidades = (unidadesRel || [])
          .filter(u => u.professor_id === prof.id)
          .map(u => u.unidades)
          .filter(Boolean);
        
        // Se professor não tem unidades associadas, usar todas as unidades
        // (para garantir que apareça no consolidado)
        if (unidades.length === 0 && todasUnidades && todasUnidades.length > 0) {
          return { ...prof, unidades: todasUnidades, semUnidadeDefinida: true };
        }
        
        return { ...prof, unidades };
      });

      // Filtrar por unidade se necessário
      if (unidadeId && unidadeId !== 'todos') {
        const filtrados = professoresComUnidades.filter(p => 
          p.unidades.some((u: any) => u.id === unidadeId)
        );
        setProfessores(filtrados);
      } else {
        setProfessores(professoresComUnidades);
      }
    } catch (err) {
      console.error('[useProfessor360] Erro ao buscar professores:', err);
    } finally {
      setLoadingProfessores(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    fetchProfessores();
  }, [fetchProfessores]);

  // Calcular avaliações em tempo real baseado nas ocorrências
  const avaliacoesCalculadas = useMemo(() => {
    if (!professores.length || !criterios.length) return [];

    const criteriosPenalidade = criterios.filter(c => c.tipo === 'penalidade');
    const criterioBonus = criterios.find(c => c.tipo === 'bonus');

    // Agrupar ocorrências por professor e unidade
    const ocorrenciasPorProfUnidade = new Map<string, Ocorrencia360[]>();
    ocorrencias.forEach(oc => {
      const key = `${oc.professor_id}-${oc.unidade_id}`;
      if (!ocorrenciasPorProfUnidade.has(key)) {
        ocorrenciasPorProfUnidade.set(key, []);
      }
      ocorrenciasPorProfUnidade.get(key)!.push(oc);
    });

    const resultados: Professor360Resumo[] = [];

    professores.forEach(prof => {
      const unidadesProf = unidadeId && unidadeId !== 'todos'
        ? prof.unidades.filter((u: any) => u.id === unidadeId)
        : prof.unidades;

      // Se o professor não tem unidades, pular
      if (!unidadesProf || unidadesProf.length === 0) return;

      unidadesProf.forEach((unidade: any) => {
        const key = `${prof.id}-${unidade.id}`;
        const ocsProf = ocorrenciasPorProfUnidade.get(key) || [];

        // Contar ocorrências por critério
        const contagem: Record<string, number> = {};
        criterios.forEach(c => {
          contagem[c.codigo] = ocsProf.filter(oc => oc.criterio_id === c.id).length;
        });

        // Calcular pontos por critério
        const pontos: Record<string, number> = {};
        let somaNotasPonderadas = 0;
        let somaPesos = 0;

        criteriosPenalidade.forEach(c => {
          const qtd = contagem[c.codigo] || 0;
          const excedente = Math.max(0, qtd - c.tolerancia);
          const pontoCriterio = Math.max(0, 100 - excedente * c.pontos_perda);
          pontos[c.codigo] = pontoCriterio;
          somaNotasPonderadas += pontoCriterio * c.peso;
          somaPesos += c.peso;
        });

        const notaBase = somaPesos > 0 ? somaNotasPonderadas / somaPesos : 100;

        // Calcular bônus de projetos
        const qtdProjetos = contagem['projetos'] || 0;
        const bonusProjetos = Math.min(
          config.bonus_max_projetos,
          qtdProjetos * config.pontos_por_projeto
        );

        const notaFinal = Math.min(100, notaBase + bonusProjetos);

        // Buscar avaliação existente
        const avaliacaoExistente = avaliacoes.find(
          a => a.professor_id === prof.id && a.unidade_id === unidade.id
        );

        resultados.push({
          professor_id: prof.id,
          professor_nome: prof.nome,
          professor_foto: prof.foto_url,
          unidade_id: unidade.id,
          unidade_nome: unidade.nome,
          unidade_codigo: unidade.codigo,
          nota_final: Math.round(notaFinal * 10) / 10,
          status: avaliacaoExistente?.status || 'pendente',
          qtd_ocorrencias: ocsProf.length,
          avaliacao: avaliacaoExistente ? {
            ...avaliacaoExistente,
            pontos_atrasos: pontos['atrasos'] || 100,
            pontos_faltas: pontos['faltas'] || 100,
            pontos_organizacao_sala: pontos['organizacao_sala'] || 100,
            pontos_uniforme: pontos['uniforme'] || 100,
            pontos_prazos: pontos['prazos'] || 100,
            pontos_emusys: pontos['emusys'] || 100,
            pontos_projetos: bonusProjetos,
            qtd_atrasos: contagem['atrasos'] || 0,
            qtd_faltas: contagem['faltas'] || 0,
            qtd_organizacao_sala: contagem['organizacao_sala'] || 0,
            qtd_uniforme: contagem['uniforme'] || 0,
            qtd_prazos: contagem['prazos'] || 0,
            qtd_emusys: contagem['emusys'] || 0,
            qtd_projetos: qtdProjetos,
            nota_base: Math.round(notaBase * 10) / 10,
            bonus_projetos: bonusProjetos,
            nota_final: Math.round(notaFinal * 10) / 10,
          } : undefined,
        });
      });
    });

    // Ordenar por nota final (maior para menor)
    return resultados.sort((a, b) => b.nota_final - a.nota_final);
  }, [professores, criterios, ocorrencias, avaliacoes, config, unidadeId]);

  // KPIs resumidos
  const kpis = useMemo(() => {
    // Se não há filtro de unidade (consolidado), contar apenas professores únicos
    let total: number;
    let semOcorrencia: number;
    let comOcorrencia: number;
    let acimaDaMedia: number;
    
    if (!unidadeId) {
      // Consolidado: agrupar por professor_id e pegar a melhor nota
      const professoresUnicos = new Map<number, typeof avaliacoesCalculadas[0]>();
      
      avaliacoesCalculadas.forEach(avaliacao => {
        const existing = professoresUnicos.get(avaliacao.professor_id);
        if (!existing || avaliacao.nota_final > existing.nota_final) {
          professoresUnicos.set(avaliacao.professor_id, avaliacao);
        }
      });
      
      const avaliacoesUnicas = Array.from(professoresUnicos.values());
      total = avaliacoesUnicas.length;
      semOcorrencia = avaliacoesUnicas.filter(a => a.qtd_ocorrencias === 0).length;
      comOcorrencia = total - semOcorrencia;
      acimaDaMedia = avaliacoesUnicas.filter(a => a.nota_final >= config.nota_minima_corte).length;
    } else {
      // Unidade específica: contar todas as avaliações
      total = avaliacoesCalculadas.length;
      semOcorrencia = avaliacoesCalculadas.filter(a => a.qtd_ocorrencias === 0).length;
      comOcorrencia = total - semOcorrencia;
      acimaDaMedia = avaliacoesCalculadas.filter(a => a.nota_final >= config.nota_minima_corte).length;
    }
    
    const mediaNotas = total > 0
      ? avaliacoesCalculadas.reduce((sum, a) => sum + a.nota_final, 0) / avaliacoesCalculadas.length
      : 0;
    const top3 = avaliacoesCalculadas.slice(0, 3);

    return {
      total,
      semOcorrencia,
      comOcorrencia,
      mediaNotas: Math.round(mediaNotas * 10) / 10,
      top3,
      acimaDaMedia,
    };
  }, [avaliacoesCalculadas, config.nota_minima_corte, unidadeId]);

  // Salvar/atualizar avaliação no banco
  const salvarAvaliacao = useCallback(async (professorId: number, unidadeIdParam: string) => {
    const resumo = avaliacoesCalculadas.find(
      a => a.professor_id === professorId && a.unidade_id === unidadeIdParam
    );

    if (!resumo) return;

    const avaliacaoData = {
      professor_id: professorId,
      unidade_id: unidadeIdParam,
      competencia,
      pontos_atrasos: resumo.avaliacao?.pontos_atrasos || 100,
      pontos_faltas: resumo.avaliacao?.pontos_faltas || 100,
      pontos_organizacao_sala: resumo.avaliacao?.pontos_organizacao_sala || 100,
      pontos_uniforme: resumo.avaliacao?.pontos_uniforme || 100,
      pontos_prazos: resumo.avaliacao?.pontos_prazos || 100,
      pontos_emusys: resumo.avaliacao?.pontos_emusys || 100,
      pontos_projetos: resumo.avaliacao?.pontos_projetos || 0,
      qtd_atrasos: resumo.avaliacao?.qtd_atrasos || 0,
      qtd_faltas: resumo.avaliacao?.qtd_faltas || 0,
      qtd_organizacao_sala: resumo.avaliacao?.qtd_organizacao_sala || 0,
      qtd_uniforme: resumo.avaliacao?.qtd_uniforme || 0,
      qtd_prazos: resumo.avaliacao?.qtd_prazos || 0,
      qtd_emusys: resumo.avaliacao?.qtd_emusys || 0,
      qtd_projetos: resumo.avaliacao?.qtd_projetos || 0,
      nota_base: resumo.avaliacao?.nota_base || 100,
      bonus_projetos: resumo.avaliacao?.bonus_projetos || 0,
      nota_final: resumo.nota_final,
      status: 'avaliado',
    };

    const { error } = await supabase
      .from('professor_360_avaliacoes')
      .upsert(avaliacaoData, { 
        onConflict: 'professor_id,unidade_id,competencia' 
      });

    if (error) throw error;
    await refetchAvaliacoes();
  }, [avaliacoesCalculadas, competencia, refetchAvaliacoes]);

  const loading = loadingCriterios || loadingConfig || loadingOcorrencias || loadingAvaliacoes || loadingProfessores;

  return {
    // Dados
    criterios,
    config,
    ocorrencias,
    avaliacoes,
    avaliacoesCalculadas,
    professores,
    kpis,
    loading,
    
    // Ações
    createOcorrencia,
    updateOcorrencia,
    deleteOcorrencia,
    fecharAvaliacao,
    salvarAvaliacao,
    
    // Refetch
    refetch: useCallback(async () => {
      await Promise.all([
        refetchOcorrencias(),
        refetchAvaliacoes(),
        fetchProfessores(),
      ]);
    }, [refetchOcorrencias, refetchAvaliacoes, fetchProfessores]),
  };
}

// ============================================================================
// HOOK: useNota360Professor (Para buscar nota 360 de um professor específico)
// ============================================================================

export function useNota360Professor(professorId: number, competencia: string) {
  const [nota, setNota] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNota = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('professor_360_avaliacoes')
          .select('nota_final')
          .eq('professor_id', professorId)
          .eq('competencia', competencia);

        if (data && data.length > 0) {
          // Média das notas de todas as unidades
          const media = data.reduce((sum, a) => sum + (a.nota_final || 0), 0) / data.length;
          setNota(Math.round(media * 10) / 10);
        } else {
          setNota(null);
        }
      } catch (err) {
        console.error('[useNota360Professor] Erro:', err);
        setNota(null);
      } finally {
        setLoading(false);
      }
    };

    if (professorId && competencia) {
      fetchNota();
    }
  }, [professorId, competencia]);

  return { nota, loading };
}

export default useProfessor360;
