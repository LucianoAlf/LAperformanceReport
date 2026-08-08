/**
 * Keeps a non-critical query from aborting a screen that already has its
 * contractual data. The failure remains observable for the caller to label.
 */
export async function consultarOpcional(consulta) {
  try {
    return { data: await consulta, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Adapts a Supabase/PostgREST response to the same safe result shape.
 * Network rejections and RPC errors are both treated as unavailable data.
 */
export async function consultarSupabaseOpcional(consulta) {
  const resultado = await consultarOpcional(consulta);
  if (resultado.error) return resultado;

  const resposta = resultado.data;
  if (!resposta || typeof resposta !== 'object') {
    return { data: null, error: new Error('Resposta Supabase vazia') };
  }

  return {
    data: resposta.error ? null : (resposta.data ?? null),
    error: resposta.error ?? null,
  };
}

