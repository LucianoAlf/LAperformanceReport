import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260803090000_lia_alertas_privados_fase_a.sql',
);
const fixturePath = resolve(
  root,
  'tests/fixtures/lia_alertas_privados_fase_a_pg17.sql',
);
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const sql = read(migrationPath);
const fixture = read(fixturePath);

test('fase A nasce bloqueada e usa destinos governados', () => {
  assert.ok(sql, `migration ausente: ${migrationPath}`);
  assert.match(sql, /create table public\.lia_destinos_privados/i);
  assert.match(sql, /create table public\.lia_alertas_configuracao/i);
  assert.match(sql, /create table public\.lia_pesquisa_eventos/i);
  assert.match(sql, /create table public\.lia_alertas_privados/i);
  assert.match(sql, /alertas_producao_liberados[\s\S]*default false/i);
  assert.match(sql, /\(2,\s*'5521981278047'/i);
  assert.match(sql, /\(29,\s*'5521984695110'/i);
  assert.match(sql, /\(30,\s*'5521994696489'/i);
  assert.doesNotMatch(sql, /coalesce\([^)]*usuarios\.telefone/i);
});

test('tabelas privadas fecham RLS e ACL para clientes e agentes', () => {
  for (const tabela of [
    'lia_destinos_privados',
    'lia_alertas_configuracao',
    'lia_pesquisa_eventos',
    'lia_alertas_privados',
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${tabela} enable row level security`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on (?:table )?public\\.${tabela}[\\s\\S]*from public, anon, authenticated`, 'i'),
    );
  }
  assert.match(sql, /fabio_agent[\s\S]*lia_acesso_restrito/i);
  assert.match(sql, /sol_acesso_restrito[\s\S]*ml_jobs/i);
});

test('evento pertence ao operador original e nunca faz fanout', () => {
  assert.match(sql, /executado_por_usuario_id/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.doesNotMatch(sql, /usuario_id\s+in\s*\(\s*29\s*,\s*30/i);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /usuarios\.telefone/i);
});

test('produtor reage somente a conteúdo resolvido e usa a rodada imutável', () => {
  assert.match(sql, /create or replace function public\.fn_lia_evento_pesquisa_evasao\(\)/i);
  assert.match(sql, /new\.direcao\s*<>\s*'entrada'/i);
  assert.match(sql, /new\.resolution_status\s*<>\s*'resolvida'/i);
  assert.match(sql, /new\.substantividade\s+not in\s*\('conteudo_substantivo',\s*'opt_out'\)/i);
  assert.match(sql, /new\.analise_versao/i);
  assert.match(sql, /anterior\.versao\s*<\s*new\.analise_versao/i);
  assert.match(sql, /anterior\.status\s*=\s*'revisada'/i);
  assert.match(sql, /after insert or update of substantividade/i);
});

test('renderização é determinística e não recebe conteúdo privado', () => {
  assert.match(sql, /create or replace function public\.fn_lia_renderizar_alerta_pesquisa\s*\(/i);
  assert.match(sql, /Resposta recebida — Pesquisa de evasão/i);
  assert.match(sql, /Nova rodada após revisão/i);
  assert.match(sql, /Família recusou novos contatos/i);
  assert.match(sql, /\/app\/sucesso-aluno/i);
  assert.doesNotMatch(
    sql,
    /fn_lia_renderizar_alerta_pesquisa\s*\([^)]*(?:resposta|transcricao|telefone|motivo)/i,
  );
});

test('idempotência separa resposta de opt-out na mesma rodada', () => {
  assert.match(sql, /on conflict do nothing/i);
  assert.match(sql, /resposta_nova:%s:%s/i);
  assert.match(sql, /rodada_nova_pos_revisao:%s:%s/i);
  assert.match(sql, /opt_out:%s:%s/i);
  assert.match(sql, /lia_pesquisa_eventos_resposta_rodada_uidx/i);
  assert.match(sql, /lia_pesquisa_eventos_opt_out_rodada_uidx/i);
});

test('expurgo remove somente snapshots terminais depois de 30 dias', () => {
  assert.match(sql, /create or replace function public\.expurgar_lia_alertas_privados\(\)/i);
  assert.match(sql, /status in \('enviado', 'falha', 'resultado_ambiguo', 'fila_administrativa'\)/i);
  assert.match(sql, /interval '30 days'/i);
  assert.match(sql, /destino_snapshot = null[\s\S]*mensagem_renderizada = null/i);
  assert.match(sql, /lia-alertas-privados-expurgo-diario/i);
});

test('claim e desfechos sao atomicos, fechados e exclusivos do service role', () => {
  assert.match(sql, /create or replace function public\.claim_lia_alerta_privado\s*\(/i);
  assert.match(sql, /auth\.role\(\)\s+is distinct from\s+'service_role'/i);
  assert.match(sql, /for update(?:\s+of\s+\w+)?\s+skip locked/i);
  assert.match(sql, /America\/Sao_Paulo/i);
  assert.match(sql, /interval '15 minutes'/i);
  assert.match(sql, /processamento_abandonado/i);
  assert.match(sql, /create or replace function public\.concluir_lia_alerta_privado\s*\(/i);
  assert.match(sql, /create or replace function public\.falhar_lia_alerta_privado\s*\(/i);
  assert.match(sql, /resultado_ambiguo/i);
  assert.doesNotMatch(sql, /set\s+status\s*=\s*'pendente'[\s\S]*resultado_ambiguo/i);
});

test('piloto e fila administrativa preservam o isolamento', () => {
  assert.match(sql, /create or replace function public\.enfileirar_lia_alerta_piloto\s*\(/i);
  assert.match(sql, /pesquisa\.modo_teste\s*=\s*true/i);
  assert.match(sql, /fn_lia_criar_evento_alerta\([\s\S]*'teste'[\s\S]*\b2\b/i);
  assert.match(sql, /create or replace function public\.listar_lia_alertas_pendencias_administrativas\s*\(/i);
  const inicioFila = sql.search(
    /create or replace function public\.listar_lia_alertas_pendencias_administrativas\s*\(/i,
  );
  const fimFila = sql.indexOf('$function$;', inicioFila) + '$function$;'.length;
  const funcaoFila = sql.slice(inicioFila, fimFila);
  assert.doesNotMatch(
    funcaoFila,
    /destino_snapshot|mensagem_renderizada|resposta_texto|transcricao/i,
  );
});

test('transporte paralelo rejeitado não permanece no pacote', () => {
  for (const rejected of [
    'scripts/process_lia_alert_queue.py',
    'tests/test_process_lia_alert_queue.py',
    'scripts/systemd/lia-alertas-privados.service',
    'scripts/systemd/lia-alertas-privados.timer',
    'scripts/lia-whatsapp-bridge/alert-single-message.js',
    'scripts/lia-whatsapp-bridge/bridge-alert-single-message.patch',
    'tests/liaWhatsappAlertSingleMessage.test.mjs',
  ]) {
    assert.equal(
      existsSync(resolve(root, rejected)),
      false,
      `${rejected} deve sair`,
    );
  }
});

test('fixture PG17 contém provas executáveis de isolamento e idempotência', () => {
  assert.ok(fixture, `fixture ausente: ${fixturePath}`);
  for (const evidence of [
    /has_table_privilege[\s\S]*authenticated/i,
    /has_table_privilege[\s\S]*service_role/i,
    /uma rodada nao pode gerar dois alertas/i,
    /nao pode haver notificacao cruzada/i,
    /teste comum nao pode entrar na outbox produtiva/i,
    /dois workers nao podem reclamar a mesma entrega/i,
    /resultado ambiguo nao pode voltar a pendente/i,
    /piloto deve forcar o destino governado do Alf/i,
    /LIA_ALERTAS_PRIVADOS_FASE_A_PG17_OK/,
  ]) {
    assert.match(fixture, evidence);
  }
});

test(
  'fixture executável passa em PostgreSQL 17 isolado',
  { skip: !process.env.PESQUISA_EVASAO_PG17_CONTAINER },
  async () => {
    const { runPesquisaEvasaoPg17Fixture } = await import(
      './helpers/runPesquisaEvasaoPg17Fixture.mjs'
    );
    const result = runPesquisaEvasaoPg17Fixture({
      container: process.env.PESQUISA_EVASAO_PG17_CONTAINER,
      fixturePath: '/workspace/tests/fixtures/lia_alertas_privados_fase_a_pg17.sql',
    });
    assert.match(result.stdout, /LIA_ALERTAS_PRIVADOS_FASE_A_PG17_OK/);
  },
);
