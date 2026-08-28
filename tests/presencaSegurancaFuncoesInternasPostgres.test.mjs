import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationName = () => readdirSync('supabase/migrations')
  .find((name) => name.endsWith('_presenca_hardening_funcoes_internas.sql'));

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function psql(container, sql) {
  const result = docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function waitPostgres(container) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('Postgres nao iniciou');
}

test('migration fecha chamada direta das funcoes internas de presenca', () => {
  const name = migrationName();
  assert.ok(name, 'migration presenca_hardening_funcoes_internas ausente');
  const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');

  for (const signature of [
    'fn_aula_alunos_emusys_casar_aluno()',
    'fn_completar_origem_retificacao_presenca()',
    'fn_fabio_chama_edge(uuid)',
    'trg_atualiza_projecao_por_presenca()',
    'trg_fabio_fila_dispara()',
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature.replace(/[()]/gu, '\\$&')}[\\s\\S]*?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'iu'),
      `${signature} continua exposta`,
    );
    assert.match(
      sql,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature.replace(/[()]/gu, '\\$&')}[\\s\\S]*?to\\s+service_role`, 'iu'),
      `${signature} perdeu a porta service-only`,
    );
  }
});

test('ACL fecha anon sem quebrar trigger nem service role', { timeout: 120_000 }, async (t) => {
  const name = migrationName();
  assert.ok(name, 'migration presenca_hardening_funcoes_internas ausente');
  if (docker(['info']).status !== 0) return t.skip('Docker indisponivel');

  const container = `la-presenca-acl-interna-${process.pid}`;
  assert.equal(docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]).status, 0);

  try {
    await waitPostgres(container);
    psql(container, String.raw`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      create table public.presenca_acl_fixture(id integer primary key, tocado boolean default false);
      grant insert, select on public.presenca_acl_fixture to authenticated;

      create function public.fn_aula_alunos_emusys_casar_aluno()
      returns trigger language plpgsql security definer as $$ begin new.tocado := true; return new; end $$;
      create function public.fn_completar_origem_retificacao_presenca()
      returns trigger language plpgsql security definer as $$ begin return new; end $$;
      create function public.fn_fabio_chama_edge(uuid)
      returns void language plpgsql security definer as $$ begin null; end $$;
      create function public.trg_atualiza_projecao_por_presenca()
      returns trigger language plpgsql security definer as $$ begin return new; end $$;
      create function public.trg_fabio_fila_dispara()
      returns trigger language plpgsql security definer as $$ begin return new; end $$;

      create trigger presenca_acl_fixture_trigger before insert on public.presenca_acl_fixture
      for each row execute function public.fn_aula_alunos_emusys_casar_aluno();
    `);

    psql(container, readFileSync(`supabase/migrations/${name}`, 'utf8'));

    const acl = JSON.parse(psql(container, String.raw`
      select json_build_object(
        'anon_trigger', has_function_privilege('anon','public.fn_aula_alunos_emusys_casar_aluno()','execute'),
        'auth_trigger', has_function_privilege('authenticated','public.fn_aula_alunos_emusys_casar_aluno()','execute'),
        'service_trigger', has_function_privilege('service_role','public.fn_aula_alunos_emusys_casar_aluno()','execute'),
        'anon_dispatch', has_function_privilege('anon','public.fn_fabio_chama_edge(uuid)','execute'),
        'service_dispatch', has_function_privilege('service_role','public.fn_fabio_chama_edge(uuid)','execute')
      );
    `));
    assert.deepEqual(acl, {
      anon_trigger: false,
      auth_trigger: false,
      service_trigger: true,
      anon_dispatch: false,
      service_dispatch: true,
    });

    assert.equal(psql(container, String.raw`
      set role authenticated;
      insert into public.presenca_acl_fixture(id) values (1);
      reset role;
      select tocado from public.presenca_acl_fixture where id=1;
    `).split(/\r?\n/u).at(-1), 't');
    psql(container, 'set role service_role; select public.fn_fabio_chama_edge(gen_random_uuid()); reset role;');
  } finally {
    docker(['rm', '-f', container]);
  }
});
