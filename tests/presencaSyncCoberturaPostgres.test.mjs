import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const IMAGE = process.env.PRESENCA_SYNC_POSTGRES_IMAGE || 'postgres:17-alpine';
const UNIDADE = '10000000-0000-0000-0000-000000000001';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function dockerAsync(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`docker ${args.join(' ')} falhou\n${stdout}\n${stderr}`));
    });
    child.stdin.end(input);
  });
}

function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'], {
    input: sql,
  });
}

function waitForPostgres(container) {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ], { encoding: 'utf8' });
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

function migrationCobertura() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_sync_cobertura_idempotente\.sql$/u.test(name));
  assert.ok(matches.length <= 1, `mais de uma migration de cobertura: ${matches.join(', ')}`);
  return matches.length === 1 ? join(MIGRATIONS, matches[0]) : null;
}

function migrationSaude() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_sync_saude_operacional\.sql$/u.test(name));
  assert.equal(matches.length, 1, 'migration de saude operacional ausente ou duplicada');
  return join(MIGRATIONS, matches[0]);
}

function migrationSaudeTipoNomeHotfix() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_sync_saude_tipo_nome_hotfix\.sql$/u.test(name));
  assert.equal(matches.length, 1, 'hotfix do tipo do nome na saude operacional ausente ou duplicado');
  return join(MIGRATIONS, matches[0]);
}

function trechoGateRelatorio() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_sync_crons_operacional_e_backlog\.sql$/u.test(name));
  assert.equal(matches.length, 1, 'migration dos crons ausente ou duplicada');
  const sql = readFileSync(join(MIGRATIONS, matches[0]), 'utf8');
  const prefixo = sql.split('-- Aposenta as janelas sobrepostas')[0];
  assert.match(prefixo, /fn_enfileirar_relatorio_presenca_se_coberto_v1/u);
  return `${prefixo}\ncommit;`;
}

function asService(sql) {
  return `select set_config('request.jwt.claim.role', 'service_role', false);\n${sql}`;
}

test('ledger de sync controla lease, heartbeat, conclusao, falha e publicacao', async () => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu);
  const container = `la-presenca-sync-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, String.raw`
      create extension if not exists pgcrypto;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      -- Espelha o tipo real de producao. Funcoes RETURNS TABLE(... text ...)
      -- precisam converter explicitamente este varchar no RETURN QUERY.
      create table public.unidades(id uuid primary key, nome varchar(100) not null);
      insert into public.unidades values ('${UNIDADE}', 'Barra');
      create table public.aulas_emusys(
        id uuid primary key default gen_random_uuid(),
        unidade_id uuid not null references public.unidades(id),
        data_aula date not null,
        data_hora_fim timestamptz not null,
        cancelada boolean not null default false
      );
      insert into public.aulas_emusys(unidade_id, data_aula, data_hora_fim)
      values ('${UNIDADE}', '2026-08-25', '2026-08-25 18:00:00-03');
      create function public.fn_enfileirar_relatorio_presenca(date, boolean)
      returns jsonb language sql as $$
        select jsonb_build_object('ok', true, 'enfileirado', true)
      $$;
    `);

    const migration = migrationCobertura();
    if (migration && existsSync(migration)) psql(container, readFileSync(migration, 'utf8'));
    psql(container, readFileSync(migrationSaude(), 'utf8'));
    psql(container, readFileSync(migrationSaudeTipoNomeHotfix(), 'utf8'));
    psql(container, trechoGateRelatorio());

    const relatorioBloqueado = JSON.parse(psql(container, String.raw`
      select public.fn_enfileirar_relatorio_presenca_se_coberto_v1('2026-08-25');
    `));
    assert.equal(relatorioBloqueado.ok, false);
    assert.equal(relatorioBloqueado.bloqueado, 'cobertura_presenca_incompleta');

    const primeira = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE}', 'presenca', '2026-08-25',
        '20000000-0000-0000-0000-000000000001', 120
      );
    `)).split('\n').at(-1));
    assert.equal(primeira.adquirida, true);
    assert.match(primeira.run_id, /^[a-f0-9-]{36}$/u);

    const segunda = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE}', 'presenca', '2026-08-25',
        '20000000-0000-0000-0000-000000000002', 120
      );
    `)).split('\n').at(-1));
    assert.equal(segunda.adquirida, false);
    assert.equal(segunda.motivo, 'lease_ativo');

    const interrompida = JSON.parse(psql(container, asService(String.raw`
      select public.fn_presenca_dados_frescos_v1('${UNIDADE}', '2026-08-25');
    `)).split('\n').at(-1));
    assert.equal(interrompida.status, 'iniciada');
    assert.equal(interrompida.publicavel, false);

    const heartbeat = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_heartbeat_v1(
        '${primeira.run_id}',
        '{"paginas_lidas":2,"aulas_lidas":14,"presencas_lidas":20}'::jsonb
      );
    `)).split('\n').at(-1));
    assert.equal(heartbeat.ok, true);
    assert.equal(heartbeat.paginas_lidas, 2);

    const concluida = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_finalizar_v1(
        '${primeira.run_id}', 'concluida',
        '${'a'.repeat(64)}',
        '{"paginas_lidas":3,"aulas_lidas":18,"presencas_lidas":27}'::jsonb,
        null
      );
    `)).split('\n').at(-1));
    assert.equal(concluida.ok, true);
    assert.equal(concluida.status, 'concluida');
    assert.equal(concluida.publicavel, true);

    const fresca = JSON.parse(psql(container, asService(String.raw`
      select public.fn_presenca_dados_frescos_v1('${UNIDADE}', '2026-08-25');
    `)).split('\n').at(-1));
    assert.equal(fresca.status, 'concluida');
    assert.equal(fresca.publicavel, true);
    assert.equal(fresca.snapshot_hash, 'a'.repeat(64));

    const relatorioLiberado = JSON.parse(psql(container, String.raw`
      select public.fn_enfileirar_relatorio_presenca_se_coberto_v1('2026-08-25');
    `));
    assert.deepEqual(relatorioLiberado, { ok: true, enfileirado: true });

    const saude = JSON.parse(psql(container, asService(String.raw`
      select row_to_json(s) from public.get_saude_cobertura_presenca_v1('2026-08-25') s;
    `)).split('\n').at(-1));
    assert.equal(saude.unidade_nome, 'Barra');
    assert.equal(saude.publicavel, true);
    assert.equal(saude.lease_expirada, false);
    assert.equal(saude.relatorio_bloqueado, false);
    assert.ok(saude.tentativas_deduplicadas >= 1);

    const idempotente = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE}', 'presenca', '2026-08-25',
        '20000000-0000-0000-0000-000000000001', 120
      );
    `)).split('\n').at(-1));
    assert.equal(idempotente.adquirida, false);
    assert.equal(idempotente.motivo, 'request_id_repetido');

    const chamadasConcorrentes = [11, 12, 13].map((sufixo) => dockerAsync([
      'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA',
    ], asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE}', 'presenca', '2026-08-26',
        '20000000-0000-0000-0000-0000000000${sufixo}', 120
      );
    `)));
    const concorrentes = (await Promise.all(chamadasConcorrentes))
      .map((output) => JSON.parse(output.split('\n').at(-1)));
    assert.equal(concorrentes.filter((item) => item.adquirida).length, 1);
    assert.equal(concorrentes.filter((item) => !item.adquirida && item.motivo === 'lease_ativo').length, 2);

    const estadoConcorrente = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'ativas', count(*) filter (where status = 'iniciada'),
        'abortadas', count(*) filter (where status = 'abortada')
      ) from public.presenca_sync_execucoes
      where unidade_id = '${UNIDADE}' and modo = 'presenca' and data_alvo = '2026-08-26';
    `));
    assert.deepEqual(estadoConcorrente, { ativas: 1, abortadas: 2 });

    const expiravel = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE}', 'agenda', '2026-08-25',
        '20000000-0000-0000-0000-000000000003', 120
      );
    `)).split('\n').at(-1));
    assert.equal(expiravel.adquirida, true);
    psql(container, `update public.presenca_sync_cobertura set lease_ate = now() - interval '1 second' where run_id = '${expiravel.run_id}';`);

    const retomada = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_iniciar_v1(
        '${UNIDADE}', 'agenda', '2026-08-25',
        '20000000-0000-0000-0000-000000000004', 120
      );
    `)).split('\n').at(-1));
    assert.equal(retomada.adquirida, true);
    assert.notEqual(retomada.run_id, expiravel.run_id);

    const falhou = JSON.parse(psql(container, asService(String.raw`
      select public.presenca_sync_finalizar_v1(
        '${retomada.run_id}', 'falhou', null,
        '{"paginas_lidas":1,"aulas_lidas":2,"presencas_lidas":0}'::jsonb,
        'EMUSYS_TIMEOUT'
      );
    `)).split('\n').at(-1));
    assert.equal(falhou.status, 'falhou');
    assert.equal(falhou.publicavel, false);

    const eventos = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'iniciada', count(*) filter (where tipo = 'iniciada'),
        'heartbeat', count(*) filter (where tipo = 'heartbeat'),
        'concluida', count(*) filter (where tipo = 'concluida'),
        'falhou', count(*) filter (where tipo = 'falhou'),
        'abortada', count(*) filter (where tipo = 'abortada'),
        'deduplicada', count(*) filter (where tipo = 'deduplicada')
      ) from public.presenca_sync_eventos;
    `));
    assert.ok(eventos.iniciada >= 3);
    assert.equal(eventos.heartbeat, 1);
    assert.equal(eventos.concluida, 1);
    assert.equal(eventos.falhou, 1);
    assert.ok(eventos.abortada >= 1);
    assert.ok(eventos.deduplicada >= 2);

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'anon_exec', has_function_privilege('anon', 'public.presenca_sync_iniciar_v1(uuid,text,date,uuid,integer)', 'execute'),
        'auth_exec', has_function_privilege('authenticated', 'public.presenca_sync_iniciar_v1(uuid,text,date,uuid,integer)', 'execute'),
        'service_exec', has_function_privilege('service_role', 'public.presenca_sync_iniciar_v1(uuid,text,date,uuid,integer)', 'execute'),
        'anon_health_exec', has_function_privilege('anon', 'public.get_saude_cobertura_presenca_v1(date)', 'execute'),
        'auth_health_exec', has_function_privilege('authenticated', 'public.get_saude_cobertura_presenca_v1(date)', 'execute'),
        'service_event_update', has_table_privilege('service_role', 'public.presenca_sync_eventos', 'update'),
        'service_event_delete', has_table_privilege('service_role', 'public.presenca_sync_eventos', 'delete')
      );
    `));
    assert.deepEqual(acl, {
      anon_exec: false,
      auth_exec: false,
      service_exec: true,
      anon_health_exec: false,
      auth_health_exec: true,
      service_event_update: false,
      service_event_delete: false,
    });
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
