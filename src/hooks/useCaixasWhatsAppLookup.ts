import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type FuncaoCaixaLookup = 'agente' | 'sistema' | 'ambos' | 'administrativo';

export interface CaixaResumo {
  id: number;
  nome: string;
  numero: string | null;
  funcao: FuncaoCaixaLookup | null;
  departamento: string | null;
  unidade_id: string | null;
}

/**
 * Mapa id -> caixa de WhatsApp, para as telas que precisam saber A QUE MÓDULO uma conversa
 * pertence (`funcao`) ou mostrar o nome da caixa.
 *
 * ⚠️ Existe porque o navegador NÃO pode mais ler `whatsapp_caixas` direto. A migration
 * `20260730180100_whatsapp_caixas_credenciais_privadas` revogou os grants e dropou as policies
 * — a tabela guarda `uazapi_token`/`waha_api_key` em texto puro, e as policies antigas eram
 * `USING (true)` sobre todas as colunas. Qualquer embed PostgREST do tipo `caixa:caixa_id(...)`
 * hoje devolve `null` (RLS sem policy nega todas as linhas) ou 403 se o GRANT for removido.
 * A leitura autorizada passa pela RPC `listar_whatsapp_caixas_seguras`, que devolve projeção
 * sem credencial (número mascarado).
 *
 * `p_incluir_globais: true` é obrigatório aqui: a caixa "Lia - Sucesso do Aluno" tem
 * `unidade_id = null` (global). Sem isso ela ficaria fora do mapa e seria tratada como
 * desconhecida — que é exatamente a caixa que precisamos identificar para escondê-la do
 * Pré-Atendimento.
 *
 * `p_unidade_id: null` serve aos dois perfis: admin recebe todas as caixas; não-admin cai no
 * ramo em que a RPC força a unidade do próprio usuário (+ as globais).
 */
export function useCaixasWhatsAppLookup() {
  const [porId, setPorId] = useState<Map<number, CaixaResumo>>(new Map());
  const [carregado, setCarregado] = useState(false);

  const fetchCaixas = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('listar_whatsapp_caixas_seguras', {
        p_unidade_id: null,
        p_incluir_globais: true,
      });
      if (error) throw error;

      const mapa = new Map<number, CaixaResumo>();
      for (const c of (data || []) as Record<string, unknown>[]) {
        mapa.set(Number(c.id), {
          id: Number(c.id),
          nome: String(c.nome ?? ''),
          numero: (c.numero_mascarado as string) ?? null,
          funcao: (c.funcao as FuncaoCaixaLookup) ?? null,
          departamento: (c.departamento as string) ?? null,
          unidade_id: (c.unidade_id as string) ?? null,
        });
      }
      setPorId(mapa);
    } catch (err) {
      // Mapa vazio. Quem consome trata caixa desconhecida como "não é do meu módulo" —
      // preferimos esconder a arriscar mostrar conversa de outro módulo.
      console.error('[useCaixasWhatsAppLookup] Falha ao carregar caixas:', err);
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    fetchCaixas();
  }, [fetchCaixas]);

  return { caixasPorId: porId, carregado, refetch: fetchCaixas };
}
