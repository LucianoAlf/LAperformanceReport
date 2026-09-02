// Ordem de exibicao das fontes: da mais externa (quem de fato usa o sistema)
// para a mais interna. Tambem serve de ordenacao estavel na saida do gerador,
// que varre diretorios e nao pode depender da ordem que o sistema de arquivos
// devolveu.
export const ORDEM_FONTES = ['front', 'edge', 'cron', 'trigger', 'view', 'funcao'];

// Fronteira de identificador: o caractere antes e depois do nome nao pode fazer
// parte de um identificador SQL/JS. Sem isso 'get_kpis' casaria dentro de
// 'get_kpis_v2', e toda funcao aposentada pareceria viva.
function ocorre(texto, nome) {
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escapado}([^A-Za-z0-9_]|$)`).test(texto);
}

export function mapearConsumidores({ nomes, fontes }) {
  const mapa = new Map(nomes.map((nome) => [nome, []]));
  for (const nome of nomes) {
    const vistos = new Set();
    const achados = [];
    for (const { fonte, origem, texto } of fontes) {
      // Funcao que menciona o proprio nome (recursao, RAISE) nao e consumidora.
      if (fonte === 'funcao' && origem === nome) continue;
      const chave = `${fonte}:${origem}`;
      if (vistos.has(chave)) continue;
      if (!ocorre(texto, nome)) continue;
      vistos.add(chave);
      achados.push({ fonte, origem });
    }
    achados.sort((a, b) =>
      ORDEM_FONTES.indexOf(a.fonte) - ORDEM_FONTES.indexOf(b.fonte)
      || a.origem.localeCompare(b.origem, 'pt-BR'));
    mapa.set(nome, achados);
  }
  return mapa;
}
