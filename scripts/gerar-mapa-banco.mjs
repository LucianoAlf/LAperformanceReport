import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DOMINIOS, SEM_DOMINIO, classificarDominio } from './mapa-banco/dominios.mjs';
import { mapearConsumidores } from './mapa-banco/consumidores.mjs';
import { classificarEstado } from './mapa-banco/estados.mjs';
import {
  escreverSeMudou,
  formatarDetalhe,
  formatarFuncoes,
  formatarTabelas,
} from './mapa-banco/formatar.mjs';
import * as Q from './mapa-banco/consultas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'docs/banco');

// Em worktree o .env.local nao existe (e gitignored, e assim deve ser). Como o
// repo trabalha com worktrees por padrao, procurar tambem na copia principal
// evita ter que duplicar credencial a cada worktree criado.
function caminhoDoEnv() {
  const local = path.join(RAIZ, '.env.local');
  if (fs.existsSync(local)) return local;
  const marcadorGit = path.join(RAIZ, '.git');
  if (fs.existsSync(marcadorGit) && fs.statSync(marcadorGit).isFile()) {
    const gitdir = fs.readFileSync(marcadorGit, 'utf8').replace('gitdir:', '').trim();
    // .git/worktrees/<nome> -> sobe tres niveis para chegar a raiz principal
    const principal = path.resolve(gitdir, '..', '..', '..');
    const candidato = path.join(principal, '.env.local');
    if (fs.existsSync(candidato)) return candidato;
  }
  throw new Error(`.env.local nao encontrado (procurado em ${local})`);
}

function lerEnv() {
  const texto = fs.readFileSync(caminhoDoEnv(), 'utf8');
  const pegar = (chave) => (texto.match(new RegExp(`^${chave}=(.*)$`, 'm')) || [, ''])[1].trim();
  return {
    host: pegar('SUPABASE_DB_HOST'),
    port: Number(pegar('SUPABASE_DB_PORT') || 5432),
    user: pegar('SUPABASE_DB_USER'),
    database: pegar('SUPABASE_DB_NAME'),
    password: pegar('SUPABASE_DB_PASSWORD'),
    ssl: { rejectUnauthorized: false },
  };
}

function poolerUrl() {
  const arquivo = path.join(RAIZ, 'supabase/.temp/pooler-url');
  return fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8').trim() : '';
}

async function conectar() {
  const direta = lerEnv();
  if (!direta.host || !direta.password) {
    throw new Error('faltam SUPABASE_DB_HOST/SUPABASE_DB_PASSWORD em .env.local');
  }
  try {
    const cliente = new pg.Client(direta);
    await cliente.connect();
    return cliente;
  } catch (erro) {
    // A conexao direta em db.*.supabase.co pode ser IPv6-only. Jamais imprimir a senha.
    console.error(`[mapa-banco] conexao direta falhou em ${direta.host}:${direta.port} — ${erro.message}`);
    const url = poolerUrl();
    if (!url) throw new Error('sem supabase/.temp/pooler-url para o fallback; abortando sem escrever arquivo');
    const comSenha = url
      .replace('[YOUR-PASSWORD]', encodeURIComponent(direta.password))
      .replace('${POSTGRES_PASSWORD}', encodeURIComponent(direta.password));
    const cliente = new pg.Client({ connectionString: comSenha, ssl: { rejectUnauthorized: false } });
    await cliente.connect();
    console.error('[mapa-banco] conectado pelo pooler');
    return cliente;
  }
}

function agrupar(linhas, chave, valor) {
  const mapa = new Map();
  for (const linha of linhas) {
    if (!mapa.has(linha[chave])) mapa.set(linha[chave], []);
    mapa.get(linha[chave]).push(valor(linha));
  }
  return mapa;
}

function lerFontesDoRepo() {
  const fontes = [];
  const varrer = (dir, fonte, filtro) => {
    if (!fs.existsSync(dir)) return;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entrada.isFile() || !filtro.test(entrada.name)) continue;
      const pai = entrada.parentPath ?? entrada.path;
      const completo = path.join(pai, entrada.name);
      fontes.push({
        fonte,
        origem: path.relative(RAIZ, completo).replaceAll('\\', '/'),
        texto: fs.readFileSync(completo, 'utf8'),
      });
    }
  };
  varrer(path.join(RAIZ, 'src'), 'front', /\.(ts|tsx)$/);
  varrer(path.join(RAIZ, 'supabase/functions'), 'edge', /\.ts$/);
  return fontes;
}

async function main() {
  const cliente = await conectar();
  const consultar = async (sql) => (await cliente.query(sql)).rows;
  const [tabelas, colunas, fks, policies, unicos, triggers, funcoes, viewsDef, crons] =
    await Promise.all([
      consultar(Q.SQL_TABELAS),
      consultar(Q.SQL_COLUNAS),
      consultar(Q.SQL_FKS),
      consultar(Q.SQL_POLICIES),
      consultar(Q.SQL_INDICES_UNICOS),
      consultar(Q.SQL_TRIGGERS),
      consultar(Q.SQL_FUNCOES),
      consultar(Q.SQL_VIEWS_DEF),
      consultar(Q.SQL_CRON),
    ]);
  await cliente.end();

  const env = lerEnv();
  const referencia = env.host.replace(/^db\./, '').split('.')[0] || 'producao';
  const meta = { ref: referencia, data: new Date().toISOString().slice(0, 10) };

  const fkPorTabela = agrupar(fks, 'tabela', (fk) => fk);
  const policyPorTabela = new Map(policies.map((p) => [p.tabela, p.total]));
  const colunasPorTabela = agrupar(colunas, 'tabela', (c) => c);
  const unicosPorTabela = agrupar(unicos, 'tabela', (u) => u.indice);
  const triggersPorTabela = agrupar(triggers, 'tabela', (t) => `${t.trigger} → ${t.funcao}()`);

  const avisos = [];
  const dadosTabelas = tabelas.map((tabela) => {
    const dominio = classificarDominio(tabela.nome);
    if (dominio === SEM_DOMINIO) avisos.push(tabela.nome);
    const minhasColunas = colunasPorTabela.get(tabela.nome) ?? [];
    const minhasFks = fkPorTabela.get(tabela.nome) ?? [];
    const referenciaDe = new Map(minhasFks.map((fk) => [fk.coluna, `${fk.ref_tabela}.${fk.ref_coluna}`]));
    return {
      nome: tabela.nome,
      tipo: tabela.tipo,
      dominio,
      colunas: minhasColunas.length,
      linhas: tabela.linhas === null ? null : Number(tabela.linhas),
      rls: tabela.rls,
      policies: policyPorTabela.get(tabela.nome) ?? 0,
      fks: minhasFks.length,
      comentario: tabela.comentario,
      detalheColunas: minhasColunas.map((coluna) => ({
        nome: coluna.coluna,
        tipo: coluna.tipo,
        nulo: coluna.nulo,
        padrao: coluna.padrao,
        referencia: referenciaDe.get(coluna.coluna) ?? '',
      })),
      indicesUnicos: unicosPorTabela.get(tabela.nome) ?? [],
      triggers: triggersPorTabela.get(tabela.nome) ?? [],
    };
  });

  const fontes = lerFontesDoRepo();
  for (const funcao of funcoes) fontes.push({ fonte: 'funcao', origem: funcao.nome, texto: funcao.corpo });
  for (const view of viewsDef) fontes.push({ fonte: 'view', origem: view.nome, texto: view.corpo });
  for (const cron of crons) {
    fontes.push({
      fonte: 'cron',
      origem: cron.active ? cron.jobname : `${cron.jobname} (inativo)`,
      texto: cron.command,
    });
  }
  for (const trigger of triggers) {
    fontes.push({
      fonte: 'trigger',
      origem: `${trigger.tabela}.${trigger.trigger}`,
      texto: trigger.funcao,
    });
  }

  const nomesFuncoes = [...new Set(funcoes.map((funcao) => funcao.nome))];
  const consumidoresPorNome = mapearConsumidores({ nomes: nomesFuncoes, fontes });

  const dadosFuncoes = funcoes.map((funcao) => {
    const dominio = classificarDominio(funcao.nome);
    if (dominio === SEM_DOMINIO) avisos.push(`${funcao.nome}()`);
    const consumidores = consumidoresPorNome.get(funcao.nome) ?? [];
    const { estado, anon, motivo } = classificarEstado(
      { nome: funcao.nome, anon: funcao.anon },
      consumidores,
      nomesFuncoes,
    );
    return {
      nome: funcao.nome,
      args: funcao.args,
      dominio,
      secdef: funcao.secdef,
      anon,
      estado,
      motivo,
      consumidores,
    };
  });

  const dados = { tabelas: dadosTabelas, funcoes: dadosFuncoes };
  let escritos = 0;
  if (escreverSeMudou(path.join(SAIDA, 'TABELAS.gerado.md'), formatarTabelas(dados), meta)) escritos += 1;
  if (escreverSeMudou(path.join(SAIDA, 'FUNCOES.gerado.md'), formatarFuncoes(dados), meta)) escritos += 1;
  for (const dominio of [...DOMINIOS, SEM_DOMINIO]) {
    const corpo = formatarDetalhe(dominio, dados);
    if (escreverSeMudou(path.join(SAIDA, 'detalhe', `${dominio}.md`), corpo, meta)) escritos += 1;
  }

  const contar = (estado) => dadosFuncoes.filter((f) => f.estado === estado).length;
  console.log(`[mapa-banco] ${dadosTabelas.length} tabelas/views · ${dadosFuncoes.length} funcoes · ${escritos} arquivo(s) reescrito(s)`);
  console.log(`[mapa-banco] ATIVA ${contar('ATIVA')} · SO-INTERNA ${contar('SO-INTERNA')} · ORFA ${contar('ORFA')} · LEGADO ${contar('LEGADO')} · anon ${dadosFuncoes.filter((f) => f.anon).length}`);
  if (avisos.length) {
    console.warn(`[mapa-banco] ${avisos.length} objeto(s) sem dominio — classifique em scripts/mapa-banco/areas.json:`);
    for (const aviso of avisos) console.warn(`  - ${aviso}`);
  }
}

main().catch((erro) => {
  console.error(`[mapa-banco] FALHOU: ${erro.message}`);
  process.exit(1);
});
