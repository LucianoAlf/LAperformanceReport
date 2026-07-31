import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730161312_pesquisa_evasao_movimentacao_canonica.sql',
);
const edgePath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/index.ts',
);
const pagePath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
);
const webhookPath = resolve(
  repoRoot,
  'supabase/functions/webhook-whatsapp-inbox/index.ts',
);

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('pesquisa de evasao referencia a movimentacao administrativa canonica', () => {
  const migration = readOptional(migrationPath);

  assert.ok(migration, 'migration canonica da pesquisa de evasao ainda nao existe');
  assert.match(
    migration,
    /drop constraint if exists pesquisa_evasao_evasao_id_fkey/i,
  );
  assert.match(
    migration,
    /foreign key\s*\(evasao_id\)\s*references\s+public\.movimentacoes_admin\s*\(id\)/i,
  );
  assert.doesNotMatch(migration, /references\s+public\.evasoes_v2/i);
});

test('edge V2 separa destinos, valida a movimentacao e usa a caixa correta', () => {
  const edge = readOptional(edgePath);

  assert.doesNotMatch(edge, /telefone_override/i);
  assert.match(edge, /const\s+CAIXA_SUCESSO_ID\s*=\s*3/i);
  assert.match(edge, /caixa_id:\s*CAIXA_SUCESSO_ID/i);
  assert.match(edge, /caixaId:\s*claim\.caixa_id/i);
  assert.match(edge, /is_movimentacao_admin_retencao_valida/i);
  assert.match(edge, /resolverDestinoPesquisa\s*\(/i);
  assert.match(
    edge,
    /telefoneSnapshot:\s*movimentacao\.telefone_snapshot/i,
  );
});

test('tela nunca converte teste sem numero em envio real', () => {
  const page = readOptional(pagePath);

  assert.match(page, /modoTeste\s*&&\s*!telefoneTeste\.trim\(\)/i);
  assert.match(page, /Informe o n[uú]mero/i);
});

test('webhook nao associa resposta a pesquisa de outro telefone', () => {
  const webhook = readOptional(webhookPath);
  const start = webhook.indexOf('async function handleRespostaEvasao');
  const end = webhook.indexOf('\n}', start);
  const handler = webhook.slice(start, end === -1 ? webhook.length : end + 2);

  assert.notEqual(start, -1, 'handler de resposta de evasao ausente');
  assert.doesNotMatch(
    handler,
    /Tentativa 2[\s\S]*estado ativo encontrado para outro telefone/i,
  );
  assert.doesNotMatch(
    handler,
    /\.eq\('estado',\s*'aguardando_resposta_evasao'\)[\s\S]*\.limit\(1\)[\s\S]*\.maybeSingle\(\)/i,
  );
});
