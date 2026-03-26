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

  // Dados para gráficos
  const dadosSobrevivencia = useMemo(() => {
    if (registros.length === 0) return [];
    const total = registros.length;
    const maxMes = Math.min(Math.max(...registros.map(r => r.tempo_permanencia_meses)), 72);
    const dados: Array<{ name: string; percentual: number }> = [];
    const mesesChave = [1, 2, 3, 4, 5, 6, 9, 12, 15, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72];
    for (const m of mesesChave) {
      if (m > maxMes) break;
      const sobreviveram = registros.filter(r => r.tempo_permanencia_meses >= m).length;
      dados.push({ name: `${m}m`, percentual: Math.round((sobreviveram / total) * 1000) / 10 });
    }
    return dados;
  }, [registros]);

  const dadosHistograma = useMemo(() => {
    const faixas = [
      { label: '4-6m', min: 4, max: 6, cor: '#f59e0b' },
      { label: '7-12m', min: 7, max: 12, cor: '#eab308' },
      { label: '13-18m', min: 13, max: 18, cor: '#84cc16' },
      { label: '19-24m', min: 19, max: 24, cor: '#22c55e' },
      { label: '25-36m', min: 25, max: 36, cor: '#14b8a6' },
      { label: '37-48m', min: 37, max: 48, cor: '#06b6d4' },
      { label: '49+', min: 49, max: 9999, cor: '#10b981' },
    ];
    return faixas.map(f => ({
      name: f.label,
      quantidade: registros.filter(r => r.tempo_permanencia_meses >= f.min && r.tempo_permanencia_meses <= f.max).length,
      cor: f.cor,
    }));
  }, [registros]);

  const dadosEvolucao = useMemo(() => {
    if (registros.length === 0) return [];
    // Agrupar por mes_saida, calcular média
    const grupos: Record<string, { soma: number; qtd: number }> = {};
    registros.forEach(r => {
      const chave = r.mes_saida || 'Sem data';
      if (chave === 'Sem data') return;
      if (!grupos[chave]) grupos[chave] = { soma: 0, qtd: 0 };
      grupos[chave].soma += r.tempo_permanencia_meses;
      grupos[chave].qtd += 1;
    });
    // Converter para array e ordenar
    const mesesPt: Record<string, number> = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4, 'maio': 5, 'junho': 6,
      'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
    };
    return Object.entries(grupos)
      .map(([mes, { soma, qtd }]) => ({
        name: mes,
        media: Math.round((soma / qtd) * 10) / 10,
        quantidade: qtd,
      }))
      .sort((a, b) => {
        // Tentar parsear "Mês/Ano" ou "Mês de Ano" ou "Mês Ano"
        const parseDate = (s: string) => {
          const parts = s.toLowerCase().replace(' de ', '/').replace(' ', '/').split('/');
          const mesNum = mesesPt[parts[0]] || 0;
          const ano = parseInt(parts[parts.length - 1]) || 0;
          return ano * 100 + mesNum;
        };
        return parseDate(a.name) - parseDate(b.name);
      })
      .slice(-24); // últimos 24 meses
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
    dadosSobrevivencia,
    dadosHistograma,
    dadosEvolucao,
  };
}
