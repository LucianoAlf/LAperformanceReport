import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { toast } from 'sonner';

export interface RegistroLTV {
  id: number;
  nome: string;
  tempo_permanencia_meses: number;
  categoria_saida: string;
  mes_saida: string | null;
  unidade_id: string | null;
  aluno_id: number | null;
  fonte: 'historico' | 'sistema';
}

interface KPIsLTV {
  totalExAlunos: number;
  tempoMedio: number;
  totalHistorico: number;
  totalSistema: number;
  porCategoria: Record<string, number>;
}

export function useHistoricoLTV(unidadeId: UnidadeId) {
  const [registros, setRegistros] = useState<RegistroLTV[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      // Fonte 1: alunos_historico
      let qHistorico = supabase
        .from('alunos_historico')
        .select('id, nome, tempo_permanencia_meses, categoria_saida, mes_saida, unidade_id, aluno_id')
        .gte('tempo_permanencia_meses', 4);
      if (unidadeId && unidadeId !== 'todos') {
        qHistorico = qHistorico.eq('unidade_id', unidadeId);
      }
      const { data: historico, error: errHist } = await qHistorico;
      if (errHist) throw errHist;

      // Fonte 2: alunos inativos/evadidos
      let qSistema = supabase
        .from('alunos')
        .select('id, nome, tempo_permanencia_meses, status, data_saida, unidade_id, tipo_matricula_id, is_segundo_curso')
        .in('status', ['inativo', 'evadido'])
        .gte('tempo_permanencia_meses', 4);
      if (unidadeId && unidadeId !== 'todos') {
        qSistema = qSistema.eq('unidade_id', unidadeId);
      }
      const { data: sistema, error: errSis } = await qSistema;
      if (errSis) throw errSis;

      // Buscar tipos_matricula para excluir bolsistas/banda
      const { data: tiposExcluir } = await supabase
        .from('tipos_matricula')
        .select('id, codigo')
        .in('codigo', ['BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA']);
      const idsExcluir = new Set((tiposExcluir || []).map(t => t.id));

      // Mapear historico
      const rowsHistorico: RegistroLTV[] = (historico || []).map(h => ({
        id: h.id,
        nome: h.nome,
        tempo_permanencia_meses: h.tempo_permanencia_meses,
        categoria_saida: h.categoria_saida || 'Interrompido',
        mes_saida: h.mes_saida || null,
        unidade_id: h.unidade_id,
        aluno_id: h.aluno_id || null,
        fonte: 'historico' as const,
      }));

      // Mapear sistema (excluir bolsistas/banda/segundo curso)
      const rowsSistema: RegistroLTV[] = (sistema || [])
        .filter(a => !idsExcluir.has(a.tipo_matricula_id) && !a.is_segundo_curso)
        .map(a => ({
          id: -a.id, // id negativo para distinguir
          nome: a.nome,
          tempo_permanencia_meses: a.tempo_permanencia_meses,
          categoria_saida: a.status === 'evadido' ? 'Evadido' : 'Interrompido',
          mes_saida: a.data_saida
            ? new Date(a.data_saida + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            : null,
          unidade_id: a.unidade_id,
          aluno_id: a.id,
          fonte: 'sistema' as const,
        }));

      setRegistros([...rowsHistorico, ...rowsSistema]);
    } catch (err) {
      console.error('Erro ao carregar histórico LTV:', err);
      toast.error('Erro ao carregar dados do histórico');
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const kpis = useMemo<KPIsLTV>(() => {
    const totalHistorico = registros.filter(r => r.fonte === 'historico').length;
    const totalSistema = registros.filter(r => r.fonte === 'sistema').length;
    const soma = registros.reduce((acc, r) => acc + r.tempo_permanencia_meses, 0);

    const porCategoria: Record<string, number> = {};
    registros.forEach(r => {
      const cat = r.categoria_saida || 'Sem categoria';
      porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    });

    return {
      totalExAlunos: registros.length,
      tempoMedio: registros.length > 0 ? soma / registros.length : 0,
      totalHistorico,
      totalSistema,
      porCategoria,
    };
  }, [registros]);

  const atualizarRegistro = useCallback(async (id: number, campo: string, valor: string | number | null) => {
    // Optimistic update
    setRegistros(prev => prev.map(r =>
      r.id === id ? { ...r, [campo]: valor } : r
    ));

    const { error } = await supabase
      .from('alunos_historico')
      .update({ [campo]: valor, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar registro');
      carregarDados(); // rollback
      return;
    }
    toast.success('Registro atualizado');
  }, [carregarDados]);

  const excluirRegistro = useCallback(async (id: number) => {
    setRegistros(prev => prev.filter(r => r.id !== id));

    const { error } = await supabase
      .from('alunos_historico')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir registro');
      carregarDados(); // rollback
      return;
    }
    toast.success('Registro excluído');
  }, [carregarDados]);

  const adicionarRegistro = useCallback(async (dados: {
    nome: string;
    tempo_permanencia_meses: number;
    categoria_saida: string;
    mes_saida: string | null;
    unidade_id: string | null;
  }) => {
    const { error } = await supabase
      .from('alunos_historico')
      .insert(dados);

    if (error) {
      toast.error('Erro ao adicionar registro');
      return;
    }
    toast.success('Registro adicionado');
    carregarDados();
  }, [carregarDados]);

  return {
    registros,
    loading,
    kpis,
    recarregar: carregarDados,
    atualizarRegistro,
    excluirRegistro,
    adicionarRegistro,
  };
}
