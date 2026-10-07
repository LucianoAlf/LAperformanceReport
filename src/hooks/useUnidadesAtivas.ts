import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { UnidadeBasica } from '@/mobile/unidadeLabel';

interface Retorno {
  unidades: UnidadeBasica[];
  carregando: boolean;
  /** Mensagem do banco quando a carga falha — nunca `null` silencioso. */
  erro: string | null;
}

/**
 * As unidades ativas da rede, para o seletor de quem e admin.
 *
 * Existe porque o vinculo RBAC do admin e global (`unidade_id NULL`) e
 * `unidadesPermitidas` vem VAZIA para ele: a lista dele nao sai do contexto de
 * autenticacao, sai do banco.
 *
 * ⚠️ `habilitado` evita a consulta para quem nao e admin — nao e otimizacao, e
 * escopo: nao-admin nao escolhe entre unidades da rede, escolhe entre as dele.
 *
 * ⚠️ O `error` do cliente Supabase E CHECADO. A mesma consulta no `AppHeader`
 * do desktop faz `if (data) setUnidades(data)` e descarta o erro — ali uma
 * falha deixa o admin com o seletor vazio e sem nenhuma pista do motivo.
 */
export function useUnidadesAtivas(habilitado: boolean): Retorno {
  const [unidades, setUnidades] = useState<UnidadeBasica[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!habilitado) return undefined;
    let vivo = true;
    setCarregando(true);

    supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (!vivo) return;
        setCarregando(false);
        if (error) {
          console.error('[useUnidadesAtivas] falha ao listar unidades ativas:', error.message);
          setErro(error.message);
          return;
        }
        setErro(null);
        setUnidades(data ?? []);
      });

    return () => {
      vivo = false;
    };
  }, [habilitado]);

  return { unidades, carregando, erro };
}

export default useUnidadesAtivas;
