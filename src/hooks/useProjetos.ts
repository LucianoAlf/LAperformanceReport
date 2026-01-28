import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { 
  Projeto, 
  ProjetoTipo, 
  ProjetoFase, 
  ProjetoTarefa,
  ProjetoTipoFaseTemplate,
  ProjetoTipoTarefaTemplate,
  ProjetosStats,
  ProximoPrazo,
  Alerta,
  ProjetoStatus
} from '../types/projetos';

// ============================================
// Hook para buscar Tipos de Projeto
// ============================================
export function useProjetoTipos() {
  const [data, setData] = useState<ProjetoTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projeto_tipos')
        .select('*')
        .eq('ativo', true)
        .order('nome');
      
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

  return { data, loading, error, refetch };
}

// ============================================
// Hook para buscar Templates de Fases por Tipo
// ============================================
export function useProjetoTipoFases(tipoId: number | null) {
  const [data, setData] = useState<ProjetoTipoFaseTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tipoId) {
      setData([]);
      return;
    }

    async function fetchFases() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('projeto_tipo_fases_template')
          .select('*')
          .eq('tipo_id', tipoId)
          .order('ordem');
        
        if (error) throw error;
        setData(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchFases();
  }, [tipoId]);

  return { data, loading, error };
}

// ============================================
// Hook para buscar Templates de Tarefas por Fase Template
// ============================================
export function useProjetoTipoTarefas(faseTemplateId: number | null) {
  const [data, setData] = useState<ProjetoTipoTarefaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!faseTemplateId) {
      setData([]);
      return;
    }

    async function fetchTarefas() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('projeto_tipo_tarefas_template')
          .select('*')
          .eq('fase_template_id', faseTemplateId)
          .order('ordem');
        
        if (error) throw error;
        setData(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchTarefas();
  }, [faseTemplateId]);

  return { data, loading, error };
}

// ============================================
// Hook principal para buscar Projetos
// ============================================
export function useProjetos(unidadeId?: string | null) {
  const [data, setData] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('projetos')
        .select(`
          *,
          tipo:projeto_tipos(*),
          unidade:unidades(id, nome, codigo),
          fases:projeto_fases(
            *,
            tarefas:projeto_tarefas(*)
          ),
          equipe:projeto_equipe(
            *
          )
        `)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false });
      
      // Filtrar por unidade apenas se for um UUID válido
      if (unidadeId && unidadeId !== 'consolidado' && unidadeId !== 'todas') {
        query = query.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
      }
      
      const { data: projetos, error } = await query;
      
      if (error) throw error;

      // Calcular progresso para cada projeto
      const projetosComProgresso = (projetos || []).map(projeto => {
        let totalTarefas = 0;
        let tarefasConcluidas = 0;

        projeto.fases?.forEach((fase: ProjetoFase) => {
          fase.tarefas?.forEach((tarefa: ProjetoTarefa) => {
            totalTarefas++;
            if (tarefa.status === 'concluida') {
              tarefasConcluidas++;
            }
          });
        });

        const progresso = totalTarefas > 0 
          ? Math.round((tarefasConcluidas / totalTarefas) * 100) 
          : 0;

        return {
          ...projeto,
          progresso,
          total_tarefas: totalTarefas,
          tarefas_concluidas: tarefasConcluidas,
        };
      });

      setData(projetosComProgresso);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ============================================
// Hook para buscar um Projeto específico
// ============================================
export function useProjeto(projetoId: number | null) {
  const [data, setData] = useState<Projeto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projetoId) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      const { data: projeto, error } = await supabase
        .from('projetos')
        .select(`
          *,
          tipo:projeto_tipos(*),
          unidade:unidades(id, nome, codigo),
          fases:projeto_fases(
            *,
            tarefas:projeto_tarefas(*)
          ),
          equipe:projeto_equipe(*)
        `)
        .eq('id', projetoId)
        .single();
      
      if (error) throw error;

      // Calcular progresso
      let totalTarefas = 0;
      let tarefasConcluidas = 0;

      projeto.fases?.forEach((fase: ProjetoFase) => {
        fase.tarefas?.forEach((tarefa: ProjetoTarefa) => {
          totalTarefas++;
          if (tarefa.status === 'concluida') {
            tarefasConcluidas++;
          }
        });
      });

      const progresso = totalTarefas > 0 
        ? Math.round((tarefasConcluidas / totalTarefas) * 100) 
        : 0;

      setData({
        ...projeto,
        progresso,
        total_tarefas: totalTarefas,
        tarefas_concluidas: tarefasConcluidas,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [projetoId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ============================================
// Hook para Tarefas de um Projeto
// ============================================
export function useProjetoTarefas(projetoId: number | null) {
  const [data, setData] = useState<ProjetoTarefa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projetoId) {
      setData([]);
      return;
    }

    setLoading(true);
    try {
      // Buscar fases do projeto primeiro
      const { data: fases, error: fasesError } = await supabase
        .from('projeto_fases')
        .select('id')
        .eq('projeto_id', projetoId);
      
      if (fasesError) throw fasesError;

      if (!fases || fases.length === 0) {
        setData([]);
        return;
      }

      const faseIds = fases.map(f => f.id);

      // Buscar tarefas das fases
      const { data: tarefas, error: tarefasError } = await supabase
        .from('projeto_tarefas')
        .select('*')
        .in('fase_id', faseIds)
        .order('ordem');
      
      if (tarefasError) throw tarefasError;
      setData(tarefas || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [projetoId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ============================================
// Hook para Estatísticas do Dashboard
// ============================================
export function useProjetosStats(unidadeId?: string | null) {
  const [stats, setStats] = useState<ProjetosStats>({
    total_ativos: 0,
    total_atrasados: 0,
    total_tarefas_pendentes: 0,
    taxa_conclusao: 0,
    por_status: {
      planejamento: 0,
      em_andamento: 0,
      em_revisao: 0,
      concluido: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        // Buscar projetos com suas tarefas
        let query = supabase
          .from('projetos')
          .select(`
            id,
            status,
            data_fim,
            fases:projeto_fases(
              tarefas:projeto_tarefas(id, status, prazo)
            )
          `)
          .neq('status', 'cancelado');
        
        // Filtrar por unidade apenas se for um UUID válido
        if (unidadeId && unidadeId !== 'consolidado' && unidadeId !== 'todas') {
          query = query.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
        }
        
        const { data: projetos, error } = await query;
        
        if (error) throw error;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let totalAtivos = 0;
        let totalAtrasados = 0;
        let totalTarefasPendentes = 0;
        let totalTarefas = 0;
        let tarefasConcluidas = 0;
        const porStatus = {
          planejamento: 0,
          em_andamento: 0,
          em_revisao: 0,
          concluido: 0,
        };

        projetos?.forEach(projeto => {
          // Contar por status
          if (projeto.status in porStatus) {
            porStatus[projeto.status as keyof typeof porStatus]++;
          }

          // Projetos ativos (não concluídos)
          if (projeto.status !== 'concluido') {
            totalAtivos++;

            // Verificar se está atrasado
            if (projeto.data_fim) {
              const prazo = new Date(projeto.data_fim);
              if (prazo < hoje) {
                totalAtrasados++;
              }
            }
          }

          // Contar tarefas
          projeto.fases?.forEach((fase: any) => {
            fase.tarefas?.forEach((tarefa: any) => {
              totalTarefas++;
              
              if (tarefa.status === 'concluida') {
                tarefasConcluidas++;
              } else {
                totalTarefasPendentes++;
                
                // Verificar tarefas atrasadas também
                if (tarefa.prazo) {
                  const prazotarefa = new Date(tarefa.prazo);
                  if (prazotarefa < hoje && projeto.status !== 'concluido') {
                    // Já contamos o projeto como atrasado
                  }
                }
              }
            });
          });
        });

        const taxaConclusao = totalTarefas > 0 
          ? Math.round((tarefasConcluidas / totalTarefas) * 100) 
          : 0;

        setStats({
          total_ativos: totalAtivos,
          total_atrasados: totalAtrasados,
          total_tarefas_pendentes: totalTarefasPendentes,
          taxa_conclusao: taxaConclusao,
          por_status: porStatus,
        });
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [unidadeId]);

  return { stats, loading, error };
}

// ============================================
// Hook para Próximos Prazos
// ============================================
export function useProximosPrazos(unidadeId?: string | null, limite: number = 5) {
  const [data, setData] = useState<ProximoPrazo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchPrazos() {
      setLoading(true);
      try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const hojeISO = hoje.toISOString().split('T')[0];

        // Buscar tarefas com prazo próximo
        let query = supabase
          .from('projeto_tarefas')
          .select(`
            id,
            titulo,
            prazo,
            responsavel_tipo,
            responsavel_id,
            projeto:projetos!inner(
              id,
              nome,
              status,
              unidade_id
            )
          `)
          .neq('status', 'concluida')
          .neq('status', 'cancelada')
          .not('prazo', 'is', null)
          .gte('prazo', hojeISO)
          .order('prazo', { ascending: true })
          .limit(limite * 2); // Buscar mais para filtrar depois

        const { data: tarefas, error } = await query;
        
        if (error) throw error;

        // Filtrar por unidade e formatar
        const prazos: ProximoPrazo[] = [];
        const tresDias = new Date(hoje);
        tresDias.setDate(tresDias.getDate() + 3);

        tarefas?.forEach((tarefa: any) => {
          const projeto = tarefa.projeto;
          
          // Filtrar por unidade apenas se for um UUID válido
          if (unidadeId && unidadeId !== 'consolidado' && unidadeId !== 'todas') {
            if (projeto?.unidade_id && projeto.unidade_id !== unidadeId) {
              return;
            }
          }

          // Ignorar projetos concluídos
          if (projeto?.status === 'concluido') return;

          const prazoDt = new Date(tarefa.prazo);
          let urgencia: 'normal' | 'alerta' | 'urgente' = 'normal';
          
          if (prazoDt < hoje) {
            urgencia = 'urgente';
          } else if (prazoDt <= tresDias) {
            urgencia = 'alerta';
          }

          prazos.push({
            id: tarefa.id,
            tipo: 'tarefa',
            titulo: tarefa.titulo,
            projeto_titulo: projeto?.nome,
            data_prazo: tarefa.prazo,
            urgencia,
          });
        });

        // Limitar ao número solicitado
        setData(prazos.slice(0, limite));
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchPrazos();
  }, [unidadeId, limite]);

  return { data, loading, error };
}

// ============================================
// Hook para Alertas do Dashboard
// ============================================
export function useProjetosAlertas(unidadeId?: string | null) {
  const [data, setData] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAlertas() {
      setLoading(true);
      try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const hojeISO = hoje.toISOString().split('T')[0];
        const tresDias = new Date(hoje);
        tresDias.setDate(tresDias.getDate() + 3);
        const tresDiasISO = tresDias.toISOString().split('T')[0];

        // Buscar projetos com tarefas atrasadas
        let query = supabase
          .from('projetos')
          .select(`
            id,
            nome,
            status,
            data_fim,
            unidade_id,
            tarefas:projeto_tarefas(
              id,
              titulo,
              status,
              prazo
            )
          `)
          .neq('status', 'concluido')
          .neq('status', 'cancelado');
        
        // Filtrar por unidade apenas se for um UUID válido
        if (unidadeId && unidadeId !== 'consolidado' && unidadeId !== 'todas') {
          query = query.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
        }

        const { data: projetos, error } = await query;
        
        if (error) throw error;

        const alertas: Alerta[] = [];

        projetos?.forEach((projeto: any) => {
          let tarefasAtrasadas = 0;
          let tarefasProximas = 0;

          projeto.tarefas?.forEach((tarefa: any) => {
            if (tarefa.status === 'concluida' || tarefa.status === 'cancelada') return;
            
            if (tarefa.prazo) {
              const prazoDt = new Date(tarefa.prazo);
              if (prazoDt < hoje) {
                tarefasAtrasadas++;
              } else if (prazoDt <= tresDias) {
                tarefasProximas++;
              }
            }
          });

          // Alerta de projeto atrasado
          if (tarefasAtrasadas > 0) {
            alertas.push({
              id: `atrasado-${projeto.id}`,
              tipo: 'danger',
              titulo: 'Projeto atrasado!',
              descricao: `${projeto.nome} tem ${tarefasAtrasadas} tarefa${tarefasAtrasadas > 1 ? 's' : ''} vencida${tarefasAtrasadas > 1 ? 's' : ''}`,
              tempo: 'Agora',
              projeto_id: projeto.id,
            });
          }

          // Alerta de prazo próximo
          if (tarefasProximas > 0 && tarefasAtrasadas === 0) {
            alertas.push({
              id: `proximo-${projeto.id}`,
              tipo: 'warning',
              titulo: 'Prazo próximo',
              descricao: `${projeto.nome} tem ${tarefasProximas} tarefa${tarefasProximas > 1 ? 's' : ''} vencendo em breve`,
              tempo: 'Em breve',
              projeto_id: projeto.id,
            });
          }
        });

        // Ordenar: danger primeiro, depois warning
        alertas.sort((a, b) => {
          if (a.tipo === 'danger' && b.tipo !== 'danger') return -1;
          if (a.tipo !== 'danger' && b.tipo === 'danger') return 1;
          return 0;
        });

        setData(alertas.slice(0, 5));
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchAlertas();
  }, [unidadeId]);

  return { data, loading, error };
}

// ============================================
// Hook para Sugestões do Fábio (IA)
// ============================================
export function useFabioSugestoes(unidadeId?: string | null) {
  const [data, setData] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSugestoes() {
      setLoading(true);
      try {
        // Por enquanto, gerar sugestões baseadas em regras simples
        // Futuramente, isso pode ser integrado com a API do Gemini
        
        const hoje = new Date();
        const sugestoes: Alerta[] = [];

        // Buscar projetos para análise
        let query = supabase
          .from('projetos')
          .select(`
            id,
            nome,
            status,
            data_fim,
            unidade_id,
            tarefas:projeto_tarefas(
              id,
              titulo,
              status,
              prazo,
              responsavel_tipo,
              responsavel_id
            )
          `)
          .neq('status', 'concluido')
          .neq('status', 'cancelado');
        
        // Filtrar por unidade apenas se for um UUID válido
        if (unidadeId && unidadeId !== 'consolidado' && unidadeId !== 'todas') {
          query = query.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
        }

        const { data: projetos, error } = await query;
        
        if (error) throw error;

        // Analisar projetos para sugestões
        projetos?.forEach((projeto: any) => {
          let tarefasSemResponsavel = 0;
          let tarefasAtrasadas = 0;
          const responsaveis: Set<string> = new Set();

          projeto.tarefas?.forEach((tarefa: any) => {
            if (tarefa.status === 'concluida' || tarefa.status === 'cancelada') return;

            // Tarefas sem responsável
            if (!tarefa.responsavel_id) {
              tarefasSemResponsavel++;
            } else {
              responsaveis.add(`${tarefa.responsavel_tipo}-${tarefa.responsavel_id}`);
            }

            // Tarefas atrasadas
            if (tarefa.prazo) {
              const prazoDt = new Date(tarefa.prazo);
              if (prazoDt < hoje) {
                tarefasAtrasadas++;
              }
            }
          });

          // Sugestão: Atribuir responsáveis
          if (tarefasSemResponsavel > 2) {
            sugestoes.push({
              id: `sugestao-responsavel-${projeto.id}`,
              tipo: 'info',
              titulo: 'Fábio sugere',
              descricao: `Atribuir responsáveis às ${tarefasSemResponsavel} tarefas sem dono em "${projeto.nome}"`,
              tempo: 'Sugestão',
              projeto_id: projeto.id,
            });
          }

          // Sugestão: Redistribuir tarefas se muitas atrasadas
          if (tarefasAtrasadas > 2 && responsaveis.size > 1) {
            sugestoes.push({
              id: `sugestao-redistribuir-${projeto.id}`,
              tipo: 'info',
              titulo: 'Fábio sugere',
              descricao: `Redistribuir tarefas atrasadas em "${projeto.nome}" entre a equipe`,
              tempo: 'Sugestão',
              projeto_id: projeto.id,
            });
          }
        });

        setData(sugestoes.slice(0, 3));
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchSugestoes();
  }, [unidadeId]);

  return { data, loading, error };
}

// ============================================
// Hook para Criar Projeto (com fases automáticas)
// ============================================
export function useCreateProjeto() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createProjeto = async (dados: {
    tipo_id: number;
    nome: string;
    descricao?: string;
    data_inicio: string;
    data_fim: string;
    unidade_id?: string | null;
    prioridade: string;
    orcamento?: number;
    equipe?: { tipo: string; id: number }[];
  }) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Criar o projeto
      const { data: projeto, error: projetoError } = await supabase
        .from('projetos')
        .insert({
          tipo_id: dados.tipo_id,
          nome: dados.nome,
          descricao: dados.descricao || null,
          data_inicio: dados.data_inicio,
          data_fim: dados.data_fim,
          unidade_id: dados.unidade_id || null,
          prioridade: dados.prioridade,
          orcamento: dados.orcamento || null,
          status: 'planejamento',
        })
        .select()
        .single();

      if (projetoError) throw projetoError;

      // 2. Buscar templates de fases do tipo selecionado
      const { data: fasesTemplate, error: fasesTemplateError } = await supabase
        .from('projeto_tipo_fases_template')
        .select('*')
        .eq('tipo_id', dados.tipo_id)
        .order('ordem');

      if (fasesTemplateError) throw fasesTemplateError;

      // 3. Criar fases automaticamente baseado nos templates
      if (fasesTemplate && fasesTemplate.length > 0) {
        const dataInicio = new Date(dados.data_inicio);
        let dataAtual = new Date(dataInicio);

        const fasesParaInserir = fasesTemplate.map((template) => {
          const faseDataInicio = new Date(dataAtual);
          const duracaoDias = template.duracao_sugerida_dias || 7;
          dataAtual.setDate(dataAtual.getDate() + duracaoDias);
          const faseDataFim = new Date(dataAtual);

          return {
            projeto_id: projeto.id,
            nome: template.nome,
            ordem: template.ordem,
            data_inicio: faseDataInicio.toISOString().split('T')[0],
            data_fim: faseDataFim.toISOString().split('T')[0],
            status: 'pendente',
            template_id: template.id, // Guardar referência ao template
          };
        });

        const { data: fasesCriadas, error: fasesError } = await supabase
          .from('projeto_fases')
          .insert(fasesParaInserir)
          .select();

        if (fasesError) throw fasesError;

        // 3.1 Criar tarefas automaticamente baseado nos templates de tarefas
        if (fasesCriadas && fasesCriadas.length > 0) {
          // Buscar todas as tarefas template das fases criadas
          const templateIds = fasesTemplate.map(t => t.id);
          const { data: tarefasTemplate, error: tarefasTemplateError } = await supabase
            .from('projeto_tipo_tarefas_template')
            .select('*')
            .in('fase_template_id', templateIds)
            .order('ordem');

          if (tarefasTemplateError) throw tarefasTemplateError;

          if (tarefasTemplate && tarefasTemplate.length > 0) {
            // Mapear template_id para fase_id criada
            const templateToFaseMap = new Map<number, number>();
            fasesCriadas.forEach((fase: { id: number; nome: string; template_id?: number }) => {
              const templateOriginal = fasesTemplate.find(t => t.nome === fase.nome || t.id === fase.template_id);
              if (templateOriginal) {
                templateToFaseMap.set(templateOriginal.id, fase.id);
              }
            });

            // Criar tarefas para cada fase
            const tarefasParaInserir = tarefasTemplate.map((tarefaTemplate, index) => {
              const faseId = templateToFaseMap.get(tarefaTemplate.fase_template_id);
              return {
                projeto_id: projeto.id,
                fase_id: faseId,
                titulo: tarefaTemplate.titulo,
                descricao: tarefaTemplate.descricao,
                ordem: tarefaTemplate.ordem,
                status: 'pendente',
                prioridade: 'normal',
              };
            }).filter(t => t.fase_id); // Só inserir se tiver fase_id válido

            if (tarefasParaInserir.length > 0) {
              const { error: tarefasError } = await supabase
                .from('projeto_tarefas')
                .insert(tarefasParaInserir);

              if (tarefasError) throw tarefasError;
            }
          }
        }
      }

      // 4. Adicionar equipe se fornecida
      if (dados.equipe && dados.equipe.length > 0) {
        const equipeParaInserir = dados.equipe.map((membro) => ({
          projeto_id: projeto.id,
          pessoa_tipo: membro.tipo,
          pessoa_id: membro.id,
        }));

        const { error: equipeError } = await supabase
          .from('projeto_equipe')
          .insert(equipeParaInserir);

        if (equipeError) throw equipeError;
      }

      return projeto;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createProjeto, loading, error };
}

// ============================================
// Hook para Atualizar Projeto
// ============================================
export function useUpdateProjeto() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateProjeto = async (
    projetoId: number,
    dados: {
      nome?: string;
      descricao?: string;
      data_inicio?: string;
      data_fim?: string;
      unidade_id?: string | null;
      prioridade?: string;
      status?: string;
      orcamento?: number;
    }
  ) => {
    setLoading(true);
    setError(null);

    try {
      const { data: projeto, error: projetoError } = await supabase
        .from('projetos')
        .update(dados)
        .eq('id', projetoId)
        .select()
        .single();

      if (projetoError) throw projetoError;

      return projeto;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateProjeto, loading, error };
}

// ============================================
// Hook para Excluir Projeto
// ============================================
export function useDeleteProjeto() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteProjeto = async (projetoId: number) => {
    setLoading(true);
    setError(null);

    try {
      // As fases, tarefas e equipe serão excluídas automaticamente pelo CASCADE
      const { error: deleteError } = await supabase
        .from('projetos')
        .delete()
        .eq('id', projetoId);

      if (deleteError) throw deleteError;

      return true;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteProjeto, loading, error };
}

// ============================================
// Hook para buscar Usuários (para seleção de equipe)
// ============================================
export function useUsuarios() {
  const [data, setData] = useState<{ id: number; nome: string; cargo?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchUsuarios() {
      try {
        const { data, error } = await supabase
          .from('usuarios')
          .select('id, nome, cargo')
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setData(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchUsuarios();
  }, []);

  return { data, loading, error };
}

// ============================================
// Hook para buscar Professores (para seleção de equipe)
// ============================================
export function useProfessores() {
  const [data, setData] = useState<{ id: number; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchProfessores() {
      try {
        const { data, error } = await supabase
          .from('professores')
          .select('id, nome')
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setData(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchProfessores();
  }, []);

  return { data, loading, error };
}

// ============================================
// Hook para buscar Unidades
// ============================================
export function useUnidades() {
  const [data, setData] = useState<{ id: string; nome: string; codigo?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchUnidades() {
      try {
        const { data, error } = await supabase
          .from('unidades')
          .select('id, nome, codigo')
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setData(data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    fetchUnidades();
  }, []);

  return { data, loading, error };
}

// ============================================
// Hook para Criar Tarefa
// ============================================
export function useCreateTarefa() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createTarefa = async (dados: {
    projeto_id: number;
    fase_id: number;
    titulo: string;
    descricao?: string;
    responsavel_tipo?: 'usuario' | 'professor';
    responsavel_id?: number;
    prazo?: string;
    prioridade?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      // Buscar a maior ordem atual na fase
      const { data: tarefasExistentes } = await supabase
        .from('projeto_tarefas')
        .select('ordem')
        .eq('fase_id', dados.fase_id)
        .order('ordem', { ascending: false })
        .limit(1);

      const novaOrdem = tarefasExistentes && tarefasExistentes.length > 0 
        ? tarefasExistentes[0].ordem + 1 
        : 1;

      const { data: tarefa, error: tarefaError } = await supabase
        .from('projeto_tarefas')
        .insert({
          ...dados,
          ordem: novaOrdem,
          status: 'pendente',
          prioridade: dados.prioridade || 'normal',
        })
        .select()
        .single();

      if (tarefaError) throw tarefaError;

      return tarefa;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createTarefa, loading, error };
}

// ============================================
// Hook para Atualizar Tarefa
// ============================================
export function useUpdateTarefa() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateTarefa = async (
    tarefaId: number,
    dados: {
      titulo?: string;
      descricao?: string;
      responsavel_tipo?: 'usuario' | 'professor' | null;
      responsavel_id?: number | null;
      prazo?: string | null;
      prioridade?: string;
      status?: string;
    }
  ) => {
    setLoading(true);
    setError(null);

    try {
      // Se está marcando como concluída, adicionar completed_at
      const dadosAtualizados = { ...dados };
      if (dados.status === 'concluida') {
        (dadosAtualizados as Record<string, unknown>).completed_at = new Date().toISOString();
      } else if (dados.status && dados.status !== 'concluida') {
        (dadosAtualizados as Record<string, unknown>).completed_at = null;
      }

      const { data: tarefa, error: tarefaError } = await supabase
        .from('projeto_tarefas')
        .update(dadosAtualizados)
        .eq('id', tarefaId)
        .select()
        .single();

      if (tarefaError) throw tarefaError;

      return tarefa;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateTarefa, loading, error };
}

// ============================================
// Hook para Excluir Tarefa
// ============================================
export function useDeleteTarefa() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteTarefa = async (tarefaId: number) => {
    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('projeto_tarefas')
        .delete()
        .eq('id', tarefaId);

      if (deleteError) throw deleteError;

      return true;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteTarefa, loading, error };
}

// ============================================
// Hook para Marcar/Desmarcar Tarefa como Concluída
// ============================================
export function useToggleTarefaConcluida() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const toggleConcluida = async (tarefaId: number, concluida: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const { data: tarefa, error: tarefaError } = await supabase
        .from('projeto_tarefas')
        .update({
          status: concluida ? 'concluida' : 'pendente',
          completed_at: concluida ? new Date().toISOString() : null,
        })
        .eq('id', tarefaId)
        .select()
        .single();

      if (tarefaError) throw tarefaError;

      return tarefa;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { toggleConcluida, loading, error };
}

// ============================================
// Hook para buscar Projeto com Detalhes Completos
// ============================================
export function useProjetoDetalhes(projetoId: number | null) {
  const [data, setData] = useState<Projeto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjeto = async () => {
    if (!projetoId) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data: projeto, error: projetoError } = await supabase
        .from('projetos')
        .select(`
          *,
          tipo:projeto_tipos(*),
          unidade:unidades(id, nome, codigo),
          fases:projeto_fases(
            *,
            tarefas:projeto_tarefas(*)
          ),
          equipe:projeto_equipe(*)
        `)
        .eq('id', projetoId)
        .single();

      if (projetoError) throw projetoError;

      // Ordenar fases e tarefas
      if (projeto?.fases) {
        projeto.fases.sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
        projeto.fases.forEach((fase: { tarefas?: { ordem: number }[] }) => {
          if (fase.tarefas) {
            fase.tarefas.sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
          }
        });
      }

      // Calcular progresso
      const todasTarefas = projeto?.fases?.flatMap((f: { tarefas?: { status: string }[] }) => f.tarefas || []) || [];
      const totalTarefas = todasTarefas.length;
      const tarefasConcluidas = todasTarefas.filter((t: { status: string }) => t.status === 'concluida').length;
      
      projeto.total_tarefas = totalTarefas;
      projeto.tarefas_concluidas = tarefasConcluidas;
      projeto.progresso = totalTarefas > 0 
        ? Math.round((tarefasConcluidas / totalTarefas) * 100) 
        : 0;

      setData(projeto);
      return projeto;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projetoId) {
      fetchProjeto();
    }
  }, [projetoId]);

  return { data, loading, error, refetch: fetchProjeto };
}
