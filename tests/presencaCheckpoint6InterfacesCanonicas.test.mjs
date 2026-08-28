import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const semanaHook = read('src/hooks/useAgendaSemana.ts');
const semana = read('src/components/App/Agenda/Chamada/ChamadaSemana.tsx');
const chamada = read('src/components/App/Agenda/Chamada/useChamadaAcoes.ts');
const dia = read('src/components/App/Agenda/Chamada/ChamadaDia.tsx');
const card = read('src/components/App/Agenda/AgendaCard.tsx');
const drawer = read('src/components/App/Agenda/AgendaDrawer.tsx');
const professor = read('src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx');

test('visão semanal consome envelopes diários do contrato v2', () => {
  assert.match(semanaHook, /rpc\('get_agenda_semana_v2'/u);
  assert.match(semanaHook, /presencaDoDia/u);
  assert.doesNotMatch(semanaHook, /rpc\('get_agenda_semana'/u);
  assert.match(semana, /resumirAulaPresencaCanonica/u);
  assert.match(semana, /adaptarPresencaCanonica/u);
  assert.doesNotMatch(semana, /estadoDoAluno|alunoSemDestino|chamadaCompleta/u);
});

test('interfaces da Agenda não promovem campos brutos a estado visual', () => {
  for (const [nome, source] of [['Dia', dia], ['Card', card], ['Drawer', drawer], ['Professor', professor]]) {
    assert.doesNotMatch(source, /aula\.professor_presenca\s*(?:===|&&|\?)/u, `${nome} ainda decide por professor_presenca bruto`);
    assert.doesNotMatch(source, /\.status_presenca\s*(?:===|&&|\?)/u, `${nome} ainda decide por status_presenca legado`);
  }
  assert.match(card, /adaptarPresencaCanonica/u);
  assert.match(drawer, /adaptarPresencaCanonica/u);
  assert.match(dia, /adaptarPresencaCanonica/u);
  assert.match(professor, /adaptarPresencaProfessorCanonica/u);
});

test('escrita preserva as RPCs diretas do Hugo com recibo durável', () => {
  assert.match(chamada, /app_registrar_chamada_agenda[\s\S]*p_request_id/u);
  assert.match(professor, /app_marcar_presenca_professor_aula[\s\S]*p_request_id/u);
  assert.match(professor, /app_registrar_presenca_professor_dia[\s\S]*p_request_id/u);
  assert.match(professor, /app_remover_presenca_professor_dia[\s\S]*p_request_id/u);
  for (const source of [chamada, professor, dia]) {
    assert.match(source, /interpretarEEncerrarPedido/u);
    assert.match(source, /requestIdDoPedido/u);
    assert.doesNotMatch(source, /presencaComando|criarEAplicarComandoPresenca|app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1/u);
  }
});

test('professor exibe fonte, horário, regra, frescor e recibo', () => {
  assert.match(professor, /rotuloPresencaFonte/u);
  assert.match(professor, /decididoEm/u);
  assert.match(professor, /reciboStatus/u);
  assert.match(professor, /regraVersao/u);
  assert.match(professor, /sincronizadoEm/u);
  assert.match(professor, /Em auditoria/u);
  assert.match(professor, /Dados desatualizados/u);
  assert.match(professor, /type="button"/u);
});

