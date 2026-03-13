import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface DetailedDependency {
  id: number | string;
  nome: string;
  info_adicional?: string;
}

export interface ProfessorDependencies {
  // Bloqueios (NO ACTION) - impedem exclusão
  alunos: number;
  aulas: number;
  leads: number;
  turmas: number;
  movimentacoes: number;
  renovacoes: number;
  evasoes: number;
  experimentais: number;
  
  // Dados CASCADE - serão deletados automaticamente
  presencas: number;
  avaliacoes360: number;
  ocorrencias360: number;
  feedbacks: number;
  acoes: number;
  videos: number;
  turmasExplicitas: number;
  carteira: number;
  
  // Relacionamentos (já deletados manualmente no código atual)
  unidades: number;
  cursos: number;
}

export interface DetailedProfessorDependencies extends ProfessorDependencies {
  // Listas detalhadas dos bloqueios
  alunosDetalhes: DetailedDependency[];
  leadsDetalhes: DetailedDependency[];
  aulasDetalhes: DetailedDependency[];
  turmasDetalhes: DetailedDependency[];
  movimentacoesDetalhes: DetailedDependency[];
  renovacoesDetalhes: DetailedDependency[];
  evasoesDetalhes: DetailedDependency[];
  experimentaisDetalhes: DetailedDependency[];
  
  // Listas detalhadas dos dados CASCADE
  presencasDetalhes: DetailedDependency[];
  avaliacoes360Detalhes: DetailedDependency[];
  ocorrencias360Detalhes: DetailedDependency[];
  feedbacksDetalhes: DetailedDependency[];
  acoesDetalhes: DetailedDependency[];
  videosDetalhes: DetailedDependency[];
  turmasExplicitasDetalhes: DetailedDependency[];
  carteiraDetalhes: DetailedDependency[];
}

export function useProfessorDependencies() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDependencies = async (professorId: number): Promise<ProfessorDependencies> => {
    setLoading(true);
    setError(null);

    try {
      // Executar todas as queries em paralelo para performance
      const [
        alunosResult,
        aulasResult,
        leadsResult,
        turmasResult,
        movimentacoesResult,
        renovacoesResult,
        evasoesResult,
        experimentaisResult,
        presencasResult,
        avaliacoes360Result,
        ocorrencias360Result,
        feedbacksResult,
        acoesResult,
        videosResult,
        turmasExplicitasResult,
        carteiraResult,
        unidadesResult,
        cursosResult,
      ] = await Promise.all([
        // Bloqueios (NO ACTION)
        supabase
          .from('alunos')
          .select('id', { count: 'exact', head: true })
          .or(`professor_atual_id.eq.${professorId},professor_experimental_id.eq.${professorId}`),
        
        supabase
          .from('aulas_emusys')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .or(`professor_fixo_id.eq.${professorId},professor_experimental_id.eq.${professorId}`),
        
        supabase
          .from('turmas')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('movimentacoes')
          .select('id', { count: 'exact', head: true })
          .or(`professor_id.eq.${professorId},professor_anterior_id.eq.${professorId}`),
        
        supabase
          .from('renovacoes')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('evasoes_v2')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('experimentais_professor_mensal')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        // Dados CASCADE (serão deletados)
        supabase
          .from('aluno_presenca')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('professor_360_avaliacoes')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('professor_360_ocorrencias')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('aluno_feedback_professor')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('professor_acoes')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('professor_videos')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('turmas_explicitas')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('loja_carteira')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        // Relacionamentos
        supabase
          .from('professores_unidades')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
        
        supabase
          .from('professores_cursos')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', professorId),
      ]);

      return {
        // Bloqueios
        alunos: alunosResult.count || 0,
        aulas: aulasResult.count || 0,
        leads: leadsResult.count || 0,
        turmas: turmasResult.count || 0,
        movimentacoes: movimentacoesResult.count || 0,
        renovacoes: renovacoesResult.count || 0,
        evasoes: evasoesResult.count || 0,
        experimentais: experimentaisResult.count || 0,
        
        // CASCADE
        presencas: presencasResult.count || 0,
        avaliacoes360: avaliacoes360Result.count || 0,
        ocorrencias360: ocorrencias360Result.count || 0,
        feedbacks: feedbacksResult.count || 0,
        acoes: acoesResult.count || 0,
        videos: videosResult.count || 0,
        turmasExplicitas: turmasExplicitasResult.count || 0,
        carteira: carteiraResult.count || 0,
        
        // Relacionamentos
        unidades: unidadesResult.count || 0,
        cursos: cursosResult.count || 0,
      };
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar dependências');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const hasBloqueios = (deps: ProfessorDependencies): boolean => {
    return (
      deps.alunos > 0 ||
      deps.aulas > 0 ||
      deps.leads > 0 ||
      deps.turmas > 0 ||
      deps.movimentacoes > 0 ||
      deps.renovacoes > 0 ||
      deps.evasoes > 0 ||
      deps.experimentais > 0
    );
  };

  const hasDadosCascade = (deps: ProfessorDependencies): boolean => {
    return (
      deps.presencas > 0 ||
      deps.avaliacoes360 > 0 ||
      deps.ocorrencias360 > 0 ||
      deps.feedbacks > 0 ||
      deps.acoes > 0 ||
      deps.videos > 0 ||
      deps.turmasExplicitas > 0 ||
      deps.carteira > 0
    );
  };

  const getDetailedDependencies = async (professorId: number): Promise<DetailedProfessorDependencies> => {
    setLoading(true);
    setError(null);

    try {
      // Buscar contagens básicas primeiro
      const basicDeps = await checkDependencies(professorId);

      // Buscar detalhes dos bloqueios
      const [
        alunosData,
        leadsData,
        aulasData,
        turmasData,
        evasoesData,
        experimentaisData,
        presencasData,
        avaliacoes360Data,
        ocorrencias360Data,
      ] = await Promise.all([
        // Alunos detalhados
        supabase
          .from('alunos')
          .select('id, nome, status, professor_atual_id, professor_experimental_id')
          .or(`professor_atual_id.eq.${professorId},professor_experimental_id.eq.${professorId}`)
          .limit(50),
        
        // Leads detalhados
        supabase
          .from('leads')
          .select('id, nome, status, professor_fixo_id, professor_experimental_id')
          .or(`professor_fixo_id.eq.${professorId},professor_experimental_id.eq.${professorId}`)
          .limit(50),
        
        // Aulas detalhadas
        supabase
          .from('aulas_emusys')
          .select('id, data_aula, horario_inicio, curso_nome, turma_nome')
          .eq('professor_id', professorId)
          .order('data_aula', { ascending: false })
          .limit(20),
        
        // Turmas detalhadas
        supabase
          .from('turmas')
          .select('id, nome, dia_semana, horario')
          .eq('professor_id', professorId)
          .limit(20),
        
        // Evasões detalhadas
        supabase
          .from('evasoes_v2')
          .select('id, aluno_nome, tipo_evasao, mes_saida')
          .eq('professor_id', professorId)
          .limit(20),
        
        // Experimentais detalhadas
        supabase
          .from('experimentais_professor_mensal')
          .select('id, competencia, quantidade_experimentais')
          .eq('professor_id', professorId)
          .order('competencia', { ascending: false })
          .limit(12),
        
        // Presenças detalhadas
        supabase
          .from('aluno_presenca')
          .select('id, data_aula, status, curso_nome')
          .eq('professor_id', professorId)
          .order('data_aula', { ascending: false })
          .limit(20),
        
        // Avaliações 360 detalhadas
        supabase
          .from('professor_360_avaliacoes')
          .select('id, competencia, nota_final')
          .eq('professor_id', professorId)
          .order('competencia', { ascending: false })
          .limit(12),
        
        // Ocorrências 360 detalhadas
        supabase
          .from('professor_360_ocorrencias')
          .select('id, data_ocorrencia, tipo, descricao')
          .eq('professor_id', professorId)
          .order('data_ocorrencia', { ascending: false })
          .limit(20),
      ]);

      return {
        ...basicDeps,
        
        // Bloqueios detalhados
        alunosDetalhes: alunosData.data?.map(a => ({
          id: a.id,
          nome: a.nome,
          info_adicional: a.professor_atual_id === professorId 
            ? `${a.status} - Professor Atual` 
            : `${a.status} - Professor Experimental`
        })) || [],
        
        leadsDetalhes: leadsData.data?.map(l => ({
          id: l.id,
          nome: l.nome,
          info_adicional: `${l.status} - ${l.professor_fixo_id === professorId ? 'Prof. Fixo' : 'Prof. Experimental'}`
        })) || [],
        
        aulasDetalhes: aulasData.data?.map(a => ({
          id: a.id,
          nome: `Aula ${a.data_aula} ${a.horario_inicio || ''}`,
          info_adicional: `${a.curso_nome || ''} ${a.turma_nome ? `- ${a.turma_nome}` : ''}`
        })) || [],
        
        turmasDetalhes: turmasData.data?.map(t => ({
          id: t.id,
          nome: t.nome || `Turma ${t.id}`,
          info_adicional: `${t.dia_semana || ''} ${t.horario || ''}`
        })) || [],
        
        movimentacoesDetalhes: [], // Não buscar por performance
        renovacoesDetalhes: [], // Não buscar por performance
        
        evasoesDetalhes: evasoesData.data?.map(e => ({
          id: e.id,
          nome: e.aluno_nome,
          info_adicional: `${e.tipo_evasao} - ${e.mes_saida || ''}`
        })) || [],
        
        experimentaisDetalhes: experimentaisData.data?.map(e => ({
          id: e.id,
          nome: `Competência ${e.competencia}`,
          info_adicional: `${e.quantidade_experimentais} experimentais`
        })) || [],
        
        // CASCADE detalhados
        presencasDetalhes: presencasData.data?.map(p => ({
          id: p.id,
          nome: `${p.data_aula} - ${p.status}`,
          info_adicional: p.curso_nome || ''
        })) || [],
        
        avaliacoes360Detalhes: avaliacoes360Data.data?.map(a => ({
          id: a.id,
          nome: `Avaliação ${a.competencia}`,
          info_adicional: `Nota: ${a.nota_final || 'N/A'}`
        })) || [],
        
        ocorrencias360Detalhes: ocorrencias360Data.data?.map(o => ({
          id: o.id,
          nome: `${o.tipo} - ${o.data_ocorrencia}`,
          info_adicional: o.descricao?.substring(0, 50) || ''
        })) || [],
        
        feedbacksDetalhes: [], // Não buscar por performance
        acoesDetalhes: [], // Não buscar por performance
        videosDetalhes: [], // Não buscar por performance
        turmasExplicitasDetalhes: [], // Não buscar por performance
        carteiraDetalhes: [], // Não buscar por performance
      };
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar dependências detalhadas');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    checkDependencies,
    getDetailedDependencies,
    hasBloqueios,
    hasDadosCascade,
    loading,
    error,
  };
}
