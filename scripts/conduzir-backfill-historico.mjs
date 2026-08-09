// Conduz o backfill histórico do professor até `concluido`.
//
// A edge `backfill-historico-professor-emusys` é checkpointada: cada chamada avança
// no máximo 10 páginas e devolve o estado. Quem chama precisa repetir até fechar.
// Não existe cron para isso — foi por isso que o staging parou em 16/07/2026.
//
// Uso: node scripts/conduzir-backfill-historico.mjs <execucao_id> [<execucao_id> ...]
import fs from 'node:fs';
import path from 'node:path';

const raizRepo = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(raizRepo, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((linha) => linha.includes('=') && !linha.trim().startsWith('#'))
    .map((linha) => {
      const corte = linha.indexOf('=');
      return [linha.slice(0, corte).trim(), linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE = env.VITE_SUPABASE_SERVICE_ROLE;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/backfill-historico-professor-emusys`;
const MAX_CHAMADAS = 200;

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function conduzir(execucaoId) {
  let ultimo = null;
  for (let chamada = 1; chamada <= MAX_CHAMADAS; chamada += 1) {
    const resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ execucao_id: execucaoId, max_paginas: 10 }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      return { execucaoId, erro: `HTTP ${resposta.status}`, corpo, chamadas: chamada };
    }
    ultimo = corpo.execucao ?? corpo;
    process.stderr.write(
      `\r  ${execucaoId.slice(0, 8)} chamada ${chamada}: ${ultimo.status} | janela ${ultimo.janela_inicio_atual}→${ultimo.janela_fim_atual} | ${ultimo.paginas_processadas} pág, ${ultimo.aulas_recebidas} aulas   `,
    );
    if (ultimo.status === 'concluido') break;
    if (ultimo.status === 'pausado' || ultimo.status === 'falhou') break;
    // Folga entre chamadas: a API é 60 req/min por IP e a casa inteira usa o mesmo IP.
    await espera(2500);
  }
  process.stderr.write('\n');
  return { execucaoId, ...ultimo };
}

const resultados = [];
for (const execucaoId of process.argv.slice(2)) {
  resultados.push(await conduzir(execucaoId));
  await espera(5000);
}
console.log(JSON.stringify(
  resultados.map((r) => ({
    execucao: r.execucaoId?.slice(0, 8),
    status: r.status ?? r.erro,
    paginas: r.paginas_processadas,
    aulas: r.aulas_recebidas,
    janela_fim: r.janela_fim_atual,
    erro_codigo: r.ultimo_erro_codigo ?? r.corpo?.error ?? null,
  })),
  null,
  2,
));
