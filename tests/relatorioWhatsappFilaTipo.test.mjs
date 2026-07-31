import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260731153000_fila_relatorios_whatsapp_tipo.sql";
const edgePath = "supabase/functions/relatorio-admin-whatsapp/index.ts";
const requirePostgres = process.env.RELATORIO_FILA_REQUIRE_POSTGRES === "1";

function read(path) {
  assert.equal(existsSync(path), true, `${path} deve existir`);
  return readFileSync(path, "utf8");
}

function psql(containerName, input) {
  return spawnSync(
    "docker",
    [
      "exec",
      "--interactive",
      containerName,
      "psql",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
    ],
    { encoding: "utf8", input },
  );
}

test("migration forward-only separa unicidade diaria por tipo de relatorio", () => {
  const migration = read(migrationPath);
  assert.match(
    migration,
    /add column if not exists tipo_relatorio text/i,
  );
  assert.match(
    migration,
    /update public\.fila_relatorios_whatsapp[\s\S]*?tipo_relatorio = 'relatorio_admin'[\s\S]*?where tipo_relatorio is null/i,
  );
  assert.match(migration, /alter column tipo_relatorio set default/i);
  assert.match(migration, /alter column tipo_relatorio set not null/i);
  assert.match(
    migration,
    /check\s*\(tipo_relatorio in \('relatorio_admin', 'relatorio_comercial'\)\)/i,
  );
  assert.match(
    migration,
    /drop index if exists public\.idx_fila_relatorio_dia/i,
  );
  assert.match(
    migration,
    /create unique index[^;]+\(tipo_relatorio, unidade_id, jid, data_dia\)/i,
  );
});

test("cron grava tipo explicito nos inserts administrativo e comercial", () => {
  const edge = read(edgePath);
  const inicio = edge.indexOf("async function processarCron(");
  const fim = edge.indexOf("serve(async (req) => {", inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  const cron = edge.slice(inicio, fim);
  const inserts = [
    ...cron.matchAll(
      /\.from\(['"]fila_relatorios_whatsapp['"]\)[\s\S]*?\.insert\(\{([\s\S]*?)\}\);/g,
    ),
  ];
  assert.equal(inserts.length, 2);
  assert.match(inserts[0][1], /tipo_relatorio:\s*['"]relatorio_admin['"]/);
  assert.match(
    inserts[1][1],
    /tipo_relatorio:\s*['"]relatorio_comercial['"]/,
  );
});

test(
  "PostgreSQL aceita ADM e Comercial no mesmo JID/dia e deduplica cada tipo",
  { skip: !requirePostgres, timeout: 60_000 },
  () => {
    const dockerVersion = spawnSync(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      { encoding: "utf8" },
    );
    assert.equal(
      dockerVersion.status,
      0,
      `Docker/PostgreSQL obrigatório indisponível:\n${dockerVersion.stderr}`,
    );

    const image = process.env.COMERCIAL_EXP_POSTGRES_IMAGE ||
      "postgres:17-alpine";
    const imageInspection = spawnSync(
      "docker",
      ["image", "inspect", image],
      { encoding: "utf8" },
    );
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatória ausente (${image}):\n${imageInspection.stderr}`,
    );

    const containerName = `la-fila-relatorio-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      "docker",
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        containerName,
        "--env",
        "POSTGRES_PASSWORD=relatorio-fila",
        image,
      ],
      { encoding: "utf8" },
    );
    assert.equal(
      started.status,
      0,
      `não iniciou PostgreSQL:\n${started.stderr}`,
    );

    try {
      let ready = false;
      for (let tentativa = 0; tentativa < 30; tentativa += 1) {
        const logs = spawnSync(
          "docker",
          ["logs", containerName],
          { encoding: "utf8" },
        );
        const check = spawnSync(
          "docker",
          ["exec", containerName, "pg_isready", "--username", "postgres"],
          { encoding: "utf8" },
        );
        const initializationComplete = `${logs.stdout || ""}\n${
          logs.stderr || ""
        }`.includes(
          "PostgreSQL init process complete; ready for start up.",
        );
        if (initializationComplete && check.status === 0) {
          ready = true;
          break;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
      assert.equal(ready, true, "PostgreSQL não ficou pronto");

      const migration = read(migrationPath);
      const sql = `
        create schema if not exists public;
        create table public.fila_relatorios_whatsapp (
          id bigserial primary key,
          unidade_id uuid not null,
          unidade_nome text not null,
          jid text not null,
          grupo_nome text not null,
          texto text not null,
          status text not null default 'pendente',
          agendada_para timestamptz not null,
          enviada_em timestamptz,
          erro text,
          created_at timestamptz not null default now(),
          data_dia date not null default ((now() at time zone 'America/Sao_Paulo'))::date,
          tentativas integer not null default 0,
          ultima_tentativa_em timestamptz,
          constraint fila_relatorios_whatsapp_status_check
            check (status in ('pendente', 'enviando', 'enviada', 'erro'))
        );
        create unique index idx_fila_relatorio_dia
          on public.fila_relatorios_whatsapp (unidade_id, jid, data_dia);
        insert into public.fila_relatorios_whatsapp
          (unidade_id, unidade_nome, jid, grupo_nome, texto, agendada_para, data_dia)
        values
          ('00000000-0000-0000-0000-000000000001', 'Barra', 'grupo-1', 'Grupo', 'ADM', now(), date '2026-07-31');

        ${migration}

        insert into public.fila_relatorios_whatsapp
          (tipo_relatorio, unidade_id, unidade_nome, jid, grupo_nome, texto, agendada_para, data_dia)
        values
          ('relatorio_comercial', '00000000-0000-0000-0000-000000000001', 'Barra', 'grupo-1', 'Grupo', 'Comercial', now(), date '2026-07-31');

        do $$
        begin
          begin
            insert into public.fila_relatorios_whatsapp
              (tipo_relatorio, unidade_id, unidade_nome, jid, grupo_nome, texto, agendada_para, data_dia)
            values
              ('relatorio_admin', '00000000-0000-0000-0000-000000000001', 'Barra', 'grupo-1', 'Grupo', 'ADM duplicado', now(), date '2026-07-31');
            raise exception 'duplicata ADM foi aceita';
          exception when unique_violation then null;
          end;

          begin
            insert into public.fila_relatorios_whatsapp
              (tipo_relatorio, unidade_id, unidade_nome, jid, grupo_nome, texto, agendada_para, data_dia)
            values
              ('relatorio_comercial', '00000000-0000-0000-0000-000000000001', 'Barra', 'grupo-1', 'Grupo', 'Comercial duplicado', now(), date '2026-07-31');
            raise exception 'duplicata Comercial foi aceita';
          exception when unique_violation then null;
          end;

          begin
            insert into public.fila_relatorios_whatsapp
              (tipo_relatorio, unidade_id, unidade_nome, jid, grupo_nome, texto, agendada_para, data_dia)
            values
              ('invalido', '00000000-0000-0000-0000-000000000001', 'Barra', 'grupo-2', 'Grupo', 'Inválido', now(), date '2026-07-31');
            raise exception 'tipo inválido foi aceito';
          exception when check_violation then null;
          end;
        end;
        $$;

        select tipo_relatorio, count(*)
        from public.fila_relatorios_whatsapp
        group by tipo_relatorio
        order by tipo_relatorio;
      `;
      const result = psql(containerName, sql);
      assert.equal(
        result.status,
        0,
        `migration/teste PostgreSQL falhou:\n${result.stderr}\n${result.stdout}`,
      );
      assert.match(result.stdout, /relatorio_admin\s*\|\s*1/);
      assert.match(result.stdout, /relatorio_comercial\s*\|\s*1/);
    } finally {
      spawnSync("docker", ["rm", "--force", containerName], {
        encoding: "utf8",
      });
    }
  },
);
