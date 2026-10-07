// Backfill do extrato Asaas (Emusys beta) pela fila duravel — 01/01/2024 ate
// ontem, convênio a convênio dentro de cada unidade. Enfileira blocos mensais,
// acompanha cada job e so anuncia conclusao quando todos estiverem succeeded.
// Tokens nunca entram em log. Rodar fora do horario do sync dos lancamentos
// (~06h BRT) — a fila cede quando outra fila Emusys esta rodando.
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

const FUNCTION_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-asaas-emusys';
const SERVICE_ROLE = env.VITE_SUPABASE_SERVICE_ROLE;
if (!SERVICE_ROLE) throw new Error('VITE_SUPABASE_SERVICE_ROLE ausente no .env');

const UNIDADES = ['cg', 'barra', 'recreio'];
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const ontemData = new Date(`${HOJE}T12:00:00Z`);
ontemData.setUTCDate(ontemData.getUTCDate() - 1);
const ONTEM = ontemData.toISOString().slice(0, 10);

// meses de 2024-01 ate o mes corrente (cap no ontem encerrado)
const MESES = [];
{
  const cursor = new Date('2024-01-01T00:00:00Z');
  while (cursor.toISOString().slice(0, 10) <= ONTEM) {
    const inicio = cursor.toISOString().slice(0, 10);
    const ultimoDia = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);
    MESES.push({ inicio, fim: ultimoDia < ONTEM ? ultimoDia : ONTEM, rotulo: inicio.slice(0, 7) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function chamar(corpo, etiqueta) {
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      const resposta = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(60000),
      });
      const json = await resposta.json();
      if (resposta.status === 429 || resposta.status >= 500) {
        const recuo = 15000 * tentativa;
        console.log(`  ${etiqueta}: HTTP ${resposta.status} - nova consulta em ${recuo / 1000}s`);
        await espera(recuo);
        continue;
      }
      if (json.success !== true) throw new Error(`${etiqueta}: ${json.erro ?? JSON.stringify(json).slice(0, 200)}`);
      return json;
    } catch (erro) {
      if (tentativa === 3) throw erro;
      console.log(`  ${etiqueta}: ${erro.message} - tentando de novo`);
      await espera(10000);
    }
  }
  throw new Error(`${etiqueta}: tentativas esgotadas`);
}

const jobIds = new Set();
async function enfileirar(corpo, etiqueta) {
  const resposta = await chamar({ mode: 'enqueue_range', ...corpo }, etiqueta);
  for (const job of resposta.jobs ?? []) {
    if (job?.id) jobIds.add(String(job.id));
  }
  console.log(`${etiqueta}: ${resposta.jobs?.length ?? 0} bloco(s) na fila`);
}

async function aguardarConclusao() {
  const ids = [...jobIds];
  if (!ids.length) throw new Error('nenhum job foi retornado pela fila');
  while (true) {
    const resposta = await chamar({ mode: 'queue_status', job_ids: ids.slice(0, 200) }, 'status da fila');
    const jobs = resposta.jobs ?? [];
    if (jobs.length !== Math.min(ids.length, 200)) {
      throw new Error(`fila retornou ${jobs.length}/${ids.length} jobs`);
    }
    const falhos = jobs.filter((job) => job.status === 'failed');
    if (falhos.length) {
      throw new Error(`backfill falhou: ${JSON.stringify(falhos).slice(0, 1000)}`);
    }
    const concluidos = jobs.filter((job) => job.status === 'succeeded').length;
    const ativos = jobs.length - concluidos;
    console.log(`fila: ${concluidos}/${jobs.length} concluidos; ${ativos} ativos`);
    if (ativos === 0) return;
    await espera(30000);
  }
}

console.log(`Backfill extrato Asaas 2024-01 -> ${ONTEM} (dias encerrados, BRT)\n`);
const inicioGeral = Date.now();

let primeiro = true;
for (const unidade of UNIDADES) {
  for (const mes of MESES) {
    await enfileirar({
      unidade,
      data_inicial: mes.inicio,
      data_final: mes.fim,
      catalogos: primeiro,   // catalogo de convenios so precisa vir uma vez
      trigger_source: 'script_backfill_asaas_2024',
      priority: 100,
    }, `${unidade}/${mes.rotulo}`);
    primeiro = false;
  }
}

for (const unidade of UNIDADES) {
  const resposta = await chamar({
    mode: 'enqueue_daily',
    unidade,
    catalogos: true,
    trigger_source: 'script_backfill_asaas_final',
    priority: 50,
  }, `${unidade}/final`);
  for (const job of resposta.jobs ?? []) {
    if (job?.id) jobIds.add(String(job.id));
  }
}

await aguardarConclusao();
console.log(`\nConcluido em ${Math.round((Date.now() - inicioGeral) / 60000)} min; ${jobIds.size} jobs confirmados.`);
