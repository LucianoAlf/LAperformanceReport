import fs from 'node:fs';
import process from 'node:process';

import {
  indicesParticoes,
} from '../supabase/functions/_shared/reconstrucao-particionada-professor.mjs';

function carregarEnvArquivo(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function argsMap(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result.set(current, next);
      index += 1;
    } else {
      result.set(current, true);
    }
  }
  return result;
}

function obrigatorio(args, name) {
  const value = args.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`ARGUMENTO_OBRIGATORIO:${name}`);
  }
  return value.trim();
}

async function obterAccessToken(url, anonKey) {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const email = process.env.LA_REPORT_ADMIN_EMAIL;
  const password = process.env.LA_REPORT_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Defina SUPABASE_ACCESS_TOKEN ou LA_REPORT_ADMIN_EMAIL/LA_REPORT_ADMIN_PASSWORD.',
    );
  }
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error('LOGIN_ADMIN_FALHOU');
  return body.access_token;
}

async function invocarComRetry(url, anonKey, token, payload, maxTentativas = 4) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    try {
      const response = await fetch(
        `${url}/functions/v1/reconstruir-periodos-professor`,
        {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(120_000),
        },
      );
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (response.ok) return body;
      ultimoErro = new Error(`EDGE_${response.status}:${body.error ?? text}`);
      if (response.status < 500 && response.status !== 429) throw ultimoErro;
    } catch (error) {
      ultimoErro = error;
    }
    if (tentativa < maxTentativas) {
      await new Promise((resolve) => setTimeout(resolve, tentativa * 2000));
    }
  }
  throw ultimoErro;
}

carregarEnvArquivo('.env.local');
carregarEnvArquivo('.env');

const args = argsMap(process.argv.slice(2));
const unidadeId = obrigatorio(args, '--unidade-id');
const dataInicio = obrigatorio(args, '--data-inicio');
const dataFim = obrigatorio(args, '--data-fim');
const versao = obrigatorio(args, '--versao');
const execucaoId = obrigatorio(args, '--execucao-backfill-id');
const totalParticoes = Number(obrigatorio(args, '--total-particoes'));
const inicioParticao = Number(args.get('--inicio-particao') ?? 0);
const inicioCompleto = args.has('--inicio-completo');

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) throw new Error('SUPABASE_URL_OU_ANON_KEY_AUSENTE');

const token = await obterAccessToken(supabaseUrl, anonKey);
let ultimoResultado = null;

for (const particaoIndice of indicesParticoes(totalParticoes, inicioParticao)) {
  const inicio = Date.now();
  ultimoResultado = await invocarComRetry(supabaseUrl, anonKey, token, {
    unidade_id: unidadeId,
    data_inicio: dataInicio,
    data_fim: dataFim,
    versao_reconstrucao: versao,
    execucao_backfill_id: execucaoId,
    inicio_completo: inicioCompleto,
    particao_total: totalParticoes,
    particao_indice: particaoIndice,
  });
  process.stdout.write(`${JSON.stringify({
    particao: particaoIndice,
    total_particoes: totalParticoes,
    duracao_ms: Date.now() - inicio,
    eventos: ultimoResultado?.resumo?.eventos ?? null,
    periodos: ultimoResultado?.resumo?.periodos ?? null,
    diagnosticos: ultimoResultado?.resumo?.diagnosticos ?? null,
    finalizacao: ultimoResultado?.finalizacao?.status ?? null,
  })}\n`);
}

process.stdout.write(`${JSON.stringify({
  concluido: ultimoResultado?.finalizacao?.status === 'concluido',
  resultado_final: ultimoResultado?.finalizacao ?? null,
})}\n`);
