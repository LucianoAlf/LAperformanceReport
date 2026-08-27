import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const schema = read('supabase/functions/bi-agent-lamusic/schema.ts');
const tools = read('supabase/functions/bi-agent-lamusic/tools.ts');
const validator = read('supabase/functions/bi-agent-lamusic/sql-validator.ts');
const plano = read('supabase/functions/gerar-plano-aluno/index.ts');
const relatorio = read('supabase/functions/gerar-relatorio-aluno/index.ts');

test('schema e portas BI publicam apenas o contrato canonico de presenca', () => {
  assert.doesNotMatch(schema, /alunos[^\n]*percentual_presenca/iu);
  assert.match(schema, /vw_presenca_ocorrencia_canonica_v2/iu);
  assert.match(schema, /get_presenca_contexto_agente_v1/iu);
  assert.match(tools, /name:\s*['"]get_presenca_canonica['"]/iu);
  assert.match(tools, /get_presenca_contexto_agente_v1/iu);
  assert.match(tools, /p_escopo:\s*['"]bi['"]/iu);
  assert.match(validator, /aluno_presenca/iu);
  assert.match(validator, /percentual_presenca/iu);
  assert.match(validator, /vw_presenca_ocorrencia_canonica_v2/iu);
});

test('plano e relatorio carregam metadados canonicos e nao aceitam snapshot legado', () => {
  for (const [nome, source] of [['plano', plano], ['relatorio', relatorio]]) {
    assert.doesNotMatch(source, /percentual_presenca/iu, `${nome} ainda aceita snapshot legado`);
    assert.match(source, /presenca_contexto/iu, `${nome} precisa receber contexto canonico`);
    for (const campo of [
      'periodo', 'universo_eventos', 'regra_versao', 'dados_status',
      'sincronizado_em', 'estado_publicacao', 'conflitos', 'revisoes_estruturais',
    ]) {
      assert.match(source, new RegExp(campo, 'iu'), `${nome} nao carrega ${campo}`);
    }
    assert.match(source, /presenca_desatualizada|em auditoria/iu, `${nome} deve bloquear conclusao insegura`);
  }
});

test('descoberta BI oculta portas legadas sem bloquear tabelas nao relacionadas a presenca', () => {
  assert.match(tools, /tabelaAnaliticaPermitida|isTabelaAnaliticaPermitida/iu);
  assert.match(tools, /vw_presenca_ocorrencia_canonica_v2/iu);
  assert.match(tools, /aluno_presenca/iu);
  assert.match(tools, /percentual_presenca/iu);
  assert.match(tools, /\['alunos',\s*'leads',\s*'professores'/u);
});
