import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface AutomacaoItem {
  slug: string;
  nome: string;
  descricao: string;
  gatilho: 'manual' | 'automatico';
  editavel: boolean;
}

// Catálogo das automações do módulo Sucesso do Aluno (Fase 1).
export const AUTOMACOES_SUCESSO_ALUNO: AutomacaoItem[] = [
  {
    slug: 'boas_vindas_equipe',
    nome: 'Boas-vindas da Equipe (carrossel)',
    descricao: 'Carrossel com a equipe da unidade + card da comunidade. Disparo manual de teste.',
    gatilho: 'manual',
    editavel: true,
  },
  {
    slug: 'boas_vindas_matricula',
    nome: 'Boas-vindas de Matrícula',
    descricao: 'Vídeo do professor (ou texto) ao confirmar matrícula nova. Automático, texto no código.',
    gatilho: 'automatico',
    editavel: false,
  },
  {
    slug: 'pesquisa_1a_aula',
    nome: 'Pesquisa pós-1ª aula',
    descricao: 'Pesquisa de satisfação (botões de estrela) após a primeira aula. Dois textos: quando falamos com o próprio aluno e quando falamos com o responsável.',
    gatilho: 'manual',
    editavel: true,
  },
];

// Slugs dos textos editáveis em crm_templates_whatsapp.
const SLUGS_TEXTO = ['boas_vindas_equipe', 'pesquisa_1a_aula_direta', 'pesquisa_1a_aula_responsavel'];

export function useAutomacoesSucessoAluno() {
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [loadingTexto, setLoadingTexto] = useState(false);

  const carregarTextos = useCallback(async () => {
    setLoadingTexto(true);
    try {
      const { data, error } = await supabase
        .from('crm_templates_whatsapp')
        .select('slug, conteudo')
        .in('slug', SLUGS_TEXTO);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const t of data || []) map[t.slug] = t.conteudo || '';
      setTextos(map);
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] carregarTextos:', err);
      toast.error('Erro ao carregar os textos das automações');
    } finally {
      setLoadingTexto(false);
    }
  }, []);

  useEffect(() => { carregarTextos(); }, [carregarTextos]);

  const salvarTexto = useCallback(async (slug: string, novo: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('crm_templates_whatsapp')
        .update({ conteudo: novo }).eq('slug', slug);
      if (error) throw error;
      setTextos((prev) => ({ ...prev, [slug]: novo }));
      toast.success('Texto salvo');
      return true;
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] salvarTexto:', err);
      toast.error('Erro ao salvar o texto');
      return false;
    }
  }, []);

  const dispararTeste = useCallback(async (
    unidadeId: string,
    numero: string,
    exemplo?: { responsavel?: string; aluno?: string; curso?: string },
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('enviar-boas-vindas-equipe', {
        body: { unidadeId, numeroDestino: numero, ...exemplo },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || 'Falha no envio');
      toast.success('Boas-vindas disparadas');
      return true;
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] dispararTeste:', err);
      toast.error(`Erro ao disparar: ${err instanceof Error ? err.message : 'desconhecido'}`);
      return false;
    }
  }, []);

  return {
    automacoes: AUTOMACOES_SUCESSO_ALUNO,
    textos,
    loadingTexto,
    carregarTextos,
    salvarTexto,
    dispararTeste,
    // Aliases de compatibilidade (carrossel).
    textoCarrossel: textos['boas_vindas_equipe'] || '',
    salvarTextoCarrossel: (novo: string) => salvarTexto('boas_vindas_equipe', novo),
  };
}
