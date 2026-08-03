import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  hook: resolve(repoRoot, 'src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts'),
  modal: resolve(repoRoot, 'src/components/App/SucessoCliente/ModalRegistrarFollowupEvasao.tsx'),
  fila: resolve(repoRoot, 'src/components/App/SucessoCliente/FilaFollowupEvasao.tsx'),
  tab: resolve(repoRoot, 'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx'),
  types: resolve(repoRoot, 'src/components/App/SucessoCliente/pesquisaEvasao.types.ts'),
};

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('frontend usa somente RPCs governadas para follow-up', () => {
  const source = `${readOptional(paths.hook)}\n${readOptional(paths.modal)}`;

  assert.match(source, /listar_followups_pesquisa_evasao_v1/);
  assert.match(source, /contar_followups_pesquisa_evasao_v1/);
  assert.match(source, /registrar_followup_pesquisa_evasao_v1/);
  assert.doesNotMatch(source, /\.from\(['"]pesquisa_evasao_followup_acoes['"]\)/);
});

test('contrato tipado preserva estados e auditoria da acao manual', () => {
  const source = readOptional(paths.types);

  for (const estado of [
    'aguardando_resposta',
    'followup_pendente',
    'followup_avisado',
    'followup_realizado',
    'followup_dispensado',
    'respondendo',
    'pronta_para_revisao',
    'em_revisao',
    'nova_rodada',
    'revisada',
    'opt_out',
  ]) {
    assert.match(source, new RegExp(`['"]${estado}['"]`));
  }

  assert.match(source, /acao_registrada_em/);
  assert.match(source, /acao_operador_nome/);
});

test('modal deixa claro que a acao nao envia mensagem para a familia', () => {
  const source = readOptional(paths.modal);

  assert.match(source, /não envia mensagem à família/i);
  assert.match(source, /0\/500/);
  assert.match(source, /WhatsApp/);
  assert.match(source, /Ligação/);
  assert.match(source, /Outro/);
});

test('fila mostra contador, estados operacionais e contexto do envio', () => {
  const source = readOptional(paths.fila);

  for (const label of [
    'Enviado em',
    'Aguardando resposta',
    'Follow-up pendente',
    'Follow-up avisado',
    'Follow-up realizado',
    'Follow-up dispensado',
    'Interagiu sem resposta válida',
  ]) {
    assert.match(source, new RegExp(label, 'i'));
  }

  assert.match(source, /ConversaPesquisaEvasao/);
  assert.match(source, /Marcar realizado/);
  assert.match(source, /Dispensar/);
});

test('aba monta a fila e respeita o filtro do link diario', () => {
  const source = readOptional(paths.tab);

  assert.match(source, /useSearchParams\s*\(/);
  assert.match(source, /FilaFollowupEvasao/);
  assert.match(source, /searchParams\.get\(['"]filtro['"]\)\s*===\s*['"]followup_pendente['"]/);
});
