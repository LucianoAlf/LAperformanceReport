import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260703203000_p11_conciliacao_leads_qualidade.sql';
const migrationRevisaoPath = 'supabase/migrations/20260703223000_p13_conciliacao_leads_revisar_origem.sql';
const componentPath = 'src/components/App/Comercial/ComercialConciliacaoLeads.tsx';
const comercialPagePath = 'src/components/App/Comercial/ComercialPage.tsx';

assert.ok(existsSync(migrationPath), 'migration p11 de conciliacao de leads deve existir');
assert.ok(existsSync(migrationRevisaoPath), 'migration p13 de revisao de origem de leads deve existir');
assert.ok(existsSync(componentPath), 'componente ComercialConciliacaoLeads deve existir');

const migration = readFileSync(migrationPath, 'utf8');
const migrationRevisao = readFileSync(migrationRevisaoPath, 'utf8');
const component = readFileSync(componentPath, 'utf8');
const comercialPage = readFileSync(comercialPagePath, 'utf8');

assert.match(migration, /create table if not exists public\.lead_conciliacao_decisoes/i);
assert.match(migration, /get_conciliacao_leads_qualidade_v1/i);
assert.match(migration, /resolver_conciliacao_lead_qualidade/i);
assert.match(migration, /check \(campo in \('canal_origem_id', 'curso_interesse_id'\)\)/i);
assert.match(migration, /update public\.leads/i);
assert.match(migration, /insert into public\.lead_conciliacao_decisoes/i);
assert.match(migration, /grant execute on function public\.get_conciliacao_leads_qualidade_v1/i);
assert.match(migration, /grant execute on function public\.resolver_conciliacao_lead_qualidade/i);

assert.match(migrationRevisao, /origem_revisao/i);
assert.match(migrationRevisao, /p_tipo in \('origem_revisao', 'revisar_origem'\)/i);
assert.match(migrationRevisao, /Conferir e ajustar canal de origem quando a equipe identificar divergencia/i);
assert.match(migrationRevisao, /grant execute on function public\.get_conciliacao_leads_qualidade_v1/i);

assert.match(component, /Qualidade dos Leads/);
assert.match(component, /Origem pendente/);
assert.match(component, /Curso pendente/);
assert.match(component, /Revisar origem informada/);
assert.match(component, /resolver_conciliacao_lead_qualidade/);
assert.match(component, /get_conciliacao_leads_qualidade_v1/);
assert.match(component, /onResolvido/);

assert.match(comercialPage, /ComercialConciliacaoLeads/);
assert.match(comercialPage, /pendenciasQualidadeLeads/);
assert.match(comercialPage, /Dados de leads a completar/);

console.log('conciliacaoLeadsQualidade OK');
