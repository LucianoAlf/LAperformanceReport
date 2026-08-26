import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260827092000_pesquisa_evasao_enfileirar_repescagem.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('janela util e resolvida em BRT, nunca em UTC', () => {
  assert.ok(existsSync(migrationUrl), 'migration do enfileiramento deve existir');
  const source = sql();
  assert.match(source, /create or replace function public\.proximo_horario_envio_repescagem/i);
  assert.match(source, /at time zone 'America\/Sao_Paulo'/);
  assert.match(source, /time '09:00'/);
  assert.match(source, /time '19:00'/);
  // isodow >= 6 é sábado e domingo
  assert.match(source, /isodow[\s\S]{0,40}>=\s*6/i);
});

test('intervalo entre envios e aleatorio entre 90 e 240 segundos', () => {
  const source = sql();
  assert.match(source, /90\s*\+\s*floor\s*\(\s*random\s*\(\s*\)\s*\*\s*151\s*\)/i);
});

test('teto diario de 30 empurra o excedente para o proximo dia util', () => {
  const source = sql();
  assert.match(source, /exit when v_no_dia\s*<\s*30/i);
  assert.match(source, /agendada_para at time zone 'America\/Sao_Paulo'\)::date/i);
});

test('item 3 do review: teto diario conta tudo que ocupa o dia, so exclui cancelada (nao so pendente/enviando)', () => {
  const source = sql();
  const inicio = source.indexOf('Teto diario');
  const bloco = source.slice(inicio, source.indexOf('exit when v_no_dia', inicio) + 40);
  assert.match(bloco, /f\.status\s*<>\s*'cancelada'/i);
  assert.doesNotMatch(bloco, /f\.status in \('pendente','enviando'\)/i);
});

test('todas as guardas de recusa estao presentes com motivo proprio', () => {
  const source = sql();
  for (const motivo of [
    'pesquisa_inexistente',
    'opt_out',
    'primeiro_toque_nao_confirmado',
    'ja_respondeu',
    'muito_cedo',
    'ja_enfileirada',
    'telefone_ja_respondeu',
    'telefone_ausente',
    'publico_indeterminado',
    'template_ausente',
    'erro_ao_enfileirar',
  ]) {
    assert.match(source, new RegExp(`'${motivo}'`), `motivo ${motivo} deve existir`);
  }
});

test('primeiro toque e exigido pela POSITIVA, nao por recusa do incerto', () => {
  const source = sql();
  // a CHECK admite nao_enviado/enviando/falhou; listar o que vale evita que um
  // estado novo passe a ser aceito por omissao
  assert.match(source, /envio_status not in \('enviado','entregue','lido'\)/i);
  assert.doesNotMatch(source, /envio_status\s*=\s*'incerto'/i);
});

test('guarda de telefone compartilhado compara os 8 ultimos digitos', () => {
  const source = sql();
  assert.match(source, /right\(regexp_replace\([\s\S]{0,120}, 8\)/i);
  assert.match(source, /outra\.resposta_status <> 'sem_resposta'/i);
});

test('publico vem do template do 1o envio, nunca de telefone ou idade', () => {
  const source = sql();
  assert.match(source, /from public\.pesquisa_evasao_templates t\s*\n\s*where t\.id = v_p\.template_id/i);
  assert.doesNotMatch(source, /data_nascimento/i);
});

test('unidade_id da fila e derivado da pesquisa, nunca do chamador', () => {
  const source = sql();
  assert.match(source, /v_p\.unidade_id/);
  assert.doesNotMatch(source, /p_unidade_id/);
});

test('funcoes nao ficam executaveis por anon', () => {
  const source = sql();
  assert.match(source, /revoke all on function public\.enfileirar_repescagem_evasao\(uuid\[\]\)\s*\n?\s*from public, anon, authenticated/i);
  assert.match(source, /revoke all on function public\.proximo_horario_envio_repescagem\(timestamptz\)\s*\n?\s*from public, anon, authenticated/i);
});

test('enfileiramento serializa concorrentes com advisory lock de transacao', () => {
  const source = sql();
  assert.match(source, /pg_advisory_xact_lock/);
  assert.doesNotMatch(source, /pg_advisory_lock\s*\(/);
});

const workerUrl = new URL(
  '../supabase/migrations/20260827093000_pesquisa_evasao_fila_worker_rpcs.sql',
  import.meta.url,
);
const workerSql = () => (existsSync(workerUrl) ? readFileSync(workerUrl, 'utf8') : '');

test('claim toma a vez de forma atomica, sem SELECT-entao-UPDATE', () => {
  assert.ok(existsSync(workerUrl), 'migration do worker deve existir');
  const source = workerSql();
  assert.match(source, /update public\.pesquisa_evasao_envios_fila f\s*\n\s*set\s*\n?\s*status = 'enviando'/i);
  assert.match(source, /for update skip locked/i);
  assert.match(source, /returning f\.\* into v_job/i);
});

test('item 4 do review: claim impoe espacamento de 60s entre envios, senao um backlog vira rajada', () => {
  const source = workerSql();
  const inicio = source.indexOf('function public.claim_repescagem_evasao_job');
  const corpo = source.slice(inicio, source.indexOf('$function$;', inicio));
  assert.match(corpo, /not exists\s*\(\s*select 1 from public\.pesquisa_evasao_envios_fila r/i);
  assert.match(corpo, /r\.status\s*=\s*'enviada'/i);
  assert.match(corpo, /r\.enviada_em\s*>\s*now\(\)\s*-\s*interval\s*'60 seconds'/i);
});

test('lease vencido vira falhou e NUNCA volta para pendente', () => {
  const source = workerSql();
  const bloco = source.slice(
    source.indexOf('lease_expires_at <= now()') - 700,
    source.indexOf('lease_expires_at <= now()') + 60,
  );
  assert.match(bloco, /set status = 'falhou'/i);
  assert.match(bloco, /LEASE_EXPIRADO/);
  assert.doesNotMatch(bloco, /set status = 'pendente'/i);
  assert.doesNotMatch(bloco, /retry_wait/i);
});

test('conclusao e falha exigem o worker dono da linha', () => {
  const source = workerSql();
  const ocorrencias = source.match(/worker_id = p_worker_id and status = 'enviando'/gi) ?? [];
  assert.ok(ocorrencias.length >= 1, 'conclusao deve casar worker e status');
  assert.match(source, /REPESCAGEM_CONCLUSAO_INVALIDA/);
  assert.match(source, /REPESCAGEM_FALHA_INVALIDA/);
});

test('falhar escreve com o guard de posse no proprio UPDATE, sem SELECT-entao-UPDATE', () => {
  const source = workerSql();
  const inicio = source.indexOf('function public.falhar_repescagem_evasao_job');
  const corpo = source.slice(inicio, source.indexOf('$function$;', inicio));
  assert.match(corpo, /where f\.id = p_id\s*\n\s*and f\.worker_id = p_worker_id\s*\n\s*and f\.status = 'enviando'/i);
  assert.doesNotMatch(corpo, /select tentativas, max_tentativas into/i);
  // o CASE le a coluna da linha, nao uma variavel lida antes
  assert.match(corpo, /f\.tentativas >= f\.max_tentativas/);
});

test('cancelar so age em linha pendente e so por usuario interno', () => {
  const source = workerSql();
  assert.match(source, /fn_pesquisa_evasao_usuario_interno_ativo\(\)/);
  assert.match(source, /and status = 'pendente'/i);
  assert.match(source, /REPESCAGEM_CANCELAMENTO_INVALIDO/);
});

test('item 2 do review: existe RPC dedicada para revalidar telefone compartilhado no disparo, exclusiva de service_role', () => {
  const source = workerSql();
  assert.match(source, /create or replace function public\.existe_telefone_compartilhado_respondido/i);
  assert.match(source, /right\(regexp_replace\([\s\S]{0,120}, 8\)/i);
  assert.match(source, /outra\.resposta_status <> 'sem_resposta'/i);
  assert.match(source, /revoke all on function public\.existe_telefone_compartilhado_respondido\(uuid\)/i);
  assert.doesNotMatch(
    source,
    /grant execute on function public\.existe_telefone_compartilhado_respondido[^;]*authenticated/i,
  );
});

test('rpcs de worker sao exclusivas de service_role e nunca de anon', () => {
  const source = workerSql();
  assert.match(source, /auth\.role\(\) is distinct from 'service_role'/i);
  for (const fn of [
    'claim_repescagem_evasao_job',
    'concluir_repescagem_evasao_job',
    'falhar_repescagem_evasao_job',
    'cancelar_repescagem_evasao',
  ]) {
    assert.match(source, new RegExp(`revoke all on function public\\.${fn}`, 'i'));
  }
  assert.doesNotMatch(source, /grant execute on function public\.claim_repescagem_evasao_job[^;]*authenticated/i);
});
