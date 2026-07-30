// Hook para o Simulador de Média de Alunos por Turma
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAlunosAtivosAtuaisCanonicos } from '@/lib/estadoOperacionalAlunos';
import {
  InputsSimuladorTurma,
  ResultadoSimuladorTurma,
  ProfessorTurma,
  DadosUnidadeTurma,
  CENARIOS_ESCALONAMENTO,
  META_PADRAO,
  SEMANAS_MES,
} from '@/lib/simulador-turma/tipos';
import {
  calcularResultadoSimulador,
  calcularDadosProfessor,
  calcularBonificacoesSugeridas,
} from '@/lib/simulador-turma/calculos';

interface UseSimuladorTurmaReturn {
  // Dados
  dadosUnidade: DadosUnidadeTurma | null;
  professores: ProfessorTurma[];
  resultado: ResultadoSimuladorTurma | null;
  bonificacoes: ReturnType<typeof calcularBonificacoesSugeridas>;
  
  // Inputs
  inputs: InputsSimuladorTurma;
  setInput: <K extends keyof InputsSimuladorTurma>(key: K, value: InputsSimuladorTurma[K]) => void;
  setCenario: (cenarioId: InputsSimuladorTurma['cenarioId']) => void;
  
  // Estado
  loading: boolean;
  error: string | null;
  
  // Ações
  recarregar: () => Promise<void>;
}

export function useSimuladorTurma(
  unidadeId: string | null
): UseSimuladorTurmaReturn {
  // Estado dos inputs (valores padrão para simulação)
  const [inputs, setInputs] = useState<InputsSimuladorTurma>({
    // Parâmetros editáveis da simulação
    mediaAtual: 1.0, // Valor padrão para simulação
    ticketMedio: 419, // Valor padrão
    totalAlunos: 200, // Valor padrão
    custosFixos: 0, // Custos fixos opcionais
    
    // Meta
    mediaMeta: META_PADRAO,
    
    // Cenário de escalonamento
    cenarioId: 'equilibrado',
    valorBase: 30,
    incremento: 5,
    semanasMes: SEMANAS_MES,
  });
  
  // Estado dos dados
  const [dadosUnidade, setDadosUnidade] = useState<DadosUnidadeTurma | null>(null);
  const [professoresRaw, setProfessoresRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Buscar dados da unidade e professores
  const carregarDados = useCallback(async () => {
    if (!unidadeId) {
      setDadosUnidade(null);
      setProfessoresRaw([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const alunosData = await fetchAlunosAtivosAtuaisCanonicos(unidadeId);

      const turmasMap = new Map<string, number>();
      let totalAlunos = 0;
      let mrrTotal = 0;
      alunosData.forEach((aluno) => {
        if (!aluno.professor_atual_id || !aluno.dia_aula || !aluno.horario_aula) return;
        const chave = `${aluno.professor_atual_id}-${aluno.dia_aula}-${aluno.horario_aula}`;
        turmasMap.set(chave, (turmasMap.get(chave) || 0) + 1);
        totalAlunos++;
        mrrTotal += Number(aluno.valor_parcela) || 0;
      });

      const totalTurmas = turmasMap.size;
      const mediaAtual = totalTurmas > 0 ? totalAlunos / totalTurmas : 0;
      const ticketMedio = totalAlunos > 0 ? mrrTotal / totalAlunos : 0;
      const unidadeNome = alunosData[0]?.unidade_nome || 'Unidade';

      setDadosUnidade({
        unidadeId,
        unidadeNome,
        totalAlunos,
        totalTurmas,
        mediaAlunosTurmaAtual: mediaAtual,
        ticketMedio,
        mrrTotal,
        folhaAtual: 0,
        percentualFolhaAtual: 0,
        margemAtual: 0,
      });

      const profData = alunosData
        .filter((aluno) => aluno.professor_atual_id && aluno.dia_aula && aluno.horario_aula)
        .map((aluno) => ({
          professor_atual_id: aluno.professor_atual_id,
          dia_aula: aluno.dia_aula,
          horario_aula: aluno.horario_aula,
          valor_parcela: aluno.valor_parcela,
          professores: { id: aluno.professor_atual_id, nome: aluno.professor_nome || 'Professor' },
          unidades: { id: aluno.unidade_id, nome: aluno.unidade_nome },
        }));

      // Agrupar por professor
      const profMap = new Map<number, {
        id: number;
        nome: string;
        unidadeId: string;
        unidadeNome: string;
        matriculas: number;
        turmas: Set<string>;
        mrr: number;
      }>();

      profData?.forEach(aluno => {
        const profId = aluno.professor_atual_id;
        const prof = aluno.professores as any;
        const unidade = aluno.unidades as any;

        if (!profMap.has(profId)) {
          profMap.set(profId, {
            id: profId,
            nome: prof.nome,
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            matriculas: 0,
            turmas: new Set(),
            mrr: 0,
          });
        }

        const p = profMap.get(profId)!;
        p.matriculas++;
        p.turmas.add(`${aluno.dia_aula}-${aluno.horario_aula}`);
        p.mrr += Number(aluno.valor_parcela) || 0;
      });

      // Converter para array
      const professoresArray = Array.from(profMap.values()).map(p => ({
        id: p.id,
        nome: p.nome,
        unidadeId: p.unidadeId,
        unidadeNome: p.unidadeNome,
        totalAlunos: p.matriculas,
        totalMatriculas: p.matriculas,
        totalTurmas: p.turmas.size,
        mrrCarteira: p.mrr,
      }));
      
      setProfessoresRaw(professoresArray);
      
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);
  
  // Carregar dados ao montar ou mudar unidade
  useEffect(() => {
    carregarDados();
  }, [carregarDados]);
  
  // Sincronizar inputs com dados da unidade quando carregados (apenas se houver dados reais)
  useEffect(() => {
    if (dadosUnidade && dadosUnidade.totalAlunos > 0) {
      setInputs(prev => ({
        ...prev,
        mediaAtual: dadosUnidade.mediaAlunosTurmaAtual,
        ticketMedio: dadosUnidade.ticketMedio,
        totalAlunos: dadosUnidade.totalAlunos,
      }));
    }
  }, [dadosUnidade]);
  
  // Atualizar input individual
  const setInput = useCallback(<K extends keyof InputsSimuladorTurma>(
    key: K,
    value: InputsSimuladorTurma[K]
  ) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);
  
  // Mudar cenário de escalonamento
  const setCenario = useCallback((cenarioId: InputsSimuladorTurma['cenarioId']) => {
    const cenario = CENARIOS_ESCALONAMENTO.find(c => c.id === cenarioId);
    if (cenario) {
      setInputs(prev => ({
        ...prev,
        cenarioId,
        valorBase: cenario.valorBase,
        incremento: cenario.incremento,
      }));
    } else {
      setInputs(prev => ({ ...prev, cenarioId }));
    }
  }, []);
  
  // Calcular resultado usando os inputs editáveis (não os dados da unidade)
  const resultado = calcularResultadoSimulador(
    inputs.totalAlunos,
    inputs.ticketMedio,
    inputs.mediaAtual,
    inputs.mediaMeta,
    inputs.valorBase,
    inputs.incremento,
    inputs.semanasMes,
    inputs.custosFixos
  );
  
  // Calcular dados dos professores
  const professores = professoresRaw.map(p =>
    calcularDadosProfessor(
      p,
      inputs.mediaMeta,
      inputs.valorBase,
      inputs.incremento,
      inputs.semanasMes
    )
  ).sort((a, b) => a.mediaAlunosTurma - b.mediaAlunosTurma);
  
  // Calcular bonificações sugeridas usando inputs editáveis
  const bonificacoes = calcularBonificacoesSugeridas(
    20, // Assumindo 20 alunos por professor para exemplo
    inputs.ticketMedio,
    inputs.mediaAtual,
    inputs.valorBase,
    inputs.incremento,
    inputs.semanasMes
  );
  
  return {
    dadosUnidade,
    professores,
    resultado,
    bonificacoes,
    inputs,
    setInput,
    setCenario,
    loading,
    error,
    recarregar: carregarDados,
  };
}
