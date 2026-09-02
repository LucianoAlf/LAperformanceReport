import fs from 'node:fs';
import path from 'node:path';

export const CABECALHO_AVISO = 'GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.';

const SEPARADOR = '\n<!-- fim do cabecalho gerado -->\n';

function cabecalho({ ref, data }) {
  return `<!-- ${CABECALHO_AVISO}\n     Banco: ${ref} · Gerado em: ${data} -->\n`;
}

// A data no cabecalho deixaria todo arquivo sujo a cada execucao. Comparando so
// o corpo, arquivo sem mudanca conserva a data da ultima alteracao real — que e
// a informacao util: quando o banco mudou, nao quando alguem rodou o script.
export function escreverSeMudou(caminho, corpo, meta) {
  if (fs.existsSync(caminho)) {
    const atual = fs.readFileSync(caminho, 'utf8');
    const corpoAtual = atual.split(SEPARADOR).slice(1).join(SEPARADOR);
    if (corpoAtual === corpo) return false;
  }
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, cabecalho(meta) + SEPARADOR + corpo, 'utf8');
  return true;
}

// COMMENT do banco entra em celula de tabela; um pipe solto quebraria a coluna.
function celula(texto) {
  return String(texto ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ').trim();
}

function ordenar(itens) {
  return [...itens].sort((a, b) =>
    a.dominio.localeCompare(b.dominio, 'pt-BR')
    || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function formatarTabelas(dados) {
  const linhas = [
    '# Tabelas e views',
    '',
    `${dados.tabelas.length} objetos. Uma linha cada; colunas e FKs em \`detalhe/<dominio>.md\`.`,
    '',
    '| Objeto | Tipo | Domínio | Colunas | Linhas | RLS | FKs | Comentário |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const tabela of ordenar(dados.tabelas)) {
    const rls = tabela.rls ? `sim (${tabela.policies})` : 'não';
    const linhasTexto = tabela.linhas === null || tabela.linhas === undefined
      ? '—'
      : String(tabela.linhas);
    linhas.push(
      `| \`${tabela.nome}\` | ${tabela.tipo} | ${tabela.dominio} | ${tabela.colunas} `
      + `| ${linhasTexto} | ${rls} | ${tabela.fks} | ${celula(tabela.comentario)} |`,
    );
  }
  return `${linhas.join('\n')}\n`;
}

// Funcao muito reusada (is_admin tem 30 consumidores) deixaria a linha com 2 mil
// caracteres e a tabela ilegivel. O que a leitura precisa e do estado e de uma
// amostra de quem chama; a contagem preserva a nocao de alcance.
const MAX_CONSUMIDORES_LISTADOS = 6;

function resumirConsumidores(consumidores) {
  if (consumidores.length <= MAX_CONSUMIDORES_LISTADOS) {
    return consumidores.map((c) => `${c.fonte}:${c.origem}`).join(', ');
  }
  const mostrados = consumidores.slice(0, MAX_CONSUMIDORES_LISTADOS);
  const restante = consumidores.length - mostrados.length;
  return `${mostrados.map((c) => `${c.fonte}:${c.origem}`).join(', ')}, +${restante} outros`;
}

export function formatarFuncoes(dados) {
  const linhas = [
    '# Funções',
    '',
    `${dados.funcoes.length} funções. \`ORFA\` é **sinal, não veredito**: n8n, scripts da VPS e`,
    'chamadas diretas ao PostgREST não são visíveis para o gerador.',
    '',
  ];
  const porDominio = new Map();
  for (const funcao of ordenar(dados.funcoes)) {
    if (!porDominio.has(funcao.dominio)) porDominio.set(funcao.dominio, []);
    porDominio.get(funcao.dominio).push(funcao);
  }
  for (const [dominio, funcoes] of porDominio) {
    linhas.push(
      `## ${dominio}`,
      '',
      '| Função | Estado | Segurança | Consumidores |',
      '|---|---|---|---|',
    );
    for (const funcao of funcoes) {
      const seguranca = [
        funcao.secdef ? 'DEFINER' : 'INVOKER',
        funcao.anon ? '🔓 anon' : '',
      ].filter(Boolean).join(' · ');
      const consumidores = funcao.consumidores.length
        ? resumirConsumidores(funcao.consumidores)
        : [funcao.motivo, 'sem consumidor conhecido'].filter(Boolean).join(' — ');
      linhas.push(
        `| \`${funcao.nome}(${celula(funcao.args)})\` | ${funcao.estado} `
        + `| ${seguranca} | ${celula(consumidores)} |`,
      );
    }
    linhas.push('');
  }
  return `${linhas.join('\n')}\n`;
}

export function formatarDetalhe(dominio, dados) {
  const doDominio = ordenar(dados.tabelas).filter((tabela) => tabela.dominio === dominio);
  const linhas = [
    `# Detalhe do banco — ${dominio}`,
    '',
    `${doDominio.length} objetos. Resumo de todos os domínios em \`../TABELAS.gerado.md\`.`,
    '',
  ];
  for (const tabela of doDominio) {
    linhas.push(`## ${tabela.nome}`, '');
    if (tabela.comentario) linhas.push(`> ${celula(tabela.comentario)}`, '');
    linhas.push('| Coluna | Tipo | Nulo | Default | Referência |', '|---|---|---|---|---|');
    for (const coluna of tabela.detalheColunas) {
      linhas.push(
        `| \`${coluna.nome}\` | ${celula(coluna.tipo)} | ${coluna.nulo ? 'sim' : 'não'} `
        + `| ${celula(coluna.padrao)} | ${celula(coluna.referencia)} |`,
      );
    }
    linhas.push('');
    if (tabela.indicesUnicos.length) linhas.push(`**Únicos:** ${tabela.indicesUnicos.join(', ')}`, '');
    if (tabela.triggers.length) linhas.push(`**Triggers:** ${tabela.triggers.join(', ')}`, '');
  }
  return `${linhas.join('\n')}\n`;
}
