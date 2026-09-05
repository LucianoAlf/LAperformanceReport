#!/usr/bin/env node
// Aplica UM arquivo de migration direto no Postgres, numa transação.
//
// Existe porque a migration de carga da base comercial tem 84 KB de markdown:
// passá-la por uma ferramenta que a materialize no contexto do agente é caro e
// desnecessário — o arquivo já está versionado e revisado. Aqui ele vai do
// disco para o banco sem escala.
//
// ⚠️ TRANSAÇÃO ÚNICA: ou entra tudo, ou não entra nada. Carga pela metade numa
//    tabela que a Mila SDR compartilha é o cenário que não pode existir.
// ⚠️ Registra na `supabase_migrations.schema_migrations` para o histórico do
//    projeto não ficar mentindo sobre o que rodou.
//
//   node scripts/aplicar-migration.mjs supabase/migrations/<arquivo>.sql
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const RAIZ = process.cwd();

function carregarEnv() {
  const p = path.join(RAIZ, '.env.local');
  if (!fs.existsSync(p)) throw new Error('.env.local nao encontrado');
  const env = {};
  for (const linha of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

const arquivo = process.argv[2];
if (!arquivo) { console.error('uso: node scripts/aplicar-migration.mjs <arquivo.sql>'); process.exit(2); }

const sql = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const versao = path.basename(arquivo).split('_')[0];
const nome = path.basename(arquivo, '.sql').slice(versao.length + 1);
const env = carregarEnv();

// ⚠️ O host direto `db.<ref>.supabase.co` está APOSENTADO (e era IPv6-only
//    antes disso). Mesma queda para o pooler que o `gerar-mapa-banco.mjs` faz —
//    a URL vem de `supabase/.temp/pooler-url`, com a senha interpolada.
//    Nunca imprimir a senha, nem no erro.
async function conectar() {
  const comum = {
    ssl: { rejectUnauthorized: false },
    // A carga é grande; o statement_timeout de 8s do PostgREST não vale numa
    // conexão direta, mas isso não é desculpa para rodar sem teto.
    statement_timeout: 120_000,
  };
  try {
    const c = new pg.Client({
      host: env.SUPABASE_DB_HOST,
      port: Number(env.SUPABASE_DB_PORT || 5432),
      user: env.SUPABASE_DB_USER,
      database: env.SUPABASE_DB_NAME,
      password: env.SUPABASE_DB_PASSWORD,
      ...comum,
    });
    await c.connect();
    return c;
  } catch (erro) {
    console.error(`conexao direta falhou em ${env.SUPABASE_DB_HOST} — ${erro.message}`);
    const arq = path.join(RAIZ, 'supabase/.temp/pooler-url');
    if (!fs.existsSync(arq)) throw new Error('sem supabase/.temp/pooler-url para o fallback');
    const url = fs.readFileSync(arq, 'utf8').trim()
      .replace('[YOUR-PASSWORD]', encodeURIComponent(env.SUPABASE_DB_PASSWORD))
      .replace('${POSTGRES_PASSWORD}', encodeURIComponent(env.SUPABASE_DB_PASSWORD));
    const c = new pg.Client({ connectionString: url, ...comum });
    await c.connect();
    console.error('conectado pelo pooler');
    return c;
  }
}

const cliente = await conectar();

// Os NOTICE do bloco DO de prova são o ponto do exercício: aparecem aqui.
cliente.on('notice', (n) => console.log('  NOTICE:', n.message));

try {
  console.log(`aplicando ${arquivo} (${sql.length} bytes)`);
  await cliente.query('begin');
  await cliente.query(sql);
  await cliente.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, $3) on conflict (version) do nothing`,
    [versao, nome, [sql]],
  );
  await cliente.query('commit');
  console.log('OK — commit feito');
} catch (e) {
  try { await cliente.query('rollback'); } catch { /* já caiu */ }
  console.error('FALHOU, rollback aplicado:', e.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
