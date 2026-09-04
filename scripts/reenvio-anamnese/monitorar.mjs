#!/usr/bin/env node
// Acompanha o lote de reenvio enquanto ele drena. Uma linha por minuto.
//   node scripts/reenvio-anamnese/monitorar.mjs [minutos]
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const arquivo of ['.env.local', '.env']) {
  const caminho = path.join(RAIZ, arquivo);
  if (!fs.existsSync(caminho)) continue;
  for (const linha of fs.readFileSync(caminho, 'utf8').split(/\r?\n/u)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/gu, '');
  }
}

const minutos = Number(process.argv[2] ?? 20);
const cliente = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await cliente.connect();

const SQL = `
select
  count(*) filter (where status = 'enviada')                                    as enviadas,
  count(*) filter (where status in ('erro','falhou'))                           as falhas,
  count(*) filter (where status = 'sol_enviando')                               as enviando,
  count(*) filter (where status = 'sol_pendente')                               as pendentes,
  count(*) filter (where status = 'sol_pendente'
                     and agendada_para < now() - interval '5 minutes')          as atrasadas,
  max(enviada_em at time zone 'America/Sao_Paulo')                              as ultima_saiu
from fila_anamnese_sol_hermes
where metadata->>'modo' = 'reenvio'`;

const ERROS = `
select left(coalesce(erro,'(sem texto)'), 120) as erro, count(*)
from fila_anamnese_sol_hermes
where metadata->>'modo' = 'reenvio' and status in ('erro','falhou')
group by 1 order by 2 desc limit 3`;

for (let i = 0; i < minutos; i += 1) {
  const { rows: [r] } = await cliente.query(SQL);
  const agora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(
    `${agora}  enviadas=${String(r.enviadas).padStart(3)}  falhas=${r.falhas}  ` +
    `enviando=${r.enviando}  pendentes=${r.pendentes}  atrasadas=${r.atrasadas}  ` +
    `ultima=${r.ultima_saiu ? new Date(r.ultima_saiu).toLocaleTimeString('pt-BR') : '—'}`,
  );
  if (Number(r.falhas) > 0) {
    const { rows: erros } = await cliente.query(ERROS);
    for (const e of erros) console.log(`    !! ${e.count}x ${e.erro}`);
  }
  if (Number(r.pendentes) === 0 && Number(r.enviando) === 0) {
    console.log('lote drenado.');
    break;
  }
  await new Promise((r2) => setTimeout(r2, 60_000));
}
await cliente.end();
