import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730134500_pesquisa_evasao_movimentacao_canonica.sql';
const edgePath = 'supabase/functions/enviar-pesquisa-evasao/index.ts';
const pagePath = 'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx';
const webhookPath = 'supabase/functions/webhook-whatsapp-inbox/index.ts';

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

// Compatibilidade transitoria do fluxo interno legado. `telefone_override`
// nao representa o request publico V2 e deve ser removido na Task 3.
test('edge legado ainda aceita telefone_override interno e usa a caixa correta', () => {
  const edge = readOptional(edgePath);

  assert.match(edge, /telefone_override\??:\s*string/i);
  assert.match(edge, /const\s+CAIXA_SUCESSO_ID\s*=\s*3/i);
  assert.match(edge, /caixaId:\s*CAIXA_SUCESSO_ID/i);
  assert.match(edge, /resolverTelefonePesquisa\s*\(/i);
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
