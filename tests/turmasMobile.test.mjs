import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DIAS_SEMANA_TURMAS,
  agruparTurmasPorDia,
  chaveDaTurma,
  diaDeHojeNaGrade,
  filtrarTurmas,
  formatarHorarioTurma,
  normalizarDiaSemana,
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

test('os níveis de ocupação', () => {
  assert.equal(nivelOcupacaoTurma(0), 'vazia');
  assert.equal(nivelOcupacaoTurma(1), 'sozinho');
  assert.equal(nivelOcupacaoTurma(2), 'dupla');
  assert.equal(nivelOcupacaoTurma(3), 'ok');
  assert.equal(nivelOcupacaoTurma(4, 4), 'cheia');
  assert.equal(nivelOcupacaoTurma(5, 4), 'cheia');
  // Sem capacidade declarada NÃO existe "cheia": quem quer o padrão da casa
  // passa o 4 explicitamente, como o desktop faz (`capacidade_maxima || 4`).
  assert.equal(nivelOcupacaoTurma(4), 'ok');
  // Capacidade diferente move o "cheia", não o "sozinho".
  assert.equal(nivelOcupacaoTurma(2, 2), 'dupla');
  assert.equal(nivelOcupacaoTurma(6, 6), 'cheia');
  assert.equal(nivelOcupacaoTurma(1, 8), 'sozinho');
});

test('🔴 capacidade desconhecida NUNCA vira "cheia" — `3 >= null` é true', () => {
  // 630 das 895 turmas (70%) não têm capacidade cadastrada. Sem esta guarda,
  // a comparação com null é verdadeira e a turma sai como lotada.
  assert.equal(nivelOcupacaoTurma(3, null), 'ok');
  assert.equal(nivelOcupacaoTurma(9, undefined), 'ok');
  assert.equal(nivelOcupacaoTurma(0, null), 'vazia');
  assert.equal(nivelOcupacaoTurma(1, null), 'sozinho');
});

test('🔴 sem capacidade não se inventa denominador', () => {
  // "1/4" onde ninguém declarou 4 afirma uma lotação que o cadastro não tem —
  // e era o "1/null" que a tela mostrava antes.
  assert.equal(textoOcupacaoTurma(1, null), '1 aluno');
  assert.equal(textoOcupacaoTurma(3, undefined), '3 alunos');
  assert.doesNotMatch(textoOcupacaoTurma(1, null), /null|\//);
});

test('🔴 a cor da linha NÃO marca "um aluno" — são 83% da base', () => {
  // Medido: 745 de 895 turmas têm um aluno só, e 105 das 160 linhas do dia
  // acendiam. Alerta que acende na maioria vira fundo.
  const bloco = linha.slice(linha.indexOf('const TOM'), linha.indexOf('interface Props'));
  const sozinho = /sozinho:\s*\{[^}]*\}/.exec(bloco)?.[0] ?? '';
  assert.ok(sozinho, 'o mapa de tons sumiu');
  assert.doesNotMatch(sozinho, /red|rose|amber/, 'a linha de um aluno voltou a acender');
  // Sobra como exceção quem não tem NENHUM aluno: vínculo faltando.
  const vazia = /vazia:\s*\{[^}]*\}/.exec(bloco)?.[0] ?? '';
  assert.match(vazia, /amber|red|rose/, 'turma sem aluno deixou de ser exceção');
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

test('🔴 (professor, dia, horário) NÃO identifica uma turma — o curso separa', () => {
  // Casos REAIS, medidos em 22/09 nas 895 turmas implícitas: o mesmo
  // professor, no mesmo horário, com dois cursos. Sem o curso na identidade,
  // as duas viram a mesma turma — e a folha abre a errada.
  const kaioPiano = turma({ professor_id: 91, curso_id: 7, curso_nome: 'Piano', dia_semana: 'Sábado', horario_inicio: '11:00:00', unidade_id: 'cg' });
  const kaioTeclado = { ...kaioPiano, curso_id: 8, curso_nome: 'Teclado' };
  assert.notEqual(chaveDaTurma(kaioPiano), chaveDaTurma(kaioTeclado));

  const lucasGuitarra = turma({ professor_id: 12, curso_id: 3, curso_nome: 'Guitarra', dia_semana: 'Sábado', horario_inicio: '10:00:00', unidade_id: 'rec' });
  const lucasViolao = { ...lucasGuitarra, curso_id: 4, curso_nome: 'Violão' };
  assert.notEqual(chaveDaTurma(lucasGuitarra), chaveDaTurma(lucasViolao));

  // A mesma turma, em dois instantes, continua sendo a mesma.
  assert.equal(chaveDaTurma(kaioPiano), chaveDaTurma({ ...kaioPiano, total_alunos: 3 }));
});

test('a unidade entra na identidade — o Consolidado junta as três', () => {
  const base = turma({ professor_id: 5, curso_id: 1, dia_semana: 'Terça', horario_inicio: '14:00:00' });
  assert.notEqual(
    chaveDaTurma({ ...base, unidade_id: 'cg' }),
    chaveDaTurma({ ...base, unidade_id: 'barra' }),
  );
});

test('turma explícita é identificada pelo id dela', () => {
  const a = turma({ turma_explicita_id: 42, professor_id: 1, dia_semana: 'Terça', horario_inicio: '14:00:00' });
  // O mesmo id manda, mesmo que o resto tenha sido editado.
  assert.equal(chaveDaTurma(a), chaveDaTurma({ ...a, dia_semana: 'Quinta', horario_inicio: '09:00:00' }));
  assert.notEqual(chaveDaTurma(a), chaveDaTurma({ ...a, turma_explicita_id: 43 }));
});

test('🔴 a tela não identifica turma pelo índice da lista', () => {
  // Índice identifica POSIÇÃO: ele se conserva ao trocar de filtro e passa a
  // apontar para outra turma. É o que a tela do computador usa na `key`.
  assert.match(tela, /key=\{chaveDaTurma\(t\)\}/);
  assert.doesNotMatch(tela, /key=\{[^}]*index[^}]*\}/);
  // E a folha relê pela identidade, não pelo trio que colide.
  assert.match(tela, /chaveDaTurma\(t\) === chaveNaFolha/);
  assert.doesNotMatch(
    semComentarios(tela),
    /t\.professor_id === naFolha\.professor_id/,
    'a folha voltou a procurar a turma pelo trio que colide',
  );
});

test('o dia de hoje sai no vocabulário da grade', () => {
  // Datas locais, sem fuso: a grade é lida pelo relógio de quem está na
  // recepção. (2026-09-21 é uma segunda-feira.)
  assert.equal(diaDeHojeNaGrade(new Date(2026, 8, 21)), 'Segunda');
  assert.equal(diaDeHojeNaGrade(new Date(2026, 8, 22)), 'Terça');
  assert.equal(diaDeHojeNaGrade(new Date(2026, 8, 26)), 'Sábado');
});

test('🔴 domingo devolve vazio — a grade não tem domingo', () => {
  // Devolver "Domingo" daria uma lista vazia sem dizer por quê; vazio é lido
  // pela tela como "semana toda".
  assert.equal(diaDeHojeNaGrade(new Date(2026, 8, 20)), '');
});

test('a tela abre no dia de hoje e monta por lote', () => {
  // 🔴 Medido a 390px com "semana toda" como padrão: 895 linhas montadas de
  // uma vez, 55 telas de rolagem e 927 alvos.
  assert.match(tela, /useState\(\(\) => diaDeHojeNaGrade\(\)\)/);
  assert.match(tela, /const LOTE = \d+;/);
  assert.match(tela, /IntersectionObserver/);
  // O corte precisa atravessar os dias, senão cada dia montaria inteiro.
  assert.match(tela, /restante -= Math\.min\(restante, doDia\.length\)/);
});

test('🔴 o curso fica sozinho na primeira linha', () => {
  // Com "Curso · Professor" juntos, 106 das 895 linhas truncavam a 390px.
  assert.match(linha, /const quem = turma\.curso_nome/);
  assert.doesNotMatch(
    semComentarios(linha),
    /const quem = \[turma\.curso_nome, abreviarNome/,
    'curso e professor voltaram para a mesma linha',
  );
  // E o professor desceu para a segunda linha, junto da sala.
  assert.match(linha, /const onde = \[abreviarNome\(turma\.professor_nome\), turma\.sala_nome/);
});

test('🔴 "Quarta-feira" e "Quarta" são o MESMO dia', () => {
  // Medido em 22/09: 135 das 895 turmas (15%) gravam a forma longa, porque há
  // dois caminhos de escrita — o webhook usa `dia_da_semana_nome`
  // ("Quarta-feira") e o sync deriva do `nome_turma` ("Quarta"). Quem compara
  // texto cru descarta essas 135 em silêncio.
  assert.equal(normalizarDiaSemana('Quarta-feira'), 'Quarta');
  assert.equal(normalizarDiaSemana('Quarta'), 'Quarta');
  assert.equal(normalizarDiaSemana('segunda-feira'), 'Segunda');
  assert.equal(normalizarDiaSemana('TERÇA-FEIRA'), 'Terça');
  assert.equal(normalizarDiaSemana('Sábado'), 'Sábado', 'sábado não tem sufixo');
  assert.equal(normalizarDiaSemana(null), '');
  // Valor que não é dia volta como veio — inventar um dia seria pior.
  assert.equal(normalizarDiaSemana('Feriado'), 'Feriado');
});

test('🔴 a turma de "Quinta-feira" aparece na quinta', () => {
  const agrupado = agruparTurmasPorDia([
    turma({ dia_semana: 'Quinta', horario_inicio: '09:00:00' }),
    turma({ dia_semana: 'Quinta-feira', horario_inicio: '10:00:00' }),
  ]);
  assert.equal(agrupado['Quinta'].length, 2, 'a forma longa sumiu do agrupamento');
  // E o filtro por dia também tem de alcançá-la.
  assert.equal(filtrarTurmas([turma({ dia_semana: 'Quinta-feira' })], { dia: 'Quinta' }).length, 1);
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

test('a aba entrou nas portadas, e a função responde pela lista viva', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'turmas'), true);

  // ⚠️ A lista de pendentes é DERIVADA, nunca escrita à mão: cada aba nova
  // deixava vermelho o teste da anterior, e vermelho de rotina é assert que
  // ninguém mais lê.
  const TODAS = ['lista', 'turmas', 'grade', 'distribuicao', 'importar', 'automacao', 'historico', 'conciliacao'];
  const portadas = ABAS_PORTADAS['/app/alunos'];
  for (const aba of TODAS) {
    assert.equal(
      abaFoiPortada('/app/alunos', aba),
      portadas.includes(aba),
      `${aba}: a função discorda da lista`,
    );
  }
  // E aba que ninguém declarou nunca é "portada" — o padrão é avisar.
  assert.equal(abaFoiPortada('/app/alunos', 'aba_que_nao_existe'), false);
  assert.equal(abaFoiPortada('/rota/desconhecida', 'lista'), false);
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
