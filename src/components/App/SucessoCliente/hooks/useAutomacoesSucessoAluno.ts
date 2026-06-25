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
    descricao: 'Pesquisa de satisfação com botões após a primeira aula. Texto no código.',
    gatilho: 'manual',
    editavel: false,
  },
];

export function useAutomacoesSucessoAluno() {
  const [textoCarrossel, setTextoCarrossel] = useState('');
  const [loadingTexto, setLoadingTexto] = useState(false);

  const carregarTexto = useCallback(async () => {
    setLoadingTexto(true);
    try {
      const { data, error } = await supabase
        .from('crm_templates_whatsapp')
        .select('conteudo').eq('slug', 'boas_vindas_equipe').maybeSingle();
      if (error) throw error;
      setTextoCarrossel(data?.conteudo || '');
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] carregarTexto:', err);
      toast.error('Erro ao carregar o texto da automação');
    } finally {
      setLoadingTexto(false);
    }
  }, []);

  useEffect(() => { carregarTexto(); }, [carregarTexto]);

  const salvarTextoCarrossel = useCallback(async (novo: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('crm_templates_whatsapp')
        .update({ conteudo: novo }).eq('slug', 'boas_vindas_equipe');
      if (error) throw error;
      setTextoCarrossel(novo);
      toast.success('Texto salvo');
      return true;
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] salvar:', err);
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

  return { automacoes: AUTOMACOES_SUCESSO_ALUNO, textoCarrossel, loadingTexto, carregarTexto, salvarTextoCarrossel, dispararTeste };
}
