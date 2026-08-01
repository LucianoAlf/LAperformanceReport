import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => {
  const path = resolve(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const types = read('src/types/supabase.ts');
const explicitTypes = read(
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);
const verification = read('scripts/verify-pesquisa-evasao-rls.sql');
const structuralVerification = read(
  'scripts/verify-pesquisa-evasao-schema.sql',
);
const runbook = read(
  'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md',
);

test('contrato de UI da evasao permanece explicito e revisavel', () => {
  assert.ok(explicitTypes, 'pesquisaEvasao.types.ts ausente');
  for (const contractName of [
    'PesquisaEvasaoPreview',
    'PesquisaEvasaoConfirmacao',
    'PesquisaEvasaoListagemItem',
    'PesquisaEvasaoTeste',
  ]) {
    assert.match(explicitTypes, new RegExp(`interface ${contractName}\\b`));
  }
  assert.match(explicitTypes, /modo_teste:\s*boolean/);
  assert.match(explicitTypes, /bloqueio_codigo:\s*PesquisaEvasaoBloqueioCodigo/);
});

test('tipo parcial legado nao precisa ser regenerado para esta entrega', () => {
  assert.ok(types, 'src/types/supabase.ts ausente');
  assert.match(types, /export interface Database/);
  assert.doesNotMatch(types, /__InternalSupabase/);
  assert.match(runbook, /N[aã]o regenerar nem exigir diff de `src\/types\/supabase\.ts`/i);
  assert.match(runbook, /arquivo parcial/i);
});

test('verificacao operacional e transacional e usa pessoa interna existente', () => {
  assert.ok(verification, 'script de verificacao RLS ausente');
  assert.match(verification, /(?:^|\n)begin\s*;/i);
  assert.match(verification, /\brollback\s*;\s*$/i);
  assert.doesNotMatch(verification, /\bcommit\s*;/i);
  assert.match(verification, /set local role authenticated/i);
  assert.match(verification, /request\.jwt\.claim\.sub/i);
  assert.match(verification, /usuarios[\s\S]*ativo\s*=\s*true/i);
  assert.match(verification, /fn_pesquisa_evasao_usuario_interno_ativo/i);
  assert.match(verification, /listar_evadidos_para_pesquisa_v2/i);
  assert.match(verification, /00000000-0000-4000-8000-000000000001/i);
  assert.match(verification, /backfill incompleto/i);
  assert.doesNotMatch(verification, /fabi@gmail|jessyca@lamusic|insert\s+into\s+auth\.users/i);
});

test('verificador estrutural cobre RLS ACL agentes e credenciais', () => {
  assert.ok(structuralVerification, 'verificador estrutural ausente');
  assert.match(structuralVerification, /(?:^|\n)begin\s*;/i);
  assert.match(structuralVerification, /\brollback\s*;\s*$/i);
  assert.doesNotMatch(structuralVerification, /\bcommit\s*;/i);

  for (const token of [
    'pg_policies',
    'has_table_privilege',
    'has_function_privilege',
    'pesquisa_evasao_analises',
    'fn_pesquisa_evasao_usuario_interno_ativo',
    'listar_evadidos_para_pesquisa(uuid,integer,integer,character varying)',
    'listar_evadidos_para_pesquisa(uuid,integer,integer,character varying,integer,integer)',
    'uazapi_token',
    'waha_api_key',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
    'fabio_agent',
    'lia_acesso_restrito',
  ]) {
    assert.ok(
      structuralVerification.toLowerCase().includes(token.toLowerCase()),
      `evidencia estrutural ausente: ${token}`,
    );
  }

  assert.doesNotMatch(
    structuralVerification,
    /jessyca@lamusic|fabi@gmail|fixture_movimentacao|set local role authenticated/i,
  );
});

test('runbook descreve acesso interno amplo com escrita auditada', () => {
  assert.match(runbook, /qualquer usu[aá]rio interno ativo/i);
  assert.match(runbook, /qualquer unidade/i);
  assert.match(runbook, /unidade[\s\S]*filtro[\s\S]*n[aã]o[\s\S]*autoriza/i);
  assert.match(runbook, /n[aã]o recebe escrita direta|escrita direta[\s\S]*revogada/i);
  assert.match(runbook, /confian[cç]a com rastro|auditoria completa/i);
  assert.doesNotMatch(runbook, /seis v[ií]nculos|2\s*[x×]\s*3|matriz nominal/i);
});

test('runbook preserva gates de seguranca independentes do RBAC', () => {
  assert.match(runbook, /ouqwbbermlzqqvtqwlul/);
  assert.match(runbook, /verify_jwt\s*=\s*true/i);
  assert.match(runbook, /5521981278047/);
  assert.match(runbook, /seis pesquisas legadas[\s\S]*testes/i);
  assert.match(runbook, /migration[\s\S]*antes do frontend/i);
  assert.match(runbook, /Vercel/i);
  assert.match(runbook, /F863A22C9F1D8534EAF31F0A7FEDC183DDABF3902E975B620B1F5064F9C381C4/i);
  assert.match(
    runbook,
    /novo ensaio DDL[\s\S]*APROVADO[\s\S]*didpawhgvkarzntvktzu/i,
  );
  assert.match(runbook, /nenhum passo[\s\S]*autoriza escrita em produ[cç][aã]o/i);
});

test('runbook registra autorizacao humana do Bloco 5 sem perder os gates de producao', () => {
  assert.match(runbook, /Bloco 5 autorizado por Alf/i);
  assert.match(runbook, /project ref[\s\S]*reconfirm/i);
  assert.match(runbook, /merge\/deploy do frontend[\s\S]*AUTORIZADO/i);
});

test('runbook preserva o baseline e posiciona o smoke depois do deploy seguro', () => {
  assert.match(
    runbook,
    /WhatsApp desconectado — Lia - Sucesso do Aluno • Caixa undefined não encontrada/,
  );
  assert.match(runbook, /bug preexistente/i);
  assert.match(runbook, /117 conversas/i);
  assert.match(
    runbook,
    /ap[oó]s as migrations[\s\S]*depois do deploy do frontend/i,
  );
  assert.match(
    runbook,
    /liberar merge do PR #16[\s\S]*Vercel[\s\S]*somente depois do deploy[\s\S]*smoke comparativo/i,
  );
  assert.match(
    runbook,
    /efeito esperado[\s\S]*n[aã]o como regress[aã]o do PR/i,
  );
  assert.match(
    runbook,
    /erro diferente[\s\S]*regress[aã]o[\s\S]*parar/i,
  );
  assert.match(
    runbook,
    /Caixa de Entrada do Sucesso do Aluno[\s\S]*qualquer falha[\s\S]*regress[aã]o/i,
  );
  assert.match(runbook, /CaixasManager/);
  assert.match(runbook, /NovaConversaModal/);
  assert.match(runbook, /nenhum campo de token[\s\S]*preenchido/i);
});
