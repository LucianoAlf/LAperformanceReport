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
