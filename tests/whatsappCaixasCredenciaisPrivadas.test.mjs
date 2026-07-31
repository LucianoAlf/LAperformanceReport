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

const migration = read(
  'supabase/migrations/20260730180100_whatsapp_caixas_credenciais_privadas.sql',
);
const hook = read(
  'src/components/App/PreAtendimento/hooks/useWhatsAppCaixas.ts',
);
const manager = read(
  'src/components/App/PreAtendimento/components/chat/CaixasManager.tsx',
);
const modal = read(
  'src/components/App/Administrativo/CaixaEntrada/NovaConversaModal.tsx',
);
const types = read('src/components/App/PreAtendimento/types.ts');
const instanceEdge = read(
  'supabase/functions/listar-instancias-uazapi/index.ts',
);
const pg17Fixture = read(
  'tests/fixtures/whatsapp_caixas_credenciais_privadas_pg17.sql',
);
const planA = read(
  'docs/superpowers/plans/2026-07-30-pesquisa-evasao-subprojeto-a-fundacao-segura.md',
);
const runbook = read(
  'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md',
);
const rlsVerification = read('scripts/verify-pesquisa-evasao-rls.sql');
const movimentacoesSpec = read(
  'docs/superpowers/specs/2026-07-31-movimentacoes-admin-hardening-design.md',
);

function stripSqlComments(source) {
  return source
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function getFunctionDefinition(name) {
  const source = stripSqlComments(migration);
  const match = source.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?\\$function\\$\\s*;`,
      'i',
    ),
  );
  assert.ok(match, `funcao ${name} ausente`);
  return match[0];
}

test('migration fecha a tabela bruta para todos os roles cliente', () => {
  assert.ok(migration, 'migration de hardening ausente');
  assert.match(
    migration,
    /alter\s+table\s+public\.whatsapp_caixas\s+enable\s+row\s+level\s+security/i,
  );

  for (const role of [
    'public',
    'anon',
    'authenticated',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
    'fabio_agent',
    'lia_acesso_restrito',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke\\s+all[\\s\\S]*on\\s+(?:table\\s+)?public\\.whatsapp_caixas[\\s\\S]*from[\\s\\S]*\\b${role}\\b`,
        'i',
      ),
      `faltou revogar whatsapp_caixas de ${role}`,
    );
  }

  assert.match(
    migration,
    /grant\s+(?:all|select[\s\S]*insert[\s\S]*update[\s\S]*delete)[\s\S]*on\s+(?:table\s+)?public\.whatsapp_caixas[\s\S]*to\s+service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /create\s+policy[\s\S]*on\s+public\.whatsapp_caixas[\s\S]*to\s+authenticated[\s\S]*using\s*\(\s*true\s*\)/i,
  );
});

test('read models autenticado e administrativo nunca retornam credenciais', () => {
  for (const name of [
    'listar_whatsapp_caixas_seguras',
    'listar_whatsapp_caixas_administracao',
  ]) {
    const definition = getFunctionDefinition(name);
    const returns = definition.match(
      /\breturns\s+table\s*\(([\s\S]*?)\)\s*language\b/i,
    )?.[1] ?? '';
    assert.ok(returns, `RETURNS TABLE ausente em ${name}`);
    assert.doesNotMatch(
      returns,
      /\buazapi_token\b|\bwaha_api_key\b/i,
      `${name} expoe credencial no contrato`,
    );
    assert.match(definition, /\bsecurity\s+definer\b/i);
    assert.match(definition, /\bset\s+search_path\s*=\s*''/i);
  }

  const safe = getFunctionDefinition('listar_whatsapp_caixas_seguras');
  assert.match(safe, /\bauth\.uid\s*\(\s*\)/i);
  assert.match(safe, /\bnumero_mascarado\b/i);

  const admin = getFunctionDefinition(
    'listar_whatsapp_caixas_administracao',
  );
  assert.match(admin, /\bperfil\s*=\s*'admin'/i);
  assert.match(admin, /\buazapi_token_configurado\b/i);
  assert.match(admin, /\bwaha_api_key_configurada\b/i);
});

test('mutacoes administrativas sao write-only, auditadas e preservam segredo omitido', () => {
  const save = getFunctionDefinition('salvar_whatsapp_caixa_admin');
  const remove = getFunctionDefinition('excluir_whatsapp_caixa_admin');

  for (const definition of [save, remove]) {
    assert.match(definition, /\bsecurity\s+definer\b/i);
    assert.match(definition, /\bset\s+search_path\s*=\s*''/i);
    assert.match(definition, /\bperfil\s*=\s*'admin'/i);
  }

  assert.match(
    save,
    /coalesce\s*\(\s*nullif\s*\(\s*btrim\s*\(\s*p_uazapi_token\s*\)/i,
    'token UAZAPI omitido deve preservar o valor atual',
  );
  assert.match(
    save,
    /coalesce\s*\(\s*nullif\s*\(\s*btrim\s*\(\s*p_waha_api_key\s*\)/i,
    'API key WAHA omitida deve preservar o valor atual',
  );
  assert.match(
    save,
    /insert\s+into\s+public\.whatsapp_caixas_credenciais_auditoria/i,
  );
  assert.doesNotMatch(
    save,
    /return(?:ing)?[\s\S]{0,120}\buazapi_token\b|return(?:ing)?[\s\S]{0,120}\bwaha_api_key\b/i,
  );

  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.salvar_whatsapp_caixa_admin/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.salvar_whatsapp_caixa_admin[\s\S]*to\s+authenticated/i,
  );
});

test('frontend usa somente RPCs e o tipo operacional nao contem segredo', () => {
  for (const [name, source] of [
    ['useWhatsAppCaixas', hook],
    ['CaixasManager', manager],
    ['NovaConversaModal', modal],
  ]) {
    assert.ok(source, `${name} ausente`);
    assert.doesNotMatch(
      source,
      /\.from\s*\(\s*['"]whatsapp_caixas['"]\s*\)/i,
      `${name} ainda acessa whatsapp_caixas diretamente`,
    );
  }

  assert.match(hook, /\.rpc\s*\(\s*['"]listar_whatsapp_caixas_seguras['"]/i);
  assert.match(
    manager,
    /\.rpc\s*\(\s*['"]listar_whatsapp_caixas_administracao['"]/i,
  );
  assert.match(
    manager,
    /\.rpc\s*\(\s*['"]salvar_whatsapp_caixa_admin['"]/i,
  );
  assert.match(
    manager,
    /\.rpc\s*\(\s*['"]excluir_whatsapp_caixa_admin['"]/i,
  );

  const operationalType = types.match(
    /export\s+interface\s+WhatsAppCaixa\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? '';
  assert.ok(operationalType, 'interface WhatsAppCaixa ausente');
  assert.doesNotMatch(operationalType, /uazapi_token|waha_api_key/i);
});

test('nova conversa prioriza caixa da unidade antes da caixa global', () => {
  const selections = [
    ...modal.matchAll(
      /const\s+caixa\s*=[\s\S]{0,700}?\.find\s*\([\s\S]{0,250}?item\.unidade_id\s*===\s*unidadeConversa[\s\S]{0,150}?\?\?[\s\S]{0,250}?\.find\s*\([\s\S]{0,150}?item\.unidade_id\s*===\s*null/g,
    ),
  ];
  assert.equal(
    selections.length,
    2,
    'os dois fluxos devem preferir caixa específica e usar global só como fallback',
  );
});

test('inventario de instancias nao devolve tokens ao navegador', () => {
  assert.ok(instanceEdge, 'Edge listar-instancias-uazapi ausente');
  const normalizedType = instanceEdge.match(
    /type\s+InstanciaNormalizada\s*=\s*\{([\s\S]*?)\};/,
  )?.[1] ?? '';
  const normalizedMap = instanceEdge.match(
    /const\s+instancias:\s*InstanciaNormalizada\[\][\s\S]*?\.map\([\s\S]*?\}\)\);/,
  )?.[0] ?? '';

  assert.ok(normalizedType, 'tipo normalizado ausente');
  assert.ok(normalizedMap, 'mapeamento normalizado ausente');
  assert.doesNotMatch(normalizedType, /\btoken\b/i);
  assert.doesNotMatch(normalizedMap, /\btoken\s*:/i);
});

test('fixture PG17 cobre ACL, escopo, mascara, preservacao e rotacao', () => {
  assert.ok(pg17Fixture, 'fixture PostgreSQL 17 ausente');
  for (const evidence of [
    /has_table_privilege[\s\S]*authenticated/i,
    /has_table_privilege[\s\S]*service_role/i,
    /usu[aá]rio ampliou escopo/i,
    /telefone operacional n[aã]o foi mascarado/i,
    /token omitido n[aã]o foi preservado/i,
    /rota[cç][aã]o write-only n[aã]o persistiu/i,
    /whatsapp_caixas_credenciais_auditoria/i,
    /WHATSAPP_CAIXAS_CREDENCIAIS_PRIVADAS_PG17_OK/,
  ]) {
    assert.match(pg17Fixture, evidence);
  }
});

test('verificacao de rollout bloqueia leitura das duas credenciais', () => {
  assert.ok(rlsVerification, 'verificação RLS de rollout ausente');
  assert.match(
    rlsVerification,
    /has_column_privilege\s*\([\s\S]*'authenticated'[\s\S]*'public\.whatsapp_caixas'[\s\S]*'uazapi_token'[\s\S]*'select'/i,
  );
  assert.match(
    rlsVerification,
    /has_column_privilege\s*\([\s\S]*'authenticated'[\s\S]*'public\.whatsapp_caixas'[\s\S]*'waha_api_key'[\s\S]*'select'/i,
  );
  assert.match(
    rlsVerification,
    /service_role[\s\S]*whatsapp_caixas[\s\S]*select/i,
  );
});

test('DoD e runbook refletem o escopo real e o usuario dedicado', () => {
  assert.match(
    planA,
    /Mila e Sol n[aã]o leem respostas privadas[\s\S]*pesquisa_evasao[\s\S]*tabelas filhas/i,
  );
  assert.match(runbook, /lume_readonly_select/i);
  assert.match(
    runbook,
    /homologa[cç][aã]o[\s\S]*n[aã]o bloqueia|n[aã]o bloqueia[\s\S]*homologa[cç][aã]o/i,
  );
  assert.match(
    runbook,
    /usu[aá]rio dedicado[\s\S]*desativad[oa][\s\S]*ao final/i,
  );
  assert.match(
    runbook,
    /project ref[\s\S]*homologa[cç][aã]o[\s\S]*nzwqjepncrtufpykjita/i,
  );
  assert.match(
    runbook,
    /invent[aá]rio de consumidores[\s\S]*useWhatsAppCaixas[\s\S]*NovaConversaModal[\s\S]*CaixasManager/i,
  );
  assert.match(
    runbook,
    /16 consumidores diretos server-side[\s\S]*SUPABASE_SERVICE_ROLE_KEY/i,
  );
});

test('runbook mantem staging incapaz de entregar WhatsApp', () => {
  assert.match(runbook, /p01c-staging[\s\S]*nzwqjepncrtufpykjita/i);
  assert.match(runbook, /20260614131323[\s\S]*20260730161312/i);
  assert.match(runbook, /HOMOLOG-DESATIVADO-NAO-ENVIA/i);
  assert.match(runbook, /n[aã]o restaurar[\s\S]*credenciais[\s\S]*produ[cç][aã]o/i);
  assert.match(
    runbook,
    /credencial v[aá]lida[\s\S]*produ[cç][aã]o[\s\S]*(?:parar|interromper)[\s\S]*homologa[cç][aã]o/i,
  );
  assert.match(
    runbook,
    /falha[\s\S]*provedor[\s\S]*esperad[oa][\s\S]*autentica[cç][aã]o[\s\S]*permiss[aã]o[\s\S]*pr[eé]via[\s\S]*snapshot[\s\S]*idempot[eê]ncia/i,
  );
  assert.match(
    runbook,
    /byte a byte[\s\S]*produ[cç][aã]o[\s\S]*modo teste[\s\S]*n[uú]mero interno/i,
  );
});

test('runbook registra drift do rebase e bloqueia provisionamento prematuro', () => {
  assert.match(runbook, /MIGRATIONS_FAILED/i);
  assert.match(runbook, /20260701000701_seguranca_rls_grupo_b_enable_policies/i);
  assert.match(runbook, /20260702024506_fideliza_renovacoes_trim_movimentacoes_admin/i);
  assert.match(runbook, /n[aã]o usar[\s\S]*migration repair/i);
  assert.match(
    runbook,
    /terceiro usu[aá]rio[\s\S]*N[AÃ]O CRIADO[\s\S]*gate de schema/i,
  );
});

test('runbook impede bootstrap contraditorio e inventaria a staging antiga', () => {
  assert.match(
    runbook,
    /branch Supabase[\s\S]*reaplica[cç][aã]o sequencial das migrations/i,
  );
  assert.match(runbook, /20260109125533[\s\S]*20260109125543/i);
  assert.match(
    runbook,
    /nenhuma branch ou projeto novo foi criado[\s\S]*nenhum custo novo/i,
  );
  assert.match(runbook, /67 Edge Functions ativas/i);
  assert.match(runbook, /GEMINI_API_KEY[\s\S]*mesma fingerprint de produ[cç][aã]o/i);
  assert.match(
    runbook,
    /n[aã]o apagar[\s\S]*staging antiga[\s\S]*decis[aã]o do Alf/i,
  );
});

test('spec separada cobre consumidores, RLS, Sol e regressao da evasao', () => {
  assert.ok(movimentacoesSpec, 'spec de movimentacoes_admin ausente');
  for (const requirement of [
    /20\+\s+consumidores/i,
    /RLS[\s\S]*unidade/i,
    /lume_readonly_select/i,
    /Sol[\s\S]*§13\.2/i,
    /pesquisa[\s\S]*evas[aã]o[\s\S]*(?:regress[aã]o|continua funcionando)/i,
    /depois[\s\S]*homologa[cç][aã]o[\s\S]*Plano A/i,
    /antes[\s\S]*Subprojeto C/i,
  ]) {
    assert.match(movimentacoesSpec, requirement);
  }
});
