import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('alerta aponta para Pesquisas/Evasao e a tela honra o destino', () => {
  const migration = read('supabase/migrations/20260803133000_lia_alertas_link_evasao.sql');
  const page = read('src/components/App/SucessoCliente/SucessoClientePage.tsx');
  const acompanhamento = read('src/components/App/SucessoCliente/TabSucessoAluno.tsx');
  const pesquisas = read('src/components/App/SucessoCliente/PesquisasTab.tsx');

  assert.match(migration, /\/app\/sucesso-aluno\?destino=pesquisas-evasao/);
  assert.match(page, /useSearchParams\s*\(/);
  assert.match(page, /destino['"]\)\s*===\s*['"]pesquisas-evasao['"]/);
  assert.match(page, /abrirPesquisaEvasao=\{abrirPesquisaEvasao\}/);
  assert.match(acompanhamento, /abrirPesquisaEvasao\?:\s*boolean/);
  assert.match(acompanhamento, /setSubAba\(['"]pesquisa['"]\)/);
  assert.match(acompanhamento, /abrirEvasao=\{abrirPesquisaEvasao\}/);
  assert.match(pesquisas, /abrirEvasao\?:\s*boolean/);
  assert.match(pesquisas, /setSubAba\(['"]evasao['"]\)/);
});

test('correcao atualiza somente alertas ainda nao enviados e nao ativa producao', () => {
  const migration = read('supabase/migrations/20260803133000_lia_alertas_link_evasao.sql');

  assert.doesNotMatch(migration, /alertas_producao_liberados\s*=\s*true/i);
  assert.doesNotMatch(migration, /cron\.schedule/i);
  assert.match(migration, /template_versao\s*:=\s*2/i);
  assert.match(migration, /update\s+public\.lia_alertas_privados/i);
  assert.match(migration, /status\s+in\s*\(\s*'aguardando_liberacao'\s*,\s*'pendente'\s*\)/i);
  assert.match(migration, /provider_message_id\s+is\s+null/i);
  assert.doesNotMatch(migration, /status\s*=\s*'enviado'/i);
});
