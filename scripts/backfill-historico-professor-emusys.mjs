#!/usr/bin/env node

const COMANDOS = new Set(['create', 'resume', 'run', 'pause', 'status']);
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERVALO_MINIMO_MS = 20_000;
const MAX_CHAMADAS_POR_LOTE = 50;

const UNIDADES = new Map([
  ['campo-grande', '2ec861f6-023f-4d7b-9927-3960ad8c2a92'],
  ['cg', '2ec861f6-023f-4d7b-9927-3960ad8c2a92'],
  ['barra', '368d47f5-2d88-4475-bc14-ba084a9a348e'],
  ['recreio', '95553e96-971b-4590-a6eb-0201d013c14d'],
]);

function uso() {
  console.log(`
Uso:
  node scripts/backfill-historico-professor-emusys.mjs create --unidade <cg|barra|recreio|uuid> --inicio YYYY-MM-DD --fim YYYY-MM-DD [--max-paginas 1] [--pausar-apos YYYY-MM-DD] [--somente-criar]
  node scripts/backfill-historico-professor-emusys.mjs resume --job <uuid> [--max-paginas 1] [--pausar-apos YYYY-MM-DD]
  node scripts/backfill-historico-professor-emusys.mjs run --job <uuid> [--pausar-apos YYYY-MM-DD] [--intervalo-ms 20000] [--max-chamadas 50]
  node scripts/backfill-historico-professor-emusys.mjs pause --job <uuid>
  node scripts/backfill-historico-professor-emusys.mjs status --job <uuid>

Variaveis obrigatorias:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
}

function lerArgumentos(argv) {
  const valores = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const atual = argv[index];
    if (!atual.startsWith('--')) throw new Error(`Argumento inesperado: ${atual}`);
    const proximo = argv[index + 1];
    if (!proximo || proximo.startsWith('--')) {
      flags.add(atual);
      continue;
    }
    valores.set(atual, proximo);
    index += 1;
  }
  return { valores, flags };
}

function obrigatorio(argumentos, nome) {
  const valor = argumentos.valores.get(nome);
  if (!valor) throw new Error(`${nome} e obrigatorio`);
  return valor;
}

function validarData(data, nome) {
  if (!DATA_ISO.test(data)) throw new Error(`${nome} deve estar em YYYY-MM-DD`);
  const date = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data) {
    throw new Error(`${nome} nao e uma data valida`);
  }
}

function resolverUnidade(valor) {
  const normalizado = valor.toLowerCase().trim().replace(/\s+/g, '-');
  if (UNIDADES.has(normalizado)) return UNIDADES.get(normalizado);
  if (UUID.test(valor)) return valor.toLowerCase();
  throw new Error('--unidade deve ser cg, campo-grande, barra, recreio ou UUID');
}

function validarJob(argumentos) {
  const job = obrigatorio(argumentos, '--job');
  if (!UUID.test(job)) throw new Error('--job deve ser UUID');
  return job;
}

function fimDoMesLimitado(inicioIso, limiteIso) {
  const inicio = new Date(`${inicioIso}T12:00:00Z`);
  const fimMes = new Date(Date.UTC(
    inicio.getUTCFullYear(),
    inicio.getUTCMonth() + 1,
    0,
  )).toISOString().slice(0, 10);
  return fimMes < limiteIso ? fimMes : limiteIso;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configuracao() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias');
  }
  return { url, serviceRoleKey };
}

async function requestJson(url, serviceRoleKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const texto = await response.text();
  const body = texto ? JSON.parse(texto) : null;
  if (!response.ok) {
    const codigo = body?.error ?? body?.code ?? `HTTP_${response.status}`;
    throw new Error(`Operacao recusada: ${codigo}`);
  }
  return body;
}

async function consultarJob(config, job) {
  const query = new URLSearchParams({
    id: `eq.${job}`,
    select: '*',
  });
  const rows = await requestJson(
    `${config.url}/rest/v1/emusys_historico_backfill_execucoes_v1?${query}`,
    config.serviceRoleKey,
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Job nao encontrado');
  return rows[0];
}

async function atualizarJob(config, job, patch, filtrosStatus = []) {
  const query = new URLSearchParams({ id: `eq.${job}`, select: '*' });
  if (filtrosStatus.length) query.set('status', `in.(${filtrosStatus.join(',')})`);
  const rows = await requestJson(
    `${config.url}/rest/v1/emusys_historico_backfill_execucoes_v1?${query}`,
    config.serviceRoleKey,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...patch, atualizado_em: new Date().toISOString() }),
    },
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Job nao estava em estado compativel com a operacao');
  }
  return rows[0];
}

async function invocarColetor(config, job, maxPaginas, pausarAposData = null) {
  return requestJson(
    `${config.url}/functions/v1/backfill-historico-professor-emusys`,
    config.serviceRoleKey,
    {
      method: 'POST',
      body: JSON.stringify({
        execucao_id: job,
        max_paginas: maxPaginas,
        pausar_apos_data: pausarAposData,
      }),
    },
  );
}

function maxPaginas(argumentos) {
  const valor = Number(argumentos.valores.get('--max-paginas') ?? 1);
  if (!Number.isInteger(valor) || valor < 1 || valor > 10) {
    throw new Error('--max-paginas deve ser inteiro entre 1 e 10');
  }
  return valor;
}

function pausarApos(argumentos) {
  const data = argumentos.valores.get('--pausar-apos') ?? null;
  if (data !== null) validarData(data, '--pausar-apos');
  return data;
}

function intervaloOperacional(argumentos) {
  const valor = Number(
    argumentos.valores.get('--intervalo-ms') ?? INTERVALO_MINIMO_MS,
  );
  if (!Number.isInteger(valor) || valor < INTERVALO_MINIMO_MS || valor > 60_000) {
    throw new Error('--intervalo-ms deve ser inteiro entre 20000 e 60000');
  }
  return valor;
}

function maxChamadas(argumentos) {
  const valor = Number(
    argumentos.valores.get('--max-chamadas') ?? MAX_CHAMADAS_POR_LOTE,
  );
  if (!Number.isInteger(valor) || valor < 1 || valor > MAX_CHAMADAS_POR_LOTE) {
    throw new Error('--max-chamadas deve ser inteiro entre 1 e 50');
  }
  return valor;
}

async function criar(config, argumentos) {
  const unidadeId = resolverUnidade(obrigatorio(argumentos, '--unidade'));
  const inicio = obrigatorio(argumentos, '--inicio');
  const fim = obrigatorio(argumentos, '--fim');
  validarData(inicio, '--inicio');
  validarData(fim, '--fim');
  if (fim < inicio) throw new Error('--fim deve ser maior ou igual a --inicio');

  const queryAtivos = new URLSearchParams({
    unidade_id: `eq.${unidadeId}`,
    status: 'in.(pendente,executando)',
    select: 'id,status',
    limit: '1',
  });
  const ativos = await requestJson(
    `${config.url}/rest/v1/emusys_historico_backfill_execucoes_v1?${queryAtivos}`,
    config.serviceRoleKey,
  );
  if (ativos.length) throw new Error(`Ja existe job ativo para a unidade: ${ativos[0].id}`);

  const rows = await requestJson(
    `${config.url}/rest/v1/emusys_historico_backfill_execucoes_v1?select=*`,
    config.serviceRoleKey,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        unidade_id: unidadeId,
        data_inicio: inicio,
        data_fim: fim,
        janela_inicio_atual: inicio,
        janela_fim_atual: fimDoMesLimitado(inicio, fim),
        status: 'pendente',
      }),
    },
  );
  const job = rows[0];
  console.log(JSON.stringify({ criado: true, job }, null, 2));
  if (!argumentos.flags.has('--somente-criar')) {
    const resultado = await invocarColetor(
      config,
      job.id,
      maxPaginas(argumentos),
      pausarApos(argumentos),
    );
    console.log(JSON.stringify(resultado, null, 2));
  }
}

async function retomar(config, argumentos) {
  const jobId = validarJob(argumentos);
  let job = await consultarJob(config, jobId);
  if (job.status === 'concluido') {
    console.log(JSON.stringify(job, null, 2));
    return;
  }
  if (job.status === 'pausado' || job.status === 'falhou') {
    job = await atualizarJob(config, jobId, {
      status: 'executando',
      ultimo_erro_codigo: null,
      ultimo_erro_contexto: null,
      ultimo_erro_em: null,
      concluido_em: null,
    }, ['pausado', 'falhou']);
  }
  const resultado = await invocarColetor(
    config,
    job.id,
    maxPaginas(argumentos),
    pausarApos(argumentos),
  );
  console.log(JSON.stringify(resultado, null, 2));
}

async function executarContinuo(config, argumentos) {
  const jobId = validarJob(argumentos);
  const pausarAposData = pausarApos(argumentos);
  const intervaloMs = intervaloOperacional(argumentos);
  const limiteChamadas = maxChamadas(argumentos);
  let job = await consultarJob(config, jobId);

  if (job.status === 'concluido') {
    console.log(JSON.stringify({ chamadas: 0, job }, null, 2));
    return;
  }

  if (job.status === 'pausado' || job.status === 'falhou') {
    job = await atualizarJob(
      config,
      jobId,
      { status: 'executando', concluido_em: null },
      ['pausado', 'falhou'],
    );
  }

  let chamadas = 0;
  while (chamadas < limiteChamadas) {
    const resultado = await invocarColetor(
      config,
      job.id,
      1,
      pausarAposData,
    );
    job = resultado.execucao;
    chamadas += 1;
    console.log(JSON.stringify({
      chamada: chamadas,
      status: job.status,
      janela_inicio_atual: job.janela_inicio_atual,
      paginas_processadas: job.paginas_processadas,
      aulas_recebidas: job.aulas_recebidas,
    }));

    if (job.status === 'pausado' || job.status === 'concluido') break;
    await delay(intervaloMs);
  }

  if (chamadas === limiteChamadas && job.status === 'executando') {
    job = await atualizarJob(
      config,
      job.id,
      { status: 'pausado' },
      ['executando'],
    );
  }

  console.log(JSON.stringify({ chamadas, job }, null, 2));
}

async function pausar(config, argumentos) {
  const jobId = validarJob(argumentos);
  const job = await atualizarJob(
    config,
    jobId,
    { status: 'pausado' },
    ['pendente', 'executando', 'falhou'],
  );
  console.log(JSON.stringify(job, null, 2));
}

async function status(config, argumentos) {
  const job = await consultarJob(config, validarJob(argumentos));
  console.log(JSON.stringify(job, null, 2));
}

async function main() {
  const [comando, ...argv] = process.argv.slice(2);
  if (!COMANDOS.has(comando)) {
    uso();
    throw new Error('Comando invalido');
  }
  const config = configuracao();
  const argumentos = lerArgumentos(argv);
  if (comando === 'create') return criar(config, argumentos);
  if (comando === 'resume') return retomar(config, argumentos);
  if (comando === 'run') return executarContinuo(config, argumentos);
  if (comando === 'pause') return pausar(config, argumentos);
  return status(config, argumentos);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Erro desconhecido');
  process.exitCode = 1;
});
