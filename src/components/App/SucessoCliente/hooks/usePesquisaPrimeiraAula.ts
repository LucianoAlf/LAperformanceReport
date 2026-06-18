import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface CandidatoPesquisa {
  aluno_id: number;
  unidade_id: string;
  nome: string;
  unidade_nome: string;
  curso_nome: string | null;
  professor_nome: string | null;
  data_primeira_aula: string;
  data_matricula: string;
  whatsapp_jid: string | null;
}

export interface ResultadoEnvio {
  aluno_id: number;
  ok: boolean;
  erro?: string;
}

export function usePesquisaPrimeiraAula(unidadeAtual: UnidadeId) {
  const [candidatos, setCandidatos] = useState<CandidatoPesquisa[]>([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoEnvio[]>([]);

  const buscarCandidatos = useCallback(async (janelaDias: number) => {
    if (unidadeAtual === 'todos') {
      toast.error('Selecione uma unidade para buscar candidatos');
      return;
    }
    setLoading(true);
    setResultados([]);
    try {
      const { data, error } = await supabase.rpc('get_candidatos_pesquisa_primeira_aula', {
        p_unidade_id: unidadeAtual,
        p_janela_dias: janelaDias,
      });
      if (error) throw error;
      setCandidatos((data as CandidatoPesquisa[]) || []);
    } catch (err: any) {
      toast.error('Erro ao buscar candidatos: ' + (err.message || 'Erro desconhecido'));
      setCandidatos([]);
    } finally {
      setLoading(false);
    }
  }, [unidadeAtual]);

  const enviar = useCallback(async (selecionados: CandidatoPesquisa[]) => {
    if (selecionados.length === 0) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-pesquisa-pos-primeira-aula', {
        body: {
          alunos: selecionados.map(a => ({
            aluno_id: a.aluno_id,
            unidade_id: a.unidade_id,
            whatsapp_jid: a.whatsapp_jid,
            nome: a.nome,
            data_matricula: a.data_matricula,
          })),
        },
      });
      if (error) throw error;

      const resultadosData: ResultadoEnvio[] = (data as any)?.resultados || [];
      setResultados(resultadosData);

      const enviados = resultadosData.filter(r => r.ok).length;
      const falhas = resultadosData.filter(r => !r.ok).length;
      if (enviados > 0) toast.success(`${enviados} pesquisa${enviados > 1 ? 's' : ''} enviada${enviados > 1 ? 's' : ''}`);
      if (falhas > 0) toast.error(`${falhas} envio${falhas > 1 ? 's' : ''} falhou`);

      const idsEnviados = new Set(resultadosData.filter(r => r.ok).map(r => r.aluno_id));
      setCandidatos(prev => prev.filter(c => !idsEnviados.has(c.aluno_id)));
    } catch (err: any) {
      toast.error('Erro ao enviar pesquisas: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setEnviando(false);
    }
  }, []);

  return { candidatos, loading, enviando, resultados, buscarCandidatos, enviar };
}
