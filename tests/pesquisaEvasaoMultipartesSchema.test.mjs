import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260801190000_pesquisa_evasao_multipartes_constraints.sql',
);
const activationPath = resolve(
  repoRoot,
  'supabase/migrations/20260801190500_pesquisa_evasao_multipartes_ativacao_novas.sql',
);
const edgePath = resolve(
  repoRoot,
  'supabase/functions/webhook-whatsapp-inbox/index.ts',
);
const modulePath = resolve(
  repoRoot,
  'supabase/functions/webhook-whatsapp-inbox/evasao.ts',
);

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('migration mantém existentes no legado e adiciona opt-in multipartes', () => {
  const sql = read(migrationPath);
  assert.ok(sql, 'migration de constraints multipartes ausente');
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+resposta_ingestao_versao\s+text\s+not\s+null\s+default\s+'legado_v1'/i);
  assert.match(sql, /check\s*\(\s*resposta_ingestao_versao\s+in\s*\(\s*'legado_v1'\s*,\s*'multipartes_v2'/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao[\s\S]*resposta_ingestao_versao\s*=\s*'multipartes_v2'/i);
});

test('schema impede duas pesquisas produtivas abertas no mesmo telefone e caixa', () => {
  const sql = read(migrationPath);
  assert.match(
    sql,
    /create\s+unique\s+index\s+pesquisa_evasao_aberta_telefone_uidx[\s\S]*\(\s*caixa_id\s*,\s*telefone_destino_snapshot\s*\)[\s\S]*where[\s\S]*modo_teste\s*=\s*false[\s\S]*resposta_status\s+in\s*\(\s*'sem_resposta'\s*,\s*'coletando'/i,
  );
});

test('mensagens têm enums fechados, deduplicação e conteúdo append-only', () => {
  const sql = read(migrationPath);
  assert.match(sql, /resolution_status\s+in\s*\(\s*'resolvida'\s*,\s*'sem_pesquisa'\s*,\s*'ambigua'/i);
  assert.match(sql, /substantividade\s+in\s*\([\s\S]*'adiamento'[\s\S]*'abertura'[\s\S]*'conteudo_substantivo'[\s\S]*'opt_out'[\s\S]*'indeterminado'/i);
  assert.match(sql, /pesquisa_evasao_mensagens_provider_uidx/i);
  assert.match(sql, /before\s+update\s+or\s+delete\s+on\s+public\.pesquisa_evasao_mensagens/i);
  assert.match(sql, /conteudo original da mensagem de evasao e imutavel/i);
});

test('nova versão de análise é preparada por RPC exclusiva do service role', () => {
  const sql = read(migrationPath);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.preparar_nova_analise_pesquisa_evasao/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /revoke\s+all[\s\S]*preparar_nova_analise_pesquisa_evasao[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(sql, /grant\s+execute[\s\S]*preparar_nova_analise_pesquisa_evasao[\s\S]*to\s+service_role/i);
});

test('ativação futura muda apenas o default das novas pesquisas', () => {
  const sql = read(activationPath);
  assert.ok(sql, 'migration de ativação das novas pesquisas ausente');
  assert.match(sql, /alter\s+column\s+resposta_ingestao_versao\s+set\s+default\s+'multipartes_v2'/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao/i);
});

test('webhook usa módulo multipartes e mantém caminho legado separado', () => {
  const edge = read(edgePath);
  const module = read(modulePath);
  assert.match(edge, /resolverPesquisa\(/);
  assert.match(edge, /ingerirEvento\(/);
  assert.match(edge, /handleRespostaEvasaoLegado\(/);
  assert.match(module, /respostaIngestaoVersao\s*===\s*["']legado_v1["']/);
  assert.match(
    module,
    /eq\(["']caixa_id["'],\s*evento\.caixaId\)[\s\S]*eq\(["']telefone_destino_snapshot["'],\s*evento\.telefoneNormalizado\)/,
    'o fallback por telefone deve sempre ser escopado pela caixa',
  );
  assert.match(
    module,
    /eq\(["']caixa_id["'],\s*evento\.caixaId\)[\s\S]*eq\(["']provider_message_id["'],\s*evento\.quotedProviderMessageId\)/,
    'a mensagem citada deve ser resolvida dentro da caixa correta',
  );
  assert.doesNotMatch(module, /Tentativa 2|qualquer estado ativo/i);
});
