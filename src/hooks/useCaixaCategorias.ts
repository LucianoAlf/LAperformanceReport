import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CATEGORIAS_CAIXA_PADRAO,
  filtrarCategoriasCaixaPorAmbiente,
  prepararNovaCategoriaCaixa,
  type CaixaCategoria,
  type CaixaCategoriaAmbiente,
} from '@/lib/caixaCategorias';
import type { CaixaAmbiente } from '@/types/caixa';

export function useCaixaCategorias() {
  const [categorias, setCategorias] = useState<CaixaCategoria[]>(CATEGORIAS_CAIXA_PADRAO);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregarCategorias = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('caixa_categorias')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });

      if (queryError) throw queryError;
      setCategorias((data?.length ? data : CATEGORIAS_CAIXA_PADRAO) as CaixaCategoria[]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar categorias do caixa.');
      setCategorias(CATEGORIAS_CAIXA_PADRAO);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarCategorias();
  }, [carregarCategorias]);

  const criarCategoria = useCallback(async (
    nome: string,
    ambiente: CaixaCategoriaAmbiente = 'ambos',
    criadoPor?: string | null,
  ) => {
    const novaCategoria = prepararNovaCategoriaCaixa(nome, ambiente, criadoPor);
    if (novaCategoria.nome.length < 2) {
      throw new Error('Informe uma categoria com pelo menos 2 caracteres.');
    }

    setSaving(true);
    try {
      const { data, error: upsertError } = await supabase
        .from('caixa_categorias')
        .upsert(novaCategoria, { onConflict: 'slug' })
        .select('*')
        .single();

      if (upsertError) throw upsertError;

      const categoriaCriada = data as CaixaCategoria;
      setCategorias((atuais) => {
        const semDuplicata = atuais.filter((categoria) => categoria.slug !== categoriaCriada.slug);
        return [...semDuplicata, categoriaCriada].sort((a, b) => {
          if (a.ordem !== b.ordem) return a.ordem - b.ordem;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        });
      });
      return categoriaCriada;
    } finally {
      setSaving(false);
    }
  }, []);

  const categoriasPorAmbiente = useCallback(
    (ambiente: CaixaAmbiente) => filtrarCategoriasCaixaPorAmbiente(categorias, ambiente),
    [categorias],
  );

  return {
    categorias: useMemo(() => categorias, [categorias]),
    loading,
    saving,
    error,
    carregarCategorias,
    categoriasPorAmbiente,
    criarCategoria,
  };
}
