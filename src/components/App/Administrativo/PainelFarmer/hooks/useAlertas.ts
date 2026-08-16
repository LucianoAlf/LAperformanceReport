import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INADIMPLENCIA_CANONICA_LOADING,
  montarAlertasInadimplenciaCanonica,
  normalizarInadimplenciaCanonica,
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
      setInadimplenciaCanonica(estadoCanonico);

      let alertasCanonicos: AlertaInadimplente[] = [];
      let semCadastroAtivo = 0;
      if (estadoCanonico.status === 'ok' && estadoCanonico.items.length > 0) {
        const matriculas = [...new Set(estadoCanonico.items
          .map((item) => item.emusys_matricula_id)
          .filter((id): id is string => Boolean(id)))];

        let alunosQuery = supabase
          .from('alunos')
          .select(`
            id, nome, unidade_id, emusys_matricula_id, status, arquivado_em,
            is_segundo_curso, whatsapp, telefone,
            professores:professor_atual_id(id, nome),
            cursos:curso_id(nome)
          `)
          .eq('status', 'ativo')
          .is('arquivado_em', null)
          .in('emusys_matricula_id', matriculas);
        if (unidadeFilter) alunosQuery = alunosQuery.eq('unidade_id', unidadeFilter);

        const { data: alunosData, error: alunosError } = await alunosQuery;
        if (alunosError) throw alunosError;

        const alunosCanonicos = (alunosData ?? []).map((row: any): AlunoInadimplenciaCanonicaSource => ({
          ...row,
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
            inadimplentes: estadoCanonico.status === 'ok' ? alertasCanonicos.length : 0,
          });
        } else {
          const consolidado: ResumoAlertas = {
            unidade_id: 'todos',
            unidade_nome: 'Todas as Unidades',
            aniversariantes_hoje: resumoData.reduce((acc, r) => acc + (r.aniversariantes_hoje || 0), 0),
            inadimplentes: estadoCanonico.status === 'ok' ? alertasCanonicos.length : 0,
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
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

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
