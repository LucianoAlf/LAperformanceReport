import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { toast } from 'sonner';

export interface RegistroLTV {
  id: number;
  passagem_id: string;
  historico_id: number | null;
  nome: string;
  tempo_permanencia_meses: number;
  categoria_saida: string;
  mes_saida: string | null;
  motivo_saida: string | null;
  unidade_id: string | null;
  aluno_id: number | null;
  data_entrada: string | null;
  data_saida: string | null;
  aluno_ids: number[];
  qtd_passagens_pessoa: number;
  fonte: 'historico' | 'sistema';
  anulado: boolean;
}

interface KPIsLTV {
  totalExAlunos: number;
  tempoMedio: number;
  totalHistorico: number;
  totalSistema: number;
  taxaRetorno: number;
  porCategoria: Record<string, number>;
}

export function useHistoricoLTV(unidadeId: UnidadeId) {
  const [registros, setRegistros] = useState<RegistroLTV[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_historico_ltv', {
        p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
      });
      if (error) throw error;

      const mapped: RegistroLTV[] = (data || []).map((r: any) => ({
        id: r.historico_id ?? -Math.abs(r.aluno_ids?.[0] ?? 0),
        passagem_id: r.passagem_id,
        historico_id: r.historico_id,
        nome: r.nome,
        tempo_permanencia_meses: Number(r.tempo_meses),
        categoria_saida: r.categoria_saida || 'Interrompido',
        mes_saida: r.mes_saida || null,
        motivo_saida: r.motivo_saida || null,
        unidade_id: r.unidade_id,
        aluno_id: r.aluno_ids?.[0] ?? null,
        data_entrada: r.data_entrada,
        data_saida: r.data_saida,
        aluno_ids: r.aluno_ids || [],
        qtd_passagens_pessoa: Number(r.qtd_passagens_pessoa || 1),
        fonte: r.fonte,
        anulado: !!r.anulado,
      }));

      setRegistros(mapped);
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

    const pessoaPassagens = new Map<string, number>();
    registros.forEach(r => {
      const chave = `${r.nome}|${r.unidade_id}`;
      pessoaPassagens.set(chave, (pessoaPassagens.get(chave) || 0) + 1);
    });
    const totalPessoas = pessoaPassagens.size;
    const pessoasComRetorno = Array.from(pessoaPassagens.values()).filter(c => c >= 2).length;
    const taxaRetorno = totalPessoas > 0 ? (pessoasComRetorno / totalPessoas) * 100 : 0;

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
      taxaRetorno,
      porCategoria,
    };
  }, [registros]);

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
    const grupos: Record<string, { soma: number; qtd: number }> = {};
    registros.forEach(r => {
      const chave = r.mes_saida || 'Sem data';
      if (chave === 'Sem data') return;
      if (!grupos[chave]) grupos[chave] = { soma: 0, qtd: 0 };
      grupos[chave].soma += r.tempo_permanencia_meses;
      grupos[chave].qtd += 1;
    });
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
        const parseDate = (s: string) => {
          const parts = s.toLowerCase().replace(' de ', '/').replace(' ', '/').split('/');
          const mesNum = mesesPt[parts[0]] || 0;
          const ano = parseInt(parts[parts.length - 1]) || 0;
          return ano * 100 + mesNum;
        };
        return parseDate(a.name) - parseDate(b.name);
      })
      .slice(-24);
  }, [registros]);

  const atualizarRegistro = useCallback(async (id: number, campo: string, valor: string | number | null) => {
    if (id <= 0) {
      toast.error('Esta passagem ainda não foi consolidada — edite a matrícula original.');
      return;
    }

    setRegistros(prev => prev.map(r =>
      r.id === id ? { ...r, [campo]: valor } : r
    ));

    const { error } = await supabase
      .from('alunos_historico')
      .update({ [campo]: valor, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar registro');
      carregarDados();
      return;
    }
    toast.success('Registro atualizado');
  }, [carregarDados]);

  const excluirRegistro = useCallback(async (id: number) => {
    if (id <= 0) {
      toast.error('Esta passagem ainda não foi consolidada — não é possível excluir.');
      return;
    }

    setRegistros(prev => prev.filter(r => r.id !== id));

    const { error } = await supabase
      .from('alunos_historico')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir registro');
      carregarDados();
      return;
    }
    toast.success('Registro excluído');
  }, [carregarDados]);

  const anularPassagem = useCallback(async (
    historicoId: number,
    motivo: string,
    anuladoPor: string,
  ) => {
    if (!historicoId || historicoId <= 0) {
      toast.error('Esta passagem ainda não foi consolidada — não é possível anular.');
      return false;
    }

    const { error } = await supabase
      .from('alunos_historico')
      .update({
        anulado: true,
        motivo_anulacao: motivo,
        anulado_por: anuladoPor,
        anulado_em: new Date().toISOString(),
      })
      .eq('id', historicoId);

    if (error) {
      toast.error('Erro ao anular passagem');
      return false;
    }
    toast.success('Passagem anulada');
    carregarDados();
    return true;
  }, [carregarDados]);

  const reverterAnulacao = useCallback(async (historicoId: number) => {
    const { error } = await supabase
      .from('alunos_historico')
      .update({
        anulado: false,
        motivo_anulacao: null,
        anulado_por: null,
        anulado_em: null,
      })
      .eq('id', historicoId);

    if (error) {
      toast.error('Erro ao reverter anulação');
      return false;
    }
    toast.success('Anulação revertida');
    carregarDados();
    return true;
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
    anularPassagem,
    reverterAnulacao,
    adicionarRegistro,
    dadosSobrevivencia,
    dadosHistograma,
    dadosEvolucao,
  };
}
