import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INADIMPLENCIA_CANONICA_LOADING,
  montarAlertasInadimplenciaCanonica,
  normalizarInadimplenciaCanonica,
  podeCobrarInadimplenciaCanonica,
  type AlunoInadimplenciaCanonicaSource,
  type InadimplenciaCanonicaState,
} from '@/lib/inadimplenciaCanonica';
import type { 
  AlertaAniversariante, 
  AlertaInadimplente, 
  AlertaNovoMatriculado, 
  AlertaRenovacao,
  ResumoAlertas 
} from '../types';

const bloquearInadimplenciaPorExpiracao = (
  state: InadimplenciaCanonicaState,
): InadimplenciaCanonicaState => ({
  ...state,
  status: 'stale',
  totalFaturas: 0,
  totalMatriculas: 0,
  totalOriginal: 0,
  totalAtualizado: 0,
  maiorAtraso: 0,
  competenciasStale: Math.max(1, state.competenciasStale),
  collectionAllowed: false,
  collectionScope: 'blocked',
  blockReasons: ['stale_competencia'],
  items: [],
  erro: null,
});

export function useAlertas(unidadeId: string) {
  const [aniversariantes, setAniversariantes] = useState<AlertaAniversariante[]>([]);
  const [inadimplentes, setInadimplentes] = useState<AlertaInadimplente[]>([]);
  const [novosMatriculados, setNovosMatriculados] = useState<AlertaNovoMatriculado[]>([]);
  const [renovacoes, setRenovacoes] = useState<AlertaRenovacao[]>([]);
  const [resumo, setResumo] = useState<ResumoAlertas | null>(null);
  const [inadimplenciaCanonica, setInadimplenciaCanonica] = useState<InadimplenciaCanonicaState>(
    INADIMPLENCIA_CANONICA_LOADING,
  );
  const [inadimplenciaSemCadastroAtivo, setInadimplenciaSemCadastroAtivo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const invalidarInadimplenciaExpirada = useCallback(() => {
    setInadimplenciaCanonica(prev => bloquearInadimplenciaPorExpiracao(prev));
    setInadimplentes([]);
    setInadimplenciaSemCadastroAtivo(0);
    setResumo(prev => prev ? { ...prev, inadimplentes: 0 } : prev);
  }, []);

  const fetchAlertas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Filtro de unidade
      const unidadeFilter = unidadeId && unidadeId !== 'todos' ? unidadeId : null;

      let aniversariantesQuery = supabase
        .from('vw_farmer_aniversariantes_hoje')
        .select('*');
      if (unidadeFilter) {
        aniversariantesQuery = aniversariantesQuery.eq('unidade_id', unidadeFilter);
      }

      let novosQuery = supabase
        .from('vw_farmer_novos_matriculados')
        .select('*')
        .limit(10);
      if (unidadeFilter) {
        novosQuery = novosQuery.eq('unidade_id', unidadeFilter);
      }

      let renovacoesQuery = supabase
        .from('vw_farmer_renovacoes_proximas')
        .select('*')
        .limit(30);
      if (unidadeFilter) {
        renovacoesQuery = renovacoesQuery.eq('unidade_id', unidadeFilter);
      }

      let resumoQuery = supabase
        .from('vw_farmer_resumo_alertas')
        .select('*');
      if (unidadeFilter) {
        resumoQuery = resumoQuery.eq('unidade_id', unidadeFilter);
      }

      const [
        aniversariantesResult,
        novosResult,
        renovacoesResult,
        resumoResult,
        inadimplenciaResult,
      ] = await Promise.all([
        aniversariantesQuery,
        novosQuery,
        renovacoesQuery,
        resumoQuery,
        supabase.rpc('get_inadimplencia_canonica', {
          p_unidade_id: unidadeFilter,
        }),
      ]);

      for (const result of [aniversariantesResult, novosResult, renovacoesResult, resumoResult]) {
        if (result.error) throw result.error;
      }

      setAniversariantes(aniversariantesResult.data || []);
      setNovosMatriculados(novosResult.data || []);
      setRenovacoes(renovacoesResult.data || []);

      const estadoCanonico = normalizarInadimplenciaCanonica(
        inadimplenciaResult.data,
        inadimplenciaResult.error,
      );
      const gateCanonicoValido = podeCobrarInadimplenciaCanonica(estadoCanonico);
      const leituraExpirada = estadoCanonico.collectionAllowed && !gateCanonicoValido;
      setInadimplenciaCanonica(
        leituraExpirada ? bloquearInadimplenciaPorExpiracao(estadoCanonico) : estadoCanonico,
      );

      let alertasCanonicos: AlertaInadimplente[] = [];
      let semCadastroAtivo = 0;
      if (gateCanonicoValido && estadoCanonico.items.length > 0) {
        const alunoIdsCanonicos = [...new Set(estadoCanonico.items
          .filter((item) => item.contact_resolution_status === 'resolved')
          .map((item) => item.aluno_id_canonico)
          .filter((id): id is number => id !== null))];
        const unidades = [...new Set(estadoCanonico.items.map((item) => item.unidade_id))];

        let alunosData: any[] = [];
        if (alunoIdsCanonicos.length > 0) {
          const alunosQuery = supabase
            .from('alunos')
            .select(`
              id, nome, unidade_id, whatsapp, telefone,
              professores:professor_atual_id(id, nome),
              cursos:curso_id(nome)
            `)
            .in('id', alunoIdsCanonicos)
            .in('unidade_id', unidades);

          const alunosResult = await alunosQuery;
          if (alunosResult.error) throw alunosResult.error;
          alunosData = alunosResult.data ?? [];
        }

        const alunosCanonicos = alunosData.map((row: any): AlunoInadimplenciaCanonicaSource => ({
          ...row,
          // A RPC publicou o único aluno_id atual apto a fornecer contato. A tabela
          // local apenas enriquece esse ID e nunca desempata cadastros duplicados.
          professor: Array.isArray(row.professores) ? row.professores[0] ?? null : row.professores,
          curso: Array.isArray(row.cursos) ? row.cursos[0] ?? null : row.cursos,
        }));
        const alertas = montarAlertasInadimplenciaCanonica(estadoCanonico, alunosCanonicos);
        alertasCanonicos = alertas.alertas;
        semCadastroAtivo = alertas.semCadastroAtivo;
      }
      setInadimplentes(alertasCanonicos);
      setInadimplenciaSemCadastroAtivo(semCadastroAtivo);

      const resumoData = resumoResult.data;
      if (resumoData && resumoData.length > 0) {
        if (unidadeFilter) {
          setResumo({
            ...resumoData[0],
            inadimplentes: gateCanonicoValido ? alertasCanonicos.length : 0,
          });
        } else {
          const consolidado: ResumoAlertas = {
            unidade_id: 'todos',
            unidade_nome: 'Todas as Unidades',
            aniversariantes_hoje: resumoData.reduce((acc, r) => acc + (r.aniversariantes_hoje || 0), 0),
            inadimplentes: gateCanonicoValido ? alertasCanonicos.length : 0,
            novos_matriculados: resumoData.reduce((acc, r) => acc + (r.novos_matriculados || 0), 0),
            renovacoes_vencidas: resumoData.reduce((acc, r) => acc + (r.renovacoes_vencidas || 0), 0),
            renovacoes_urgentes: resumoData.reduce((acc, r) => acc + (r.renovacoes_urgentes || 0), 0),
            renovacoes_atencao: resumoData.reduce((acc, r) => acc + (r.renovacoes_atencao || 0), 0),
          };
          setResumo(consolidado);
        }
      }

    } catch (err) {
      console.error('Erro ao buscar alertas:', err);
      setError('Erro ao carregar alertas');
      setInadimplentes([]);
      setInadimplenciaSemCadastroAtivo(0);
      setInadimplenciaCanonica({
        ...INADIMPLENCIA_CANONICA_LOADING,
        status: 'error',
        erro: 'Não foi possível carregar a leitura canônica de inadimplência.',
      });
      setResumo(prev => prev ? { ...prev, inadimplentes: 0 } : prev);
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    setInadimplentes([]);
    setInadimplenciaSemCadastroAtivo(0);
    setInadimplenciaCanonica(INADIMPLENCIA_CANONICA_LOADING);
    void fetchAlertas();
  }, [fetchAlertas]);

  const inadimplenciaCollectionAllowed = inadimplenciaCanonica.collectionAllowed;
  const inadimplenciaFreshUntil = inadimplenciaCanonica.freshUntil;
  useEffect(() => {
    if (!inadimplenciaCollectionAllowed || !inadimplenciaFreshUntil) return;

    const limiteFrescor = Date.parse(inadimplenciaFreshUntil);
    const tempoAteExpirar = limiteFrescor - Date.now();
    if (!Number.isFinite(limiteFrescor) || tempoAteExpirar <= 0) {
      invalidarInadimplenciaExpirada();
      return;
    }

    const timerExpiracao = window.setTimeout(() => {
      invalidarInadimplenciaExpirada();
      void fetchAlertas();
    }, tempoAteExpirar);

    return () => window.clearTimeout(timerExpiracao);
  }, [
    inadimplenciaCollectionAllowed,
    inadimplenciaFreshUntil,
    unidadeId,
    fetchAlertas,
    invalidarInadimplenciaExpirada,
  ]);

  return {
    aniversariantes,
    inadimplentes,
    novosMatriculados,
    renovacoes,
    resumo,
    inadimplenciaCanonica,
    inadimplenciaSemCadastroAtivo,
    loading,
    error,
    refresh: fetchAlertas
  };
}
