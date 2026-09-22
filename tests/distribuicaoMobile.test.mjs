import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DIAS_DISTRIBUICAO,
  HORARIOS_SABADO,
  HORARIOS_SEG_SEX,
  avisosDoMapaDeCalor,
  estatisticasPorCurso,
  estatisticasPorDia,
  estatisticasPorHorario,
  estatisticasPorProfessor,
  horaCheia,
  horariosDoDia,
  montarMapaDeCalor,
  nivelDoCalor,
} from '../src/lib/distribuicaoTurmas.ts';
import { ABAS_PORTADAS, abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/alunos/DistribuicaoMobile.tsx');
const desktop = le('../src/components/App/Alunos/DistribuicaoAlunos.tsx');

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const t = (p = {}) => ({
  professor_id: 1,
  curso_nome: 'Violão',
  dia_semana: 'Terça',
  horario_inicio: '14:00:00',
  total_alunos: 2,
  ...p,
});

// ---------------------------------------------------------------- valor ----

test('🔴 professor SEM turma aparece com zero', () => {
  // É justamente o caso que a coordenação procura. Partir das turmas o
  // esconderia, porque ele não tem nenhuma.
  const stats = estatisticasPorProfessor([t({ professor_id: 1 })], [
    { id: 1, nome: 'Ana' },
    { id: 2, nome: 'Bruno' },
  ]);
  assert.equal(stats.length, 2);
  const bruno = stats.find((s) => s.nome === 'Bruno');
  assert.deepEqual([bruno.totalAlunos, bruno.totalTurmas, bruno.mediaAlunos], [0, 0, 0]);
});

test('a ordem é por alunos, com desempate pelo nome', () => {
  const stats = estatisticasPorProfessor(
    [t({ professor_id: 1, total_alunos: 3 }), t({ professor_id: 2, total_alunos: 3 })],
    [{ id: 2, nome: 'Zeca' }, { id: 1, nome: 'Ana' }, { id: 3, nome: 'Bia' }],
  );
  assert.deepEqual(stats.map((s) => s.nome), ['Ana', 'Zeca', 'Bia']);
});

test('turma sem curso entra como "Sem curso"', () => {
  // Sumir com ela esconderia o vazio de cadastro.
  const stats = estatisticasPorCurso([t({ curso_nome: undefined }), t({ curso_nome: 'Piano' })]);
  assert.deepEqual(stats.map((c) => c.nome).sort(), ['Piano', 'Sem curso']);
});

test('todo dia da semana aparece, mesmo zerado', () => {
  const stats = estatisticasPorDia([t({ dia_semana: 'Terça' })]);
  assert.deepEqual(stats.map((d) => d.dia), [...DIAS_DISTRIBUICAO]);
  assert.equal(stats.find((d) => d.dia === 'Quinta').totalAlunos, 0);
});

test('o horário perde os segundos e ordena em ordem de relógio', () => {
  assert.equal(horaCheia('14:00:00'), '14:00');
  assert.equal(horaCheia(null), '00:00');
  const stats = estatisticasPorHorario([
    t({ horario_inicio: '18:00:00' }),
    t({ horario_inicio: '08:00:00' }),
    t({ horario_inicio: '08:00' }),
  ]);
  assert.deepEqual(stats.map((h) => h.horario), ['08:00', '18:00']);
  assert.equal(stats[0].totalTurmas, 2, '"08:00" e "08:00:00" são a mesma hora');
});

test('🔴 sábado não tem 17h — e a célula NÃO existe, em vez de valer zero', () => {
  // Zero ali diria "está vazio" sobre um horário em que a escola não abre.
  assert.equal(horariosDoDia('Sábado').length, HORARIOS_SABADO.length);
  assert.equal(horariosDoDia('Terça').length, HORARIOS_SEG_SEX.length);
  const { mapa } = montarMapaDeCalor([]);
  assert.equal(mapa['Sábado']['17:00'], undefined);
  assert.deepEqual(mapa['Terça']['17:00'], { alunos: 0, turmas: 0 });
});

test('🔴 turma fora da grade é DEVOLVIDA, não engolida', () => {
  // Antes isto era um `console.log` dentro do componente: a turma sumia do
  // mapa e ninguém ficava sabendo.
  const { foraDaGrade, mapa } = montarMapaDeCalor([
    t({ dia_semana: 'Sábado', horario_inicio: '20:00:00', total_alunos: 3 }),
    t({ dia_semana: 'Terça', horario_inicio: '07:00:00', total_alunos: 1 }),
    t({ dia_semana: 'Terça', horario_inicio: '14:00:00', total_alunos: 2 }),
  ]);
  assert.equal(foraDaGrade.length, 2);
  assert.deepEqual(foraDaGrade[0], { dia: 'Sábado', horario: '20:00', alunos: 3 });
  assert.equal(mapa['Terça']['14:00'].alunos, 2, 'a que cabe continua contando');
});

test('o mapa soma alunos e turmas na mesma célula', () => {
  const { mapa, maxAlunos } = montarMapaDeCalor([
    t({ dia_semana: 'Terça', horario_inicio: '14:00', total_alunos: 2 }),
    t({ dia_semana: 'Terça', horario_inicio: '14:00', total_alunos: 3 }),
  ]);
  assert.deepEqual(mapa['Terça']['14:00'], { alunos: 5, turmas: 2 });
  assert.equal(maxAlunos, 5);
});

test('a intensidade do calor é relativa ao pico', () => {
  assert.equal(nivelDoCalor(0, 10), 'vazio');
  assert.equal(nivelDoCalor(2, 10), 'baixo');
  assert.equal(nivelDoCalor(4, 10), 'medio');
  assert.equal(nivelDoCalor(7, 10), 'alto');
  assert.equal(nivelDoCalor(10, 10), 'pico');
  // Sem pico não há divisão por zero.
  assert.equal(nivelDoCalor(0, 0), 'vazio');
});

test('🔴 cada aviso tem limiar — frase que sai sempre é legenda, não achado', () => {
  // Manhã cheia: o aviso de manhã subutilizada NÃO aparece.
  const manhaCheia = montarMapaDeCalor([
    t({ dia_semana: 'Terça', horario_inicio: '09:00', total_alunos: 10 }),
    t({ dia_semana: 'Quarta', horario_inicio: '10:00', total_alunos: 10 }),
  ]);
  const avisos1 = avisosDoMapaDeCalor(manhaCheia);
  assert.ok(avisos1.some((a) => /pico/i.test(a)), 'o pico sempre é dito');
  assert.ok(!avisos1.some((a) => /subutilizadas/i.test(a)), 'avisou manhã vazia com a manhã cheia');

  // Tudo à noite: aí sim.
  const soNoite = montarMapaDeCalor([t({ dia_semana: 'Terça', horario_inicio: '19:00', total_alunos: 10 })]);
  assert.ok(avisosDoMapaDeCalor(soNoite).some((a) => /subutilizadas/i.test(a)));
});

test('o aviso de sábado só sai acima de 20% da média dos dias úteis', () => {
  const sabadoForte = montarMapaDeCalor([
    t({ dia_semana: 'Sábado', horario_inicio: '10:00', total_alunos: 20 }),
    t({ dia_semana: 'Terça', horario_inicio: '14:00', total_alunos: 5 }),
  ]);
  assert.ok(avisosDoMapaDeCalor(sabadoForte).some((a) => /Sábado/.test(a)));

  const equilibrado = montarMapaDeCalor(
    [...DIAS_DISTRIBUICAO].map((dia) => t({ dia_semana: dia, horario_inicio: '14:00', total_alunos: 5 })),
  );
  assert.ok(!avisosDoMapaDeCalor(equilibrado).some((a) => /Sábado/.test(a)));
});

test('🔴 a forma longa do dia entra nas contagens e no mapa', () => {
  // 135 das 895 turmas gravam "Quarta-feira". Comparando texto cru, elas
  // sumiam do total por dia E do mapa de calor — e o único aviso disso era um
  // `console.log`.
  const stats = estatisticasPorDia([
    t({ dia_semana: 'Quarta', total_alunos: 2 }),
    t({ dia_semana: 'Quarta-feira', total_alunos: 3 }),
  ]);
  assert.equal(stats.find((d) => d.dia === 'Quarta').totalAlunos, 5);

  const { mapa, foraDaGrade } = montarMapaDeCalor([
    t({ dia_semana: 'Quarta-feira', horario_inicio: '15:00', total_alunos: 4 }),
  ]);
  assert.equal(mapa['Quarta']['15:00'].alunos, 4);
  assert.equal(foraDaGrade.length, 0, 'a forma longa continuava fora da grade');
});

// ------------------------------------------------------- contrato do código ----

test('🔴 o computador e o celular leem as MESMAS contas', () => {
  assert.match(desktop, /from '@\/lib\/distribuicaoTurmas'/);
  for (const fn of [
    'estatisticasPorProfessor',
    'estatisticasPorCurso',
    'estatisticasPorDia',
    'estatisticasPorHorario',
    'montarMapaDeCalor',
    'avisosDoMapaDeCalor',
    'nivelDoCalor',
  ]) {
    assert.match(desktop, new RegExp(`${fn}\\(`), `o desktop não usa ${fn}`);
    assert.match(tela, new RegExp(`${fn}\\(`), `o celular não usa ${fn}`);
  }
  // As contas não podem voltar a nascer dentro do componente.
  const limpo = semComentarios(desktop);
  assert.doesNotMatch(limpo, /Horário de pico:/, 'os avisos voltaram para o desktop');
  assert.doesNotMatch(limpo, /const horariosSegSex = \[/, 'a grade de horários voltou para o desktop');
});

test('🔴 o console.log de depuração não voltou', () => {
  // Turma em horário fora da grade sumia do mapa avisando só o console.
  assert.doesNotMatch(semComentarios(desktop), /Turma 16h não mapeada/);
  assert.doesNotMatch(semComentarios(tela), /console\.log/);
  assert.doesNotMatch(semComentarios(desktop), /console\.log/);
  // E o dado agora existe de verdade.
  assert.match(tela, /foraDaGrade/);
});

test('a tela do celular não consulta o banco', () => {
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /from '@\/lib\/supabase'/);
  assert.doesNotMatch(limpo, /supabase\.rpc/);
});

test('o alvo de toque dos chips tem 36px', () => {
  const alturas = [...tela.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length >= 1);
  assert.ok(alturas.every((px) => px >= 36));
});

test('🔴 a escala da barra é dita, não suposta', () => {
  // Barra cheia sem escala declarada é lida como "100%".
  assert.match(tela, /maior barra = \{maior\}|maior barra = /);
  assert.match(tela, /const maior = Math\.max/);
});

test('a aba entrou nas portadas, e a função responde pela lista viva', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'distribuicao'), true);
  const TODAS = ['lista', 'turmas', 'grade', 'distribuicao', 'importar', 'automacao', 'historico', 'conciliacao'];
  const portadas = ABAS_PORTADAS['/app/alunos'];
  for (const aba of TODAS) {
    assert.equal(abaFoiPortada('/app/alunos', aba), portadas.includes(aba), `${aba}: a função discorda da lista`);
  }
});

test('⚠️ a bifurcação fica depois dos hooks e o JSX do desktop segue lá', () => {
  const iHook = Math.max(desktop.lastIndexOf('useMemo('), desktop.lastIndexOf('useState('));
  const iBif = desktop.indexOf('if (ehCelular) {');
  assert.ok(iBif > -1, 'a bifurcação sumiu');
  assert.ok(iHook < iBif, 'há hook depois da bifurcação');
  const bloco = desktop.slice(iBif);
  assert.match(bloco, /getCorCalor/, 'o mapa de calor do desktop sumiu');
  assert.match(bloco, /mostrarTodosProfessores/, 'a lista de professores do desktop sumiu');
});
