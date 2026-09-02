import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracoes = path.join(root, 'supabase/migrations');
const tabela = path.join(migracoes, '20260902121500_fechamento_mensal_execucoes.sql');
const orquestrador = path.join(migracoes, '20260902122000_fechar_competencia_mensal_dia1.sql');

test('as migrations existem', () => {
  assert.ok(fs.existsSync(tabela), 'migration da tabela de placar ausente');
  assert.ok(fs.existsSync(orquestrador), 'migration do orquestrador ausente');
});

test('cada unidade roda em bloco protegido', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  // Existem DOIS "exception when others" no arquivo (passo 0 e o laco por
  // unidade) — checar em qualquer lugar do arquivo passaria mesmo com o
  // laco por unidade desprotegido. Recorta so o trecho do laco.
  const match = sql.match(/for\s+v_unidade\s+in[\s\S]*?end\s+loop\s*;/iu);
  assert.ok(match, 'laco "for v_unidade in ... end loop;" nao encontrado');
  const trechoLaco = match[0];
  assert.match(trechoLaco, /exception\s+when\s+others/iu,
    'sem bloco protegido DENTRO do laco por unidade, uma unidade travada aborta as demais');
  assert.match(trechoLaco, /sqlerrm/iu,
    'o erro precisa ser capturado dentro do laco para virar alarme legivel');
  assert.match(trechoLaco, /sqlstate/iu);
});

test('libera o statement_timeout da funcao', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /statement_timeout/u,
    'o papel authenticator corta em 8s e o fechamento leva ~60s');
});

test('respeita a ordem: bloco financeiro antes da captura mensal', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  const posBloco = sql.indexOf('garantir_bloco_financeiro_gerencial_v1');
  const posCaptura = sql.indexOf('capturar_relatorios_mensais_canonicos_v1');
  assert.ok(posBloco > -1 && posCaptura > -1, 'ambas as chamadas devem existir');
  assert.ok(
    posBloco < posCaptura,
    'montar_relatorio_admin_mensal_payload_v1 le o gerencial por versao desc — '
      + 'o bloco tem de existir antes da captura',
  );
});

test('usa a v2 (por unidade), nao a v1 tudo-ou-nada', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(sql, /fechar_competencia_mensal_canonica_v2/u);
});

test('a competencia alvo e o mes anterior', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  // Precisa travar o SINAL da operacao — "+ interval '1 month'" tambem
  // bateria em /interval\s+'1 month'/ sozinho, e daria o mes ERRADO
  // (quebrando a virada de ano na direcao oposta).
  assert.match(
    sql,
    /date_trunc\s*\(\s*'month'[^)]*\)\s*-\s*interval\s+'1 month'/u,
    'a competencia tem de ser o mes anterior (subtracao), nao o mes seguinte',
  );
  assert.match(sql, /America\/Sao_Paulo/u, 'data de negocio precisa ser BRT, nao UTC');
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(orquestrador, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_dia1_v1[^;]*from[^;]*anon/isu,
  );
});

test('guarda de acesso: fail-closed mesmo com auth.role() NULL, e sinaliza ACESSO_NEGADO', () => {
  // O schema public concede EXECUTE a `authenticated` por ALTER DEFAULT
  // PRIVILEGES; o revoke acima so alcanca anon. Para authenticated, esta
  // guarda dentro da funcao e a UNICA protecao.
  const sql = fs.readFileSync(orquestrador, 'utf8');
  const funcao = sql.slice(sql.indexOf('create or replace function'));
  assert.match(
    funcao,
    /if\s+coalesce\s*\(\s*auth\.role\(\)\s*,\s*''\s*\)\s*<>\s*'service_role'/isu,
    'sem coalesce, auth.role() NULL faz NULL <> \'service_role\' avaliar NULL — '
      + 'o if nao dispara e a guarda vira fail-open',
  );
  assert.match(
    funcao,
    /raise\s+exception\s+'ACESSO_NEGADO_FECHAMENTO_DIA1'/isu,
    'a guarda precisa recusar com ACESSO_NEGADO_FECHAMENTO_DIA1',
  );
});

test('placar tem RLS ligada, acesso revogado por padrao e leitura restrita a admin', () => {
  const sql = fs.readFileSync(tabela, 'utf8');
  assert.match(
    sql,
    /alter\s+table\s+public\.fechamento_mensal_execucoes\s+enable\s+row\s+level\s+security/isu,
    'sem RLS ligada, qualquer authenticated leria o placar por engano',
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.fechamento_mensal_execucoes\s+from\s+public\s*,\s*anon\s*,\s*authenticated/isu,
    'revoke precisa alcancar public, anon E authenticated nominalmente',
  );
  assert.match(
    sql,
    /create\s+policy\s+fechamento_mensal_execucoes_leitura_admin[\s\S]*?is_admin\s*\(\s*\)/isu,
    'a policy de leitura precisa restringir a is_admin()',
  );
});

const cron = path.join(migracoes, '20260902122500_cron_fechamento_dia1.sql');

test('o cron nasce desligado', () => {
  const sql = fs.readFileSync(cron, 'utf8');
  // "active => false" aparece DUAS VEZES no arquivo -- uma para o cron novo,
  // outra para desativar o antigo. Checar em qualquer lugar do arquivo
  // passaria mesmo se a do cron novo sumisse (bug: cron novo nasceria
  // ligado). Recorta so o primeiro bloco "do $$ ... end; $$;", que e o
  // bloco de criacao do cron novo (mesmo padrao do teste "cada unidade
  // roda em bloco protegido" acima, que recorta o laco por causa dos dois
  // "exception when others"). O "active => false" mora agora DENTRO do
  // "if v_jobid is null then ... end if;" (so desliga na criacao, para
  // reaplicar a migration nao desligar um cron ja ligado por alguem) --
  // ainda assim fica dentro deste mesmo recorte, porque "end if;" nao
  // casa com o literal "end;" que o regex procura.
  const match = sql.match(/do\s+\$\$[\s\S]*?end;\s*\$\$;/u);
  assert.ok(match, 'bloco "do $$ ... end; $$;" do cron novo nao encontrado');
  const blocoCronNovo = match[0];
  assert.match(blocoCronNovo, /active\s*=>\s*false/u,
    'cron de escrita mensal nao pode nascer ligado antes do ensaio');
  assert.match(sql, /'15 12 1 \* \*'/u, 'schedule deve ser 12:15 UTC = 09:15 BRT do dia 1o (margem para o sync de faturas de :07)');
});

test('desativa o cron antigo das 22h em vez de deletar', () => {
  const sql = fs.readFileSync(cron, 'utf8');
  assert.match(sql, /fechamento-mensal-automatico/u);
  assert.doesNotMatch(sql, /cron\.unschedule/u, 'desativar, nao deletar — rollback de uma linha');
});

test('so desliga o cron novo no ramo de CRIACAO — reaplicar a migration nao pode desligar um cron ja ligado', () => {
  const sql = fs.readFileSync(cron, 'utf8');
  const match = sql.match(/do\s+\$\$[\s\S]*?end;\s*\$\$;/u);
  assert.ok(match, 'bloco "do $$ ... end; $$;" do cron novo nao encontrado');
  const blocoCronNovo = match[0];

  const posIfCriacao = blocoCronNovo.search(/if\s+v_jobid\s+is\s+null\s+then/iu);
  const posAlterJob = blocoCronNovo.search(/perform\s+cron\.alter_job\s*\(\s*v_jobid\s*,\s*active\s*=>\s*false\s*\)/iu);
  const posEndIf = blocoCronNovo.search(/end\s+if\s*;/iu);

  assert.ok(posIfCriacao > -1, '"if v_jobid is null then" (ramo de criacao) nao encontrado');
  assert.ok(posAlterJob > -1, 'chamada a cron.alter_job(v_jobid, active => false) nao encontrada');
  assert.ok(posEndIf > -1, '"end if;" do ramo de criacao nao encontrado');

  assert.ok(
    posIfCriacao < posAlterJob && posAlterJob < posEndIf,
    'a chamada que desliga o cron precisa estar DENTRO do "if v_jobid is null then ... end if;" '
      + '(so na criacao) — fora dele, um replay da migration desligaria em silencio um cron que '
      + 'ja foi ligado por alguem',
  );
});
