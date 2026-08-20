import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Base de conhecimento da LA Music — blocos consumidos pelos agentes SDR Mila
 * (via edge `base-conhecimento`) e editados na subaba Conhecimento.
 *
 * ⚠️ O texto entregue à Mila NÃO é montado aqui. O preview ("Ver como a Mila
 *    vê") chama a RPC `get_base_conhecimento`, a mesma que a edge chama — se a
 *    concatenação fosse reimplementada em TS, o preview poderia divergir do que
 *    a Mila recebe.
 */
export interface BlocoConhecimento {
  id: string;
  titulo: string;
  conteudo: string;
  /** NULL = global (vale para todas as unidades) */
  unidade_id: string | null;
  ordem: number;
  ativo: boolean;
  updated_at: string;
}

export type BlocoRascunho = Pick<
  BlocoConhecimento,
  'titulo' | 'conteudo' | 'unidade_id' | 'ativo'
>;

export function useBaseConhecimento() {
  const [blocos, setBlocos] = useState<BlocoConhecimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('base_conhecimento_blocos')
        .select('id, titulo, conteudo, unidade_id, ordem, ativo, updated_at')
        .order('ordem')
        .order('titulo');

      if (error) throw error;
      setBlocos((data || []) as BlocoConhecimento[]);
    } catch (err) {
      console.error('Erro ao carregar base de conhecimento:', err);
      toast.error('Erro ao carregar a base de conhecimento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(async (rascunho: BlocoRascunho) => {
    setSalvando(true);
    try {
      const { data: sessao } = await supabase.auth.getUser();
      // Vai para o fim da lista: última ordem + 10 (o passo de 10 deixa espaço
      // para intercalar sem renumerar tudo).
      const proximaOrdem = blocos.length
        ? Math.max(...blocos.map(b => b.ordem)) + 10
        : 10;

      const { error } = await supabase.from('base_conhecimento_blocos').insert({
        ...rascunho,
        ordem: proximaOrdem,
        atualizado_por: sessao?.user?.id ?? null,
      });
      if (error) throw error;

      toast.success('Bloco criado');
      await carregar();
      return true;
    } catch (err) {
      console.error('Erro ao criar bloco:', err);
      toast.error('Erro ao criar o bloco');
      return false;
    } finally {
      setSalvando(false);
    }
  }, [blocos, carregar]);

  const atualizar = useCallback(async (id: string, patch: Partial<BlocoRascunho>) => {
    setSalvando(true);
    try {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('base_conhecimento_blocos')
        .update({ ...patch, atualizado_por: sessao?.user?.id ?? null })
        .eq('id', id);
      if (error) throw error;

      toast.success('Bloco salvo');
      await carregar();
      return true;
    } catch (err) {
      console.error('Erro ao salvar bloco:', err);
      toast.error('Erro ao salvar o bloco');
      return false;
    } finally {
      setSalvando(false);
    }
  }, [carregar]);

  /** Liga/desliga sem recarregar a lista inteira — o toggle precisa ser instantâneo. */
  const alternarAtivo = useCallback(async (bloco: BlocoConhecimento) => {
    const novoAtivo = !bloco.ativo;
    setBlocos(prev => prev.map(b => (b.id === bloco.id ? { ...b, ativo: novoAtivo } : b)));

    const { error } = await supabase
      .from('base_conhecimento_blocos')
      .update({ ativo: novoAtivo })
      .eq('id', bloco.id);

    if (error) {
      console.error('Erro ao alternar bloco:', error);
      toast.error('Erro ao atualizar o bloco');
      setBlocos(prev => prev.map(b => (b.id === bloco.id ? { ...b, ativo: bloco.ativo } : b)));
      return;
    }
    toast.success(`"${bloco.titulo}" ${novoAtivo ? 'ativado' : 'desativado'}`);
  }, []);

  const remover = useCallback(async (bloco: BlocoConhecimento) => {
    try {
      const { error } = await supabase
        .from('base_conhecimento_blocos')
        .delete()
        .eq('id', bloco.id);
      if (error) throw error;

      toast.success(`"${bloco.titulo}" removido`);
      await carregar();
    } catch (err) {
      console.error('Erro ao remover bloco:', err);
      toast.error('Erro ao remover o bloco');
    }
  }, [carregar]);

  /** Troca a posição do bloco com o vizinho, trocando os valores de `ordem`. */
  const mover = useCallback(async (bloco: BlocoConhecimento, direcao: 'cima' | 'baixo') => {
    const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));
    const indice = ordenados.findIndex(b => b.id === bloco.id);
    const alvo = direcao === 'cima' ? ordenados[indice - 1] : ordenados[indice + 1];
    if (!alvo) return;

    setBlocos(prev =>
      prev.map(b => {
        if (b.id === bloco.id) return { ...b, ordem: alvo.ordem };
        if (b.id === alvo.id) return { ...b, ordem: bloco.ordem };
        return b;
      })
    );

    const [r1, r2] = await Promise.all([
      supabase.from('base_conhecimento_blocos').update({ ordem: alvo.ordem }).eq('id', bloco.id),
      supabase.from('base_conhecimento_blocos').update({ ordem: bloco.ordem }).eq('id', alvo.id),
    ]);

    if (r1.error || r2.error) {
      console.error('Erro ao reordenar:', r1.error || r2.error);
      toast.error('Erro ao reordenar');
      await carregar();
    }
  }, [blocos, carregar]);

  /**
   * Texto exato que a Mila recebe. Vem da RPC — mesma fonte da edge.
   * `p_unidade_id = null` devolve só os blocos globais.
   */
  const previewDaMila = useCallback(async (unidadeId: string | null): Promise<string> => {
    const { data, error } = await supabase.rpc('get_base_conhecimento', {
      p_unidade_id: unidadeId,
    });
    if (error) {
      console.error('Erro ao gerar preview:', error);
      toast.error('Erro ao gerar o preview');
      return '';
    }
    return (data as string) ?? '';
  }, []);

  return {
    blocos,
    loading,
    salvando,
    carregar,
    criar,
    atualizar,
    alternarAtivo,
    remover,
    mover,
    previewDaMila,
  };
}
