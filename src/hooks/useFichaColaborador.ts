import { useCallback, useEffect, useState } from 'react';
import { invokeWithRetry, supabase } from '@/lib/supabase';
import type { FichaColaborador, FichaTokenStatus } from '@/components/App/Time/types';

interface FichaTokenResponse {
  token?: string | null;
  link?: string | null;
  ja_existia?: boolean;
  ja_respondeu?: boolean;
  gerado_em?: string | null;
}

interface UseFichaColaboradorResult {
  ficha: FichaColaborador | null;
  isLoading: boolean;
  error: Error | null;
  tokenError: Error | null;
  emitindoToken: boolean;
  emitirLink: () => Promise<void>;
  refetch: () => Promise<void>;
}

function mapearTokenStatus(data: FichaTokenResponse | null): FichaTokenStatus | null {
  if (!data) return null;
  return {
    // O token cru nunca entra no estado React; somente o link montado é usado pela UI.
    link: typeof data.link === 'string' ? data.link : null,
    ja_existia: Boolean(data.ja_existia),
    ja_respondeu: Boolean(data.ja_respondeu),
    gerado_em: data.gerado_em ? String(data.gerado_em) : null,
  };
}

export function useFichaColaborador(colaboradorId: number | null): UseFichaColaboradorResult {
  const [ficha, setFicha] = useState<FichaColaborador | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tokenError, setTokenError] = useState<Error | null>(null);
  const [emitindoToken, setEmitindoToken] = useState(false);

  const fetchData = useCallback(async () => {
    if (colaboradorId === null) {
      setFicha(null);
      setTokenError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setTokenError(null);
    try {
      // 1. Dados do colaborador + nome da unidade
      const { data: colab, error: colabErr } = await supabase
        .from('colaboradores')
        .select(`
          id, nome, apelido, foto_url, bio, cargo, tipo, situacao, departamento, whatsapp,
          unidade_id, temperamento_codinome, valorizacao_codinome, valores_codinome,
          unidades!left ( nome )
        `)
        .eq('id', colaboradorId)
        .maybeSingle();

      if (colabErr) throw colabErr;
      if (!colab) {
        setFicha(null);
        return;
      }

      const { data: tokenData, error: statusError } = await invokeWithRetry<FichaTokenResponse>(
        `ficha-emitir-token?colaborador_id=${encodeURIComponent(String(colaboradorId))}`,
        { method: 'GET' },
      );
      if (statusError) {
        setTokenError(new Error('Não foi possível consultar o estado do link da ficha.'));
      }

      const unidadeNome = Array.isArray(colab.unidades)
        ? colab.unidades[0]?.nome
        : colab.unidades?.nome ?? null;

      // 2. Dados do teste (professor_perfil_testes, contexto COLAB)
      const { data: teste } = await supabase
        .from('professor_perfil_testes')
        .select('temperamento_contagem, valorizacao_contagem, valores_primario, valores_secundario, valores_sacrificado, concluido_em')
        .eq('colaborador_id', colaboradorId)
        .eq('contexto', 'COLAB')
        .order('concluido_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Rider (colaborador_rider — versao mais recente)
      const { data: rider } = await supabase
        .from('colaborador_rider')
        .select('respostas, updated_at')
        .eq('colaborador_id', colaboradorId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setFicha({
        ...colab,
        unidade_nome: unidadeNome,
        temperamento_contagem: teste?.temperamento_contagem ?? null,
        valorizacao_contagem: teste?.valorizacao_contagem ?? null,
        valores_primario: teste?.valores_primario ?? null,
        valores_secundario: teste?.valores_secundario ?? null,
        valores_sacrificado: teste?.valores_sacrificado ?? null,
        concluido_em: teste?.concluido_em ?? null,
        rider_respostas: rider?.respostas ?? null,
        rider_updated_at: rider?.updated_at ?? null,
        ficha_token: statusError ? null : mapearTokenStatus(tokenData),
      });
    } catch (err) {
      console.error('Erro ao carregar ficha do colaborador:', err);
      setError(err as Error);
      setFicha(null);
    } finally {
      setIsLoading(false);
    }
  }, [colaboradorId]);

  const emitirLink = useCallback(async () => {
    if (colaboradorId === null) return;
    setEmitindoToken(true);
    setTokenError(null);
    try {
      const { data, error: invokeError } = await invokeWithRetry<FichaTokenResponse>(
        'ficha-emitir-token',
        { method: 'POST', body: { colaborador_id: colaboradorId } },
      );
      if (invokeError || !data) {
        throw new Error('Não foi possível gerar o link da Ficha.');
      }
      const status = mapearTokenStatus(data);
      if (!status) throw new Error('Não foi possível gerar o link da Ficha.');
      setFicha((current) => (current ? { ...current, ficha_token: status } : current));
    } catch {
      setTokenError(new Error('Não foi possível gerar o link da Ficha.'));
    } finally {
      setEmitindoToken(false);
    }
  }, [colaboradorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ficha,
    isLoading,
    error,
    tokenError,
    emitindoToken,
    emitirLink,
    refetch: fetchData,
  };
}

export default useFichaColaborador;
