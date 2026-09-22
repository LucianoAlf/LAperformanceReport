import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DIAS_SEMANA_TURMAS,
  agruparTurmasPorDia,
  filtrarTurmas,
  formatarHorarioTurma,
  nivelOcupacaoTurma,
  textoOcupacaoTurma,
} from '../src/lib/turmas.ts';
import { ABAS_PORTADAS, abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/alunos/TurmasMobile.tsx');
const linha = le('../src/mobile/telas/alunos/LinhaTurma.tsx');
const desktop = le('../src/components/App/Alunos/GestaoTurmas.tsx');
const libSala = le('../src/lib/turmaSala.ts');

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const turma = (p = {}) => ({
  professor_id: 1,
  professor_nome: 'Gabriel Ribeiro',
  curso_nome: 'Violão',
  dia_semana: 'Terça',
  horario_inicio: '14:00:00',
  capacidade_maxima: 4,
  total_alunos: 3,
  nomes_alunos: [],
  ...p,
});

// ---------------------------------------------------------------- valor ----

test('o recorte é o mesmo da tela do computador', () => {
  const base = [
    turma({ professor_id: 1, dia_semana: 'Terça', total_alunos: 1 }),
    turma({ professor_id: 2, dia_semana: 'Terça', total_alunos: 2 }),
    turma({ professor_id: 1, dia_semana: 'Quinta', total_alunos: 4 }),
    turma({ professor_id: 3, dia_semana: 'Sexta', total_alunos: 0 }),
  ];
  assert.equal(filtrarTurmas(base).length, 4, 'sem filtro devolve tudo');
  assert.equal(filtrarTurmas(base, { professor_id: '1' }).length, 2);
  assert.equal(filtrarTurmas(base, { dia: 'Terça' }).length, 2);
  assert.equal(filtrarTurmas(base, { ocupacao: '1' }).length, 1);
  assert.equal(filtrarTurmas(base, { ocupacao: '2' }).length, 1);
  assert.equal(filtrarTurmas(base, { ocupacao: '3+' }).length, 1);
  assert.equal(filtrarTurmas(base, { ocupacao: '0' }).length, 1);
  // Somados, como no desktop.
  assert.equal(filtrarTurmas(base, { professor_id: '1', dia: 'Terça' }).length, 1);
});

test('🔴 "3 ou mais" inclui a turma cheia', () => {
  // O filtro do desktop é `>= 3`, então uma turma de 4 (cheia) entra. Trocar
  // por `=== 3` esconderia justamente as lotadas.
  const base = [turma({ total_alunos: 3 }), turma({ total_alunos: 4 }), turma({ total_alunos: 8 })];
  assert.equal(filtrarTurmas(base, { ocupacao: '3+' }).length, 3);
});

test('todo dia da semana aparece no agrupamento, mesmo vazio', () => {
  // Quem olha a grade precisa ver que a quinta não tem nada — e não que a
  // quinta sumiu.
  const agrupado = agruparTurmasPorDia([turma({ dia_semana: 'Terça' })]);
  assert.deepEqual(Object.keys(agrupado), DIAS_SEMANA_TURMAS.map((d) => d.valor));
  assert.equal(agrupado['Quinta'].length, 0);
  assert.equal(agrupado['Terça'].length, 1);
});

test('dentro do dia, a ordem é a do horário', () => {
  const agrupado = agruparTurmasPorDia([
    turma({ dia_semana: 'Terça', horario_inicio: '18:00:00' }),
    turma({ dia_semana: 'Terça', horario_inicio: '08:30:00' }),
    turma({ dia_semana: 'Terça', horario_inicio: '14:00:00' }),
  ]);
  assert.deepEqual(agrupado['Terça'].map((t) => t.horario_inicio), ['08:30:00', '14:00:00', '18:00:00']);
});

test('agrupar não altera o array de quem chamou', () => {
  const base = [turma({ dia_semana: 'Terça', horario_inicio: '18:00:00' }), turma({ dia_semana: 'Terça', horario_inicio: '08:00:00' })];
  const antes = base.map((t) => t.horario_inicio);
  agruparTurmasPorDia(base);
  assert.deepEqual(base.map((t) => t.horario_inicio), antes);
});

test('🔴 um aluno só é ALERTA — é o que o indicador SOZINHOS conta', () => {
  assert.equal(nivelOcupacaoTurma(0), 'vazia');
  assert.equal(nivelOcupacaoTurma(1), 'sozinho');
  assert.equal(nivelOcupacaoTurma(2), 'dupla');
  assert.equal(nivelOcupacaoTurma(3), 'ok');
  assert.equal(nivelOcupacaoTurma(4), 'cheia');
  assert.equal(nivelOcupacaoTurma(5), 'cheia');
  // Capacidade diferente move o "cheia", não o "sozinho".
  assert.equal(nivelOcupacaoTurma(2, 2), 'dupla');
  assert.equal(nivelOcupacaoTurma(6, 6), 'cheia');
  assert.equal(nivelOcupacaoTurma(1, 8), 'sozinho');
});

test('o texto da ocupação concorda com o número', () => {
  assert.equal(textoOcupacaoTurma(1, 4), '1/4 aluno');
  assert.equal(textoOcupacaoTurma(3, 4), '3/4 alunos');
  assert.equal(textoOcupacaoTurma(0, 4), '0/4 alunos');
});

test('o horário perde os segundos', () => {
  assert.equal(formatarHorarioTurma('14:00:00'), '14:00');
  assert.equal(formatarHorarioTurma('08:30'), '08:30');
  assert.equal(formatarHorarioTurma(null), '');
  assert.equal(formatarHorarioTurma('manhã'), 'manhã');
});

// ------------------------------------------------------- contrato do código ----

test('🔴 o computador e o celular leem a MESMA régua', () => {
  assert.match(desktop, /from '@\/lib\/turmas'/);
  assert.match(desktop, /agruparTurmasPorDia\(filtrarTurmas\(/);
  assert.match(desktop, /nivelOcupacaoTurma\(/);
  // A cascata antiga não pode voltar a viver dentro do componente.
  const limpo = semComentarios(desktop);
  assert.doesNotMatch(limpo, /if \(totalAlunos === 1\)/, 'a régua de ocupação voltou para o desktop');
  assert.doesNotMatch(limpo, /filtros\.ocupacao === '3\+'/, 'o filtro voltou para o desktop');
});

test('🔴 a escrita da sala tem UMA implementação', () => {
  assert.match(desktop, /vincularSalaNaTurma\(/);
  assert.match(tela, /vincularSalaNaTurma\(/);
  // O INSERT monta oito colunas à mão: duas cópias divergiriam no primeiro
  // campo que alguém acrescentasse.
  for (const [nome, fonte] of [['GestaoTurmas', desktop], ['TurmasMobile', tela]]) {
    assert.doesNotMatch(
      semComentarios(fonte),
      /from\('turmas_explicitas'\)/,
      `${nome} escreve em turmas_explicitas por conta própria`,
    );
  }
});

test('🔴 TODA falha do vínculo carrega o identificador da turma', () => {
  // "Erro ao vincular sala. Tente novamente." não acha nada depois. Mensagem
  // sem a turma e sem o motivo do banco é rastro que não serve.
  //
  // ⚠️ Este assert já foi fraco: procurar só a palavra `ondeFoi` passava com
  // um mutante que renomeava a variável para `ondeFoiX` e deixava as
  // mensagens sem ela. O que se confere é cada mensagem de erro.
  const mensagens = [...libSala.matchAll(/erro:\s*(`[^`]*`|'[^']*')/g)].map((m) => m[1]);
  assert.ok(mensagens.length >= 3, `poucas mensagens de erro (${mensagens.length})`);
  for (const msg of mensagens) {
    assert.match(msg, /\$\{ondeFoi\}/, `mensagem sem identificador da turma: ${msg}`);
  }
  // E o identificador precisa nomear a turma de verdade.
  assert.match(libSala, /const ondeFoi = `turma \$\{turma\.professor_nome/);

  // O client devolve { data, error } e não lança: erro de leitura lido como
  // "não existe" criaria turma duplicada.
  assert.match(libSala, /if \(erroBusca\) return \{ ok: false/);
});

test('nenhuma regra nasce na tela do celular', () => {
  assert.match(tela, /from '@\/lib\/turmas'/);
  for (const [nome, fonte] of [['TurmasMobile', tela], ['LinhaTurma', linha]]) {
    const limpo = semComentarios(fonte);
    assert.doesNotMatch(limpo, /from '@\/lib\/supabase'/, `${nome} importa o client`);
    assert.doesNotMatch(limpo, /total_alunos === 1|total_alunos >= 3/, `${nome} reimplementou a ocupação`);
  }
});

test('o alvo de toque tem 44px', () => {
  const alturas = [...tela.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length >= 5, 'poucos alvos declaram altura mínima');
  assert.ok(alturas.every((px) => px >= 36), 'alvo abaixo de 36px');
  assert.ok(alturas.filter((px) => px !== 36).every((px) => px >= 44), 'ação com menos de 44px');
  // O botão de remover aluno é quadrado: a altura vem de h-11 (44px).
  assert.match(tela, /h-11 w-11/);
});

test('o nome do professor entra abreviado na linha', () => {
  // Medido na Chamada em 21/09: o nome inteiro truncava 7 de 20 linhas, e o
  // que sumia era sempre a sala — para onde a pessoa vai.
  assert.match(linha, /abreviarNome\(/);
});

test('o cabeçalho do dia gruda e cobre a sangria', () => {
  assert.match(tela, /sticky top-0/);
  assert.match(tela, /before:bottom-full/);
});

test('a aba entrou nas portadas', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'turmas'), true);
  // Mesma régua do teste do LTV: trava o par, não a lista inteira.
  for (const pendente of ['grade', 'distribuicao', 'automacao', 'conciliacao', 'importar']) {
    assert.equal(abaFoiPortada('/app/alunos', pendente), false, `${pendente} entrou sem ter sido portada`);
  }
  assert.ok(ABAS_PORTADAS['/app/alunos'].includes('lista'));
});

test('⚠️ a bifurcação fica depois dos hooks e o JSX do desktop segue lá', () => {
  const iHook = Math.max(desktop.lastIndexOf('useMemo('), desktop.lastIndexOf('useEffect('), desktop.lastIndexOf('useState('));
  const iBif = desktop.indexOf('if (ehCelular) {');
  assert.ok(iBif > -1, 'a bifurcação sumiu');
  assert.ok(iHook < iBif, 'há hook depois da bifurcação');
  const bloco = desktop.slice(iBif);
  assert.match(bloco, /getBadgeOcupacao/, 'o badge do desktop sumiu');
  assert.match(bloco, /DIAS_SEMANA\.map|DIAS_SEMANA\.forEach/, 'a grade por dia do desktop sumiu');
});
