// Consulta com memória de sessão: deduplica chamadas idênticas em voo e em
// janela curta (TTL). Nasceu para os lookups transversais que TODA página
// refazia sozinha (anos de competência, config de campanhas, unidades do
// header...) — a auditoria de 08/09/2026 mediu as mesmas queries disparando
// 3–6× por carga.
//
// Só usar para leituras leves, idempotentes e pouco voláteis. Qualquer coisa
// com invalidação em tempo real (badge de conversas, por exemplo) NÃO passa
// por aqui — o canal realtime precisa ver a mudança na hora.

interface EntradaCache {
  promessa: Promise<unknown> | null;
  valor: unknown;
  expiraEm: number;
}

const memoria = new Map<string, EntradaCache>();

/**
 * Executa `operacao` no máximo 1x por janela de TTL (e nunca em paralelo para
 * a mesma chave — chamadas concorrentes dividem a mesma Promise).
 */
export function consultarComCache<T>(chave: string, ttlMs: number, operacao: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const entrada = memoria.get(chave);

  if (entrada) {
    if (entrada.promessa) return entrada.promessa as Promise<T>;
    if (agora < entrada.expiraEm) return Promise.resolve(entrada.valor as T);
  }

  const promessa = operacao()
    .then((valor) => {
      memoria.set(chave, { promessa: null, valor, expiraEm: Date.now() + ttlMs });
      return valor;
    })
    .catch((erro) => {
      memoria.delete(chave); // erro não vira cache — próxima chamada tenta de novo
      throw erro;
    });

  memoria.set(chave, { promessa, valor: undefined, expiraEm: 0 });
  return promessa;
}

/** Limpa uma chave (ex.: depois de uma edição que afeta o lookup). */
export function invalidarCache(chave: string): void {
  memoria.delete(chave);
}
