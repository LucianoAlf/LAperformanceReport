// Conduz a reconstrução particionada de períodos do professor.
//
// O manifesto precisa estar preparado antes (RPC preparar_manifesto_reconstrucao_professor_v1).
// A edge processa UMA partição por chamada e chama a finalização a cada uma;
// ela fecha sozinha quando todas as 32 chegam. Não existe cron para isso.
//
// Uso: node scripts/conduzir-reconstrucao-professor.mjs
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
const ENDPOINT = `${SUPABASE_URL}/functions/v1/reconstruir-periodos-professor`;

const VERSAO = 'periodos-professor-v1.23-disciplina-mesmo-vinculo-20260718';
const DATA_INICIO = '2018-01-01';
const DATA_FIM = process.env.DATA_FIM || new Date().toISOString().slice(0, 10);
const TOTAL_PARTICOES = 32;

const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', backfill: 'e458d32a-c96d-4997-8691-7df07e5524f4' },
  { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', backfill: '0dd86f6d-f4f0-4d03-9b51-91921a4bf1d5' },
  { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', backfill: '1d1e0304-17b4-4681-8018-c61011186897' },
];

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processarParticao(unidade, indice) {
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    const resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        unidade_id: unidade.id,
        data_inicio: DATA_INICIO,
        data_fim: DATA_FIM,
        versao_reconstrucao: VERSAO,
        execucao_backfill_id: unidade.backfill,
        particao_total: TOTAL_PARTICOES,
        particao_indice: indice,
      }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (resposta.ok) return corpo;
    // 5xx costuma ser timeout de partição pesada: vale reenviar.
    if (resposta.status < 500 || tentativa === 3) {
      return { erro: `HTTP ${resposta.status}`, corpo };
    }
    await espera(3000 * tentativa);
  }
}

const relatorio = [];
for (const unidade of UNIDADES) {
  let periodos = 0;
  let diagnosticos = 0;
  const falhas = [];
  for (let indice = 0; indice < TOTAL_PARTICOES; indice += 1) {
    const resultado = await processarParticao(unidade, indice);
    if (resultado?.erro) {
      falhas.push({ indice, ...resultado });
      process.stderr.write(`\n  ${unidade.nome} p${indice}: ERRO ${resultado.erro} ${JSON.stringify(resultado.corpo).slice(0, 200)}\n`);
      continue;
    }
    periodos += resultado?.resumo?.periodos ?? 0;
    diagnosticos += resultado?.resumo?.diagnosticos ?? 0;
    process.stderr.write(`\r  ${unidade.nome}: partição ${indice + 1}/${TOTAL_PARTICOES} | ${periodos} períodos, ${diagnosticos} diagnósticos   `);
    await espera(400);
  }
  process.stderr.write('\n');
  relatorio.push({ unidade: unidade.nome, periodos, diagnosticos, falhas: falhas.length, detalhe_falhas: falhas.slice(0, 3) });
}

console.log(JSON.stringify({ data_fim: DATA_FIM, versao: VERSAO, relatorio }, null, 2));
