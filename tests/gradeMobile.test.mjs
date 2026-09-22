import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DIAS_DA_GRADE,
  HORAS_DA_GRADE,
  gradeDoDia,
  horaDaTurma,
  pesoDaHora,
  professoresNaGrade,
  resumoPorDia,
  turmasForaDaGrade,
} from '../src/lib/gradeHoraria.ts';
import { ABAS_PORTADAS, abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/alunos/GradeMobile.tsx');
const desktop = le('../src/components/App/Turmas/GradeHoraria/GradeHoraria.tsx');
const lib = le('../src/lib/gradeHoraria.ts');

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const turma = (over = {}) => ({
  professor_id: 1,
  professor_nome: 'Gabriel Ribeiro',
  sala_nome: 'Sala 2',
  curso_nome: 'Violão',
  dia_semana: 'Quarta',
  horario_inicio: '14:00:00',
  capacidade_maxima: 4,
  num_alunos: 1,
  ...over,
});

// ---------------------------------------------------------------- valor ----

test('🔴 o dia por extenso entra na grade — eram 135 de 896 sumindo', () => {
  // Dois caminhos de escrita: o webhook grava "Quarta-feira", o sync grava
  // "Quarta". A matriz do computador indexava pelo texto cru e descartava a
  // forma longa em silêncio.
  const base = [
    turma({ dia_semana: 'Quarta' }),
    turma({ dia_semana: 'Quarta-feira', professor_id: 2, professor_nome: 'Ana Lima' }),
  ];
  const g = gradeDoDia(base, 'Quarta');
  assert.equal(g.totalTurmas, 2, 'a forma longa do dia continua sendo descartada');

  const resumo = resumoPorDia(base).find((r) => r.dia === 'Quarta');
  assert.equal(resumo.totalTurmas, 2);
});

test('a grade de um dia não mostra os outros dias', () => {
  // Parece óbvio e não é: um recorte que some faz a segunda-feira exibir a
  // semana inteira, e nada na tela diz que aquilo não é segunda.
  const base = [
    turma({ dia_semana: 'Quarta', curso_nome: 'Violão' }),
    turma({ dia_semana: 'Quinta', curso_nome: 'Piano' }),
    turma({ dia_semana: 'Segunda', curso_nome: 'Canto' }),
  ];
  const quarta = gradeDoDia(base, 'Quarta');
  assert.equal(quarta.totalTurmas, 1);
  assert.deepEqual(
    quarta.blocos.flatMap((b) => b.turmas).map((t) => t.curso_nome),
    ['Violão'],
  );
  assert.equal(gradeDoDia(base, 'Sexta').totalTurmas, 0, 'dia sem turma tem de vir vazio');
});

test('toda hora da grade aparece, inclusive a vazia', () => {
  // Quem procura buraco precisa ver a hora vazia; sumir com ela é sumir com
  // a resposta.
  const g = gradeDoDia([turma({ horario_inicio: '14:00' })], 'Quarta');
  assert.equal(g.blocos.length, HORAS_DA_GRADE.length);
  assert.deepEqual(
    g.blocos.map((b) => b.hora),
    [...HORAS_DA_GRADE],
  );
  assert.ok(g.horasLivres.includes('08:00'));
  assert.ok(!g.horasLivres.includes('14:00'));
});

test('todo dia da semana tem chip, mesmo zerado', () => {
  const resumos = resumoPorDia([turma()]);
  assert.equal(resumos.length, 6, 'a semana da grade tem seis dias');
  assert.deepEqual(
    resumos.map((r) => r.dia),
    DIAS_DA_GRADE.map((d) => d.valor),
  );
  assert.equal(resumos.find((r) => r.dia === 'Segunda').totalTurmas, 0);
});

test('a hora soma os alunos do bloco', () => {
  const g = gradeDoDia(
    [
      turma({ horario_inicio: '14:00', num_alunos: 3 }),
      turma({ horario_inicio: '14:00', professor_id: 2, num_alunos: 2 }),
      turma({ horario_inicio: '15:00', num_alunos: 5 }),
    ],
    'Quarta',
  );
  const h14 = g.blocos.find((b) => b.hora === '14:00');
  assert.equal(h14.turmas.length, 2);
  assert.equal(h14.totalAlunos, 5);
  assert.equal(g.totalTurmas, 3);
  assert.equal(g.totalAlunos, 10);
});

test('⚠️ a ordem dentro da hora não dança entre renderizações', () => {
  // Sem desempate completo, quem procura um nome o encontra em lugar
  // diferente a cada toque.
  const base = [
    turma({ sala_nome: 'Sala 3', professor_nome: 'Bruno', professor_id: 3, curso_nome: 'Bateria' }),
    turma({ sala_nome: 'Sala 1', professor_nome: 'Carla', professor_id: 4, curso_nome: 'Canto' }),
    turma({ sala_nome: 'Sala 1', professor_nome: 'Ana', professor_id: 5, curso_nome: 'Violão' }),
    // ⚠️ O par que só a chave desempata: mesmo professor, mesma sala, mesma
    // hora, cursos diferentes. Medido nas 895 turmas, isso acontece 7 vezes.
    turma({ sala_nome: 'Sala 1', professor_nome: 'Ana', professor_id: 5, curso_nome: 'Teclado' }),
  ];
  const rotular = (lista) => lista.map((t) => `${t.sala_nome}/${t.professor_nome}/${t.curso_nome}`);
  const ordem = () => rotular(
    gradeDoDia(base, 'Quarta').blocos.find((b) => b.hora === '14:00').turmas,
  );
  assert.deepEqual(ordem(), [
    'Sala 1/Ana/Teclado',
    'Sala 1/Ana/Violão',
    'Sala 1/Carla/Canto',
    'Sala 3/Bruno/Bateria',
  ]);
  // Mesma entrada em outra ordem de chegada dá exatamente a mesma saída.
  const invertida = rotular(
    gradeDoDia([...base].reverse(), 'Quarta').blocos.find((b) => b.hora === '14:00').turmas,
  );
  assert.deepEqual(invertida, ordem());
});

test('🔴 quem não cabe na grade vira DADO, nunca silêncio', () => {
  const base = [
    turma({ dia_semana: 'Domingo' }),
    turma({ horario_inicio: '06:30' }),
    turma({ horario_inicio: '22:00' }),
    turma(),
  ];
  const fora = turmasForaDaGrade(base);
  assert.equal(fora.length, 3);
  assert.deepEqual(fora.map((f) => f.motivo).sort(), ['dia', 'hora', 'hora']);
  // E a forma longa do dia NÃO conta como fora — ela é válida.
  assert.equal(turmasForaDaGrade([turma({ dia_semana: 'Sexta-feira' })]).length, 0);
});

test('a lista de professores sai das turmas, não do cadastro', () => {
  const base = [
    turma({ professor_id: 2, professor_nome: 'Zeca' }),
    turma({ professor_id: 1, professor_nome: 'Ana' }),
    turma({ professor_id: 1, professor_nome: 'Ana' }),
  ];
  const profs = professoresNaGrade(base);
  assert.deepEqual(profs.map((p) => p.nome), ['Ana', 'Zeca'], 'fora de ordem alfabética');
  assert.equal(profs.find((p) => p.nome === 'Ana').turmas, 2);
});

test('⚠️ a barra da hora mede contra o pico do DIA', () => {
  // Régua absoluta pintaria o sábado inteiro de frio mesmo lotado para o que
  // ele é — ele tem 8 horas úteis contra 12 de uma terça.
  assert.equal(pesoDaHora(5, 10), 0.5);
  assert.equal(pesoDaHora(10, 10), 1);
  assert.equal(pesoDaHora(0, 10), 0);
  assert.equal(pesoDaHora(3, 0), 0, 'dia sem turma não pode dividir por zero');
  assert.equal(pesoDaHora(12, 10), 1, 'nunca passa de 100%');
});

test('"14:00:00" e "14:00" são a mesma hora', () => {
  assert.equal(horaDaTurma({ horario_inicio: '14:00:00' }), '14:00');
  assert.equal(horaDaTurma({ horario_inicio: '14:00' }), '14:00');
  const g = gradeDoDia([turma({ horario_inicio: '14:00:00' })], 'Quarta');
  assert.equal(g.blocos.find((b) => b.hora === '14:00').turmas.length, 1);
});

// ------------------------------------------------------ contrato do código ----

test('🔴 o computador passou a normalizar o dia — e não tem outra régua', () => {
  assert.match(desktop, /from '@\/lib\/turmas'/);
  assert.match(desktop, /const dia = normalizarDiaSemana\(turma\.dia_semana\)/);
  const limpo = semComentarios(desktop);
  assert.doesNotMatch(
    limpo,
    /const dia = turma\.dia_semana;/,
    'o agrupamento voltou a ler o dia cru',
  );
});

test('🔴 a identidade da turma na key não é mais o índice da lista', () => {
  // `turma.id` é `turma_explicita_id || index+1`: medido, 202 das 896
  // colidem, e key duplicada faz o React reaproveitar o nó errado.
  assert.match(desktop, /key=\{chaveDaTurma\(turma\)\}/);
  const limpo = semComentarios(desktop);
  assert.doesNotMatch(limpo, /key=\{turma\.id\}/, 'a key voltou a ser o id derivado do índice');
});

test('🔴 tocar numa turma no celular abre o MESMO modal do computador', () => {
  // A bifurcação fica antes do JSX do desktop, onde os modais moram — sem
  // repetir este aqui, o toque guardava a seleção e não abria nada.
  const ramo = desktop.slice(
    desktop.indexOf('if (ehCelular) {'),
    desktop.indexOf('\n  return (\n    <div className="space-y-4">'),
  );
  assert.match(ramo, /<ModalDetalhesTurma/, 'o celular ficou sem o modal de detalhes');
  assert.match(ramo, /onSalaVinculada=/, 'vincular sala não recarrega a grade no celular');
  // E ele não pode ter virado uma cópia dentro da pasta do celular.
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /nomes_alunos\.map/, 'a lista de alunos do modal foi copiada para a tela');
});

test('a tela do celular não consulta o banco', () => {
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /from '@\/lib\/supabase'/);
  assert.doesNotMatch(limpo, /vw_turmas_implicitas/);
  assert.match(tela, /from '@\/lib\/gradeHoraria'/);
});

test('🔴 a tela do celular não promete arrastar', () => {
  // O gesto não atravessa para o dedo — e, medido, ele também não funciona
  // no computador: a confirmação escreve em `turmas`, que tem zero linhas.
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /@dnd-kit/);
  assert.doesNotMatch(limpo, /useDraggable|useDroppable/);
  assert.doesNotMatch(limpo, /dragEnabled/);
});

test('nenhuma regra de agrupamento foi reescrita na tela', () => {
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /'Quarta-feira'/, 'a normalização do dia foi copiada para a tela');
  assert.doesNotMatch(limpo, /\breplace\(.*feira/i);
  assert.match(tela, /gradeDoDia\(/);
  assert.match(tela, /resumoPorDia\(/);
});

test('o alvo de toque tem 44px', () => {
  const alturas = [...tela.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length >= 3, 'quase nenhum alvo declara altura mínima');
  assert.ok(alturas.every((px) => px >= 44), 'alvo abaixo de 44px');
});

test('⚠️ hora livre não vira botão', () => {
  // Um alvo tocável que não abre nada promete e não cumpre.
  const bloco = tela.slice(tela.indexOf('if (vazio)'), tela.indexOf('return (\n              <div key={bloco.hora}>'));
  assert.doesNotMatch(bloco, /<button/, 'a hora livre virou alvo de toque');
  assert.match(bloco, /livre/);
});

test('🔴 nada de `sticky` aqui — o container o engole', () => {
  // Medido no navegador: a <section> que envolve as abas em AlunosPage tem
  // `overflow-hidden`, e ancestral com overflow escondido vira o container
  // de rolagem do sticky. O cabeçalho saía de vista junto com o conteúdo:
  // uma declaração que não fazia nada, indistinguível de uma que funciona.
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /\bsticky\b/, 'voltou um sticky que o container engole');
});

test('⚠️ nada sangra para fora da <section> a não ser o trilho', () => {
  // Margem negativa aqui é cortada em silêncio pelo mesmo `overflow-hidden`:
  // medido, o wrapper ficava com 378px dentro de um cartão de 356px.
  const limpo = semComentarios(tela);
  const negativas = [...limpo.matchAll(/-m[xytblr]?-\d+/g)].map((m) => m[0]);
  const linhasComNegativa = limpo
    .split('\n')
    .filter((l) => /-m[xytblr]?-\d+/.test(l));
  assert.ok(negativas.length <= 1, `margens negativas demais: ${negativas.join(', ')}`);
  for (const linha of linhasComNegativa) {
    assert.match(
      linha,
      /overflow-x-auto/,
      'margem negativa fora do trilho que rola — o container corta isso',
    );
  }
});

test('a aba entrou nas portadas, e a função responde pela lista viva', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'grade'), true);

  const TODAS = ['lista', 'turmas', 'grade', 'distribuicao', 'importar', 'automacao', 'historico', 'conciliacao'];
  const portadas = ABAS_PORTADAS['/app/alunos'];
  for (const aba of TODAS) {
    assert.equal(
      abaFoiPortada('/app/alunos', aba),
      portadas.includes(aba),
      `${aba}: a função discorda da lista`,
    );
  }
  assert.equal(abaFoiPortada('/app/alunos', 'aba_que_nao_existe'), false);
});

test('⚠️ a bifurcação fica depois dos hooks e o JSX do desktop segue lá', () => {
  const iBif = desktop.indexOf('if (ehCelular) {');
  assert.ok(iBif > -1, 'a bifurcação sumiu');
  for (const hook of ['useState(', 'useEffect(', 'useMemo(', 'useCallback(']) {
    assert.equal(desktop.indexOf(hook, iBif), -1, `há ${hook} depois da bifurcação`);
  }
  const bloco = desktop.slice(iBif);
  assert.match(bloco, /<table className="w-full min-w-\[800px\]">/, 'a matriz do desktop sumiu');
  assert.match(bloco, /DndContext/, 'o arraste do desktop sumiu');
});

test('a lib não importa React nem toca no DOM', () => {
  assert.doesNotMatch(lib, /from 'react'/);
  assert.doesNotMatch(semComentarios(lib), /document\.|window\./);
});
