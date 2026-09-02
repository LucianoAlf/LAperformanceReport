import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface AutomacaoItem {
  slug: string;
  nome: string;
  descricao: string;
  gatilho: 'manual' | 'automatico';
  editavel: boolean;
  /**
   * Slug em `automacoes_config` que liga/desliga a automação. Quando presente,
   * o card ganha um switch — é o caminho para parar o robô sem deploy e sem
   * depender de quem escreveu o código.
   */
  killSwitchSlug?: string;
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
  {
    slug: 'agradecimento_evasao',
    nome: 'Agradecimento pós-resposta da evasão',
    descricao:
      'Responde "obrigada" a quem respondeu à pesquisa de evasão. Um classificador de IA lê o texto e só libera quando é resposta de verdade, com confiança alta, sem pergunta e sem pedido de atendimento. Teto de 3 por dia; log de cada envio (e de cada recusa) no tópico Logs do Lia Core.',
    gatilho: 'automatico',
    editavel: false,
    killSwitchSlug: 'auto_agradecimento_evasao',
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

  // --- Kill switches (tabela automacoes_config) ------------------------------
  // Estado por slug, não um booleano solto: o catálogo pode ter mais de uma
  // automação com switch, e um estado único faria uma sobrescrever a outra.
  const [switches, setSwitches] = useState<Record<string, boolean>>({});
  const [loadingSwitch, setLoadingSwitch] = useState(false);

  const carregarSwitches = useCallback(async () => {
    const slugs = AUTOMACOES_SUCESSO_ALUNO
      .map((a) => a.killSwitchSlug)
      .filter((s): s is string => Boolean(s));
    if (slugs.length === 0) return;
    setLoadingSwitch(true);
    try {
      const { data, error } = await supabase
        .from('automacoes_config').select('slug, ativo').in('slug', slugs);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const linha of data || []) map[linha.slug] = linha.ativo === true;
      setSwitches(map);
    } catch (err) {
      // Falha aqui não pode virar switch "ligado" na tela: o padrão do estado é
      // false, então uma leitura quebrada mostra desligado — o lado seguro.
      console.error('[useAutomacoesSucessoAluno] carregarSwitches:', err);
      toast.error('Erro ao carregar o estado das automações');
    } finally {
      setLoadingSwitch(false);
    }
  }, []);

  useEffect(() => { carregarSwitches(); }, [carregarSwitches]);

  const alternarSwitch = useCallback(async (slug: string, novo: boolean): Promise<boolean> => {
    const anterior = switches[slug] === true;
    setSwitches((prev) => ({ ...prev, [slug]: novo })); // otimista
    try {
      const { error } = await supabase
        .from('automacoes_config')
        .update({ ativo: novo, updated_at: new Date().toISOString() })
        .eq('slug', slug);
      if (error) throw error;
      toast.success(novo ? 'Automação ligada' : 'Automação desligada');
      return true;
    } catch (err) {
      console.error('[useAutomacoesSucessoAluno] alternarSwitch:', err);
      setSwitches((prev) => ({ ...prev, [slug]: anterior })); // rollback
      toast.error('Erro ao alterar a automação');
      return false;
    }
  }, [switches]);

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
    switches,
    loadingSwitch,
    alternarSwitch,
    // Aliases de compatibilidade (carrossel).
    textoCarrossel: textos['boas_vindas_equipe'] || '',
    salvarTextoCarrossel: (novo: string) => salvarTexto('boas_vindas_equipe', novo),
  };
}
