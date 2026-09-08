import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import ts from 'typescript';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260905192929_separa_base_financeira_ticket_recreio.sql',
    import.meta.url,
  ),
  'utf8',
);
const hook = readFileSync(
  new URL('../src/hooks/useKPIsAlunosCanonicos.ts', import.meta.url),
  'utf8',
);
const dadosMensaisHook = readFileSync(
  new URL('../src/hooks/useDadosMensais.ts', import.meta.url),
  'utf8',
);
const gestaoHook = readFileSync(
  new URL('../src/hooks/useKPIsGestao.ts', import.meta.url),
  'utf8',
);
const tabGestao = readFileSync(
  new URL('../src/components/GestaoMensal/TabGestao.tsx', import.meta.url),
  'utf8',
);
const modalRelatorio = readFileSync(
  new URL('../src/components/App/Administrativo/ModalRelatorio.tsx', import.meta.url),
  'utf8',
);
const ticketHelperUrl = new URL('../src/lib/ticketMedioCanonico.ts', import.meta.url);
const ticketHelper = existsSync(ticketHelperUrl) ? readFileSync(ticketHelperUrl, 'utf8') : '';
const rpcMigrationUrl = new URL(
  '../supabase/migrations/20260905195222_separa_pagantes_admin_denominador_ticket_rpc.sql',
  import.meta.url,
);
const rpcMigration = existsSync(rpcMigrationUrl) ? readFileSync(rpcMigrationUrl, 'utf8') : '';
const aclMigrationUrl = new URL(
  '../supabase/migrations/20260905200225_restaura_acl_sol_kpis_ticket.sql',
  import.meta.url,
);
const aclMigration = existsSync(aclMigrationUrl) ? readFileSync(aclMigrationUrl, 'utf8') : '';
const hardeningMigrationUrl = new URL(
  '../supabase/migrations/20260905203015_remove_fallback_pagantes_admin_ticket.sql',
  import.meta.url,
);
const hardeningMigration = existsSync(hardeningMigrationUrl)
  ? readFileSync(hardeningMigrationUrl, 'utf8')
  : '';

async function importarHelperTicket() {
  assert.notEqual(ticketHelper, '', 'falta o helper puro do ticket medio canonico');
  const javascript = ts.transpileModule(ticketHelper, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

test('ticket fechado usa denominador financeiro explicito, nunca alunos ativos ou pagantes administrativos', () => {
  assert.match(
    migration,
    /create or replace function public\.aplicar_financeiro_ticket_contratual_v3/i,
  );

  const leitorInicio = migration.indexOf(
    'create or replace function public.aplicar_financeiro_ticket_contratual_v3',
  );
  const leitorFim = migration.indexOf(
    'create or replace function public.get_financeiro_faturas_emusys',
  );
  const leitor = migration.slice(leitorInicio, leitorFim);

  const denominadorExplicito = leitor.indexOf(
    "financeiro_ticket_contratual,ticket_denominador_pagantes",
  );
  assert.ok(denominadorExplicito >= 0, 'falta o denominador financeiro explicito');
  assert.match(leitor, /faturamento_fechado\s*\/\s*f\.ticket_denominador_pagantes/iu);
  assert.doesNotMatch(leitor, /faturamento_fechado\s*\/\s*f\.alunos_pagantes/iu);
});

test('relatorio rico separa pagantes administrativos do denominador do ticket', () => {
  assert.match(
    migration,
    /create or replace function public\.get_relatorio_admin_mensal_rico_v1/i,
  );
  assert.match(migration, /v_pagantes_relatorio\s*<>\s*v_pagantes_fonte/i);
  assert.match(
    migration,
    /round\(v_mrr\s*\/\s*v_ticket_denominador_pagantes,\s*2\)\s*<>\s*round\(v_ticket,\s*2\)/iu,
  );
  assert.doesNotMatch(
    migration,
    /round\(v_mrr\s*\/\s*v_pagantes_fonte,\s*2\)\s*<>\s*round\(v_ticket,\s*2\)/iu,
  );
});

test('migration histórica separou os KPIs acadêmicos do denominador financeiro', () => {
  for (const expected of [
    /v_ativos\s+constant\s+integer\s*:=\s*344/i,
    /v_pagantes_administrativos\s+constant\s+integer\s*:=\s*334/i,
    /v_ticket_denominador_pagantes\s+constant\s+integer\s*:=\s*325/i,
    /v_mrr\s+constant\s+numeric\s*:=\s*144749\.17/i,
    /v_ticket\s+constant\s+numeric\s*:=\s*445\.38/i,
    /v_churn\s+constant\s+numeric\s*:=\s*8\.38/i,
  ]) assert.match(migration, expected);

  assert.match(migration, /'alunos_pagantes',\s*v_pagantes_administrativos/i);
  assert.match(
    migration,
    /'ticket_denominador_pagantes',\s*v_ticket_denominador_pagantes/i,
  );
  assert.match(migration, /versao\s*\+\s*1/i);
  assert.match(migration, /fechamento_mensal_auditoria/i);
  assert.doesNotMatch(migration, /update\s+public\.fechamento_mensal_snapshots/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.fechamento_mensal_snapshots/i);
});

test('compatibilidade recebe campos financeiros aditivos sem corromper a coluna gerada antiga', () => {
  assert.match(
    migration,
    /add column if not exists ticket_denominador_pagantes\s+integer/i,
  );
  assert.match(
    migration,
    /add column if not exists ticket_medio_contratual\s+numeric/i,
  );
  assert.match(
    migration,
    /add column if not exists mrr_contratual\s+numeric/i,
  );
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,180}ticket_medio\s*=\s*v_ticket/i,
    'ticket_medio legado nao pode voltar a acoplar 334 ao MRR contratual',
  );
  assert.match(migration, /'compatibilidade_dados_mensais_atualizada'/i);
  assert.match(
    hook,
    /row\.mrr_contratual\s*\?\?\s*row\.faturamento_estimado/iu,
  );
  assert.match(
    hook,
    /row\.ticket_medio_contratual\s*\?\?\s*row\.ticket_medio/iu,
  );
});

test('front suporta denominador financeiro independente em uma fixture histórica', async () => {
  const { calcularTicketMedioCanonico } = await importarHelperTicket();

  assert.equal(calcularTicketMedioCanonico([{
    alunosPagantes: 334,
    mrr: 144749.17,
    ticketMedio: 445.38,
    ticketDenominadorPagantes: 325,
    ticketDenominadorFaturas: 0,
  }]), 445.38);

  assert.equal(calcularTicketMedioCanonico([{
    alunosPagantes: 328,
    mrr: 148214.03,
    ticketMedio: 453.25,
    ticketDenominadorPagantes: null,
  }]), 453.25);

  assert.match(hook, /ticketDenominadorPagantes\?:\s*number\s*\|\s*null/iu);
  assert.match(hook, /payload\.ticket_denominador_pagantes/iu);
  assert.match(hook, /financeiroTicketPayload\.ticket_denominador_pagantes/iu);
  assert.match(hook, /row\.ticket_denominador_pagantes/iu);
  assert.doesNotMatch(
    hook,
    /totalPagantes\s*>\s*0\s*\?\s*totalMrr\s*\/\s*totalPagantes/iu,
    'pagantes administrativos nao podem ser fallback matematico do ticket',
  );
});

test('fallbacks historicos usam os campos financeiros aditivos', () => {
  assert.match(dadosMensaisHook, /d\.mrr_contratual\s*\?\?\s*d\.faturamento_estimado/iu);
  assert.match(dadosMensaisHook, /d\.ticket_denominador_pagantes\s*\?\?\s*null/iu);
  assert.doesNotMatch(
    dadosMensaisHook,
    /agregados\.mrr\s*\/\s*agregados\.alunos_pagantes/iu,
  );

  assert.match(gestaoHook, /d\.mrr_contratual\s*\?\?\s*d\.faturamento_estimado/iu);
  assert.match(gestaoHook, /d\.ticket_denominador_pagantes\s*\?\?\s*null/iu);
  assert.doesNotMatch(gestaoHook, /mrr\s*\/\s*totalPagantes/iu);
});

test('comparativos e modal mensal nunca recompõem ticket pela contagem administrativa', () => {
  assert.doesNotMatch(
    tabGestao,
    /faturamento_estimado\s*\/\s*consolidado(?:Mes|Ano)Anterior\.alunos_pagantes/iu,
  );
  assert.doesNotMatch(
    modalRelatorio,
    /kpis\.faturamento\s*\/\s*kpis\.alunos_pagantes/iu,
  );
  assert.match(tabGestao, /calcularTicketMedioCanonico/iu);
  assert.match(modalRelatorio, /calcularTicketMedioCanonico/iu);
  assert.doesNotMatch(
    modalRelatorio,
    /ticket_medio:\s*financeiro\.ticket_medio/iu,
    'a leitura auxiliar de faturas nao pode sobrescrever o ticket canonico',
  );
  assert.doesNotMatch(
    modalRelatorio,
    /ticket_denominador_pagantes:\s*financeiro\.ticket_denominador_pagantes/iu,
    'a leitura auxiliar de faturas nao pode sobrescrever o denominador canonico',
  );
  assert.doesNotMatch(
    modalRelatorio,
    /mrr_atual:\s*financeiro\.mrr_atual/iu,
    'valor recebido na leitura de faturas nao pode sobrescrever o MRR contratual',
  );
});

test('RPC canonica publica pagantes administrativos e denominador financeiro sem sobrescrever um pelo outro', () => {
  assert.notEqual(rpcMigration, '', 'falta a migration de separacao da RPC canonica');
  assert.match(
    rpcMigration,
    /rename\s+to\s+get_kpis_alunos_canonicos_base_ticket_denominador_v1/iu,
  );
  assert.match(rpcMigration, /'alunos_pagantes_administrativos'/iu);
  assert.match(rpcMigration, /'ticket_denominador_pagantes'/iu);
  assert.match(rpcMigration, /get_kpis_alunos_financeiro_vivo_canonico/iu);
  assert.match(rpcMigration, /financeiro_ticket_contratual,ticket_denominador_pagantes/iu);
  assert.doesNotMatch(
    rpcMigration,
    /'alunos_pagantes'\s*,\s*v_ticket_denominador/iu,
    'o denominador financeiro nao pode substituir o KPI administrativo',
  );
});

test('RPC publica preserva o acesso direto da Sol e a base renomeada fica interna', () => {
  assert.notEqual(aclMigration, '', 'falta restaurar o contrato de acesso da Sol');
  assert.match(
    aclMigration,
    /grant\s+execute[\s\S]*get_kpis_alunos_canonicos\([\s\S]*to\s+authenticated,\s*service_role,\s*sol_acesso_restrito/iu,
  );
  assert.match(
    aclMigration,
    /revoke\s+all[\s\S]*get_kpis_alunos_canonicos_base_ticket_denominador_v1\([\s\S]*from\s+public,\s*anon,\s*authenticated,\s*sol_acesso_restrito/iu,
  );
  assert.match(aclMigration, /has_function_privilege/iu);
});

test('leitor financeiro efetivo nunca aceita pagantes administrativos como denominador', () => {
  assert.notEqual(hardeningMigration, '', 'falta a migration que remove o fallback administrativo');
  const inicio = hardeningMigration.indexOf(
    'create or replace function public.aplicar_financeiro_ticket_contratual_v4',
  );
  const fim = hardeningMigration.indexOf('\n$function$;', inicio);
  assert.ok(inicio >= 0 && fim > inicio, 'funcao v4 ausente');
  const leitor = hardeningMigration.slice(inicio, fim);

  assert.doesNotMatch(leitor, /payload[^\n]*->>\s*'alunos_pagantes'/iu);
  assert.doesNotMatch(leitor, /alunos_admin/iu);
  assert.match(leitor, /ticket_denominador_pagantes/iu);
  assert.match(leitor, /indisponivel_sem_denominador_financeiro_explicito/iu);
  assert.match(
    hardeningMigration,
    /return\s+public\.aplicar_financeiro_ticket_contratual_v4/iu,
  );
});

test('backfill financeiro de agosto versiona snapshots das tres unidades', () => {
  assert.notEqual(rpcMigration, '', 'falta a migration de backfill financeiro global');
  assert.match(rpcMigration, /get_financeiro_faturas_emusys\(null,\s*2026,\s*8\)/iu);
  assert.match(rpcMigration, /insert\s+into\s+public\.fechamento_mensal_snapshots/iu);
  assert.match(rpcMigration, /ticket_denominador_pagantes/iu);
  assert.match(rpcMigration, /fechamento_mensal_auditoria/iu);
  assert.match(rpcMigration, /446\.30/iu);
  assert.match(rpcMigration, /398\.87/iu);
  assert.match(rpcMigration, /445\.38/iu);
});

test('a transacao prova Recreio e preserva Barra e Campo Grande', () => {
  assert.match(migration, /445\.38/i);
  assert.match(migration, /446\.30/i);
  assert.match(migration, /398\.87/i);
  assert.match(migration, /get_relatorio_admin_mensal_rico_v1/i);
  assert.match(migration, /get_relatorio_gerencial_canonico_v1/i);
  assert.match(migration, /commit\s*;/i);
});
