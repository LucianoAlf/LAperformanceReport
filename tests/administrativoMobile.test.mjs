// Contrato da aba Lançamentos no celular.
//
// Os testes de VALOR rodam a lib real (`src/lib/administrativoMobile.ts`) por
// `--experimental-strip-types`. Os de CONTRATO leem o texto-fonte da tela, que
// não roda sem DOM — e leem sempre sobre `semComentarios(...)`, senão o próprio
// comentário que explica uma decisão reprova o código que a cumpre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  LANCAMENTOS,
  ROTULO_DA_FILA,
  agruparPorDia,
  precisaMostrarUnidade,
  filasDoMes,
  montarLinha,
  numerosDoMes,
  totalDeMovimentacoes,
  reajusteDaRenovacao,
  fmtDataCurta,
  fmtMesCurto,
  fmtBRL,
} from '../src/lib/administrativoMobile.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8');

const TELA = ler('src/mobile/telas/administrativo/AdministrativoMobile.tsx');
const LINHA = ler('src/mobile/telas/administrativo/LinhaMovimentacao.tsx');
const PAGINA = ler('src/components/App/Administrativo/AdministrativoPage.tsx');
const ABAS = ler('src/mobile/abasPortadas.ts');

function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const vazias = () => ({
  renovacoes: [],
  renovacoes_pendentes: [],
  renovacoes_antecipadas: [],
  nao_renovacoes: [],
  avisos: [],
  cancelamentos: [],
  trancamentos: [],
  transferencias: [],
  alunos_novos: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// As filas
// ─────────────────────────────────────────────────────────────────────────────

test('as nove filas do computador continuam existindo no celular', () => {
  const filas = filasDoMes(vazias());
  assert.equal(filas.length, 9, 'o celular não pode ter menos filas que o computador');
  const ids = filas.map((f) => f.id).sort();
  assert.deepEqual(ids, Object.keys(ROTULO_DA_FILA).sort());
});

test('fila vazia CONTINUA na lista — some a contagem, nunca a fila', () => {
  const filas = filasDoMes(vazias());
  const transferencias = filas.find((f) => f.id === 'transferencias');
  assert.ok(transferencias, 'fila sem itens sumiu da lista');
  assert.equal(transferencias.quantidade, 0);
});

test('a ordem das filas é a de uso, com renovação e cancelamento na frente', () => {
  const ids = filasDoMes(vazias()).map((f) => f.id);
  assert.equal(ids[0], 'renovacoes');
  assert.equal(ids[1], 'cancelamentos');
  assert.ok(
    ids.indexOf('transferencias') > ids.indexOf('avisos'),
    'transferência (0 no mês medido) não pode vir antes de aviso prévio (13)',
  );
});

test('a contagem de cada fila é o tamanho da lista que a página entregou', () => {
  const listas = { ...vazias(), renovacoes: [{}, {}, {}], avisos: [{}] };
  const filas = filasDoMes(listas);
  assert.equal(filas.find((f) => f.id === 'renovacoes').quantidade, 3);
  assert.equal(filas.find((f) => f.id === 'avisos').quantidade, 1);
  assert.equal(filas.find((f) => f.id === 'cancelamentos').quantidade, 0);
});

test('aluno novo NÃO entra no total de movimentações', () => {
  const listas = { ...vazias(), renovacoes: [{}, {}], alunos_novos: [{}, {}, {}, {}] };
  assert.equal(
    totalDeMovimentacoes(listas),
    2,
    'aluno novo veio do Emusys, ninguém o lançou — somá-lo faria o cabeçalho discordar do computador',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// A linha: o destaque muda por fila
// ─────────────────────────────────────────────────────────────────────────────

test('o nome do aluno é o título, sempre, em toda fila', () => {
  for (const fila of Object.keys(ROTULO_DA_FILA)) {
    const linha = montarLinha({ aluno_nome: 'Giovanna Alves da Silva Mendonça' }, fila);
    assert.equal(linha.titulo, 'Giovanna Alves da Silva Mendonça', `fila ${fila}`);
  }
});

test('renovação destaca o valor novo e o reajuste', () => {
  const linha = montarLinha(
    { aluno_nome: 'Bernardo', valor_parcela_anterior: 395, valor_parcela_novo: 410.8 },
    'renovacoes',
  );
  assert.match(linha.destaque, /410,80/);
  assert.equal(linha.detalhe, '+4%');
});

test('renovação sem parcela anterior NÃO exibe "0%" — exibe nada', () => {
  const linha = montarLinha(
    { aluno_nome: 'Bolsista', valor_parcela_anterior: null, valor_parcela_novo: 0 },
    'renovacoes',
  );
  assert.equal(
    linha.detalhe,
    null,
    '"0%" afirmaria que a escola não reajustou; o certo é não afirmar nada',
  );
});

test('aviso prévio lê a data pela fonte única, e a data PREVISTA manda sobre o mês', () => {
  // O caso do André de Mello (03/09): mes_saida foi editado para novembro e
  // data_prevista_saida ficou em 31/10. Quem manda é a data.
  const linha = montarLinha(
    { aluno_nome: 'André', data_prevista_saida: '2026-10-31', mes_saida: '2026-11-01' },
    'avisos',
  );
  assert.match(linha.destaque, /31\/10/, 'leu o mês em vez da data prevista');
  assert.doesNotMatch(linha.destaque, /11/, 'o mês editado não pode vencer a data prevista');
});

test('aviso prévio só com mês usa o último dia do mês anterior, como o banco', () => {
  const linha = montarLinha({ aluno_nome: 'X', data_prevista_saida: null, mes_saida: '2026-11-01' }, 'avisos');
  assert.match(linha.destaque, /31\/10/, 'espelha coalesce(data_prevista_saida, mes_saida - 1)');
});

test('aviso prévio sem data nenhuma DIZ que não sabe', () => {
  const linha = montarLinha({ aluno_nome: 'X' }, 'avisos');
  assert.match(linha.destaque, /não informada/i);
});

test('cancelamento destaca a permanência e o motivo', () => {
  const linha = montarLinha(
    { aluno_nome: 'X', tempo_permanencia_meses: 15, motivo: 'Falta de tempo' },
    'cancelamentos',
  );
  assert.match(linha.destaque, /15 meses/);
  assert.equal(linha.detalhe, 'Falta de tempo');
});

test('permanência de 1 mês não escreve "1 meses"', () => {
  const linha = montarLinha({ aluno_nome: 'X', tempo_permanencia_meses: 1 }, 'cancelamentos');
  assert.match(linha.destaque, /1 mês\b/);
});

test('permanência ausente não vira "0 meses"', () => {
  const linha = montarLinha({ aluno_nome: 'X', tempo_permanencia_meses: null }, 'cancelamentos');
  assert.equal(linha.destaque, null, '"0 meses de casa" seria um fato inventado');
});

test('trancamento destaca a volta; sem previsão, diz que não há', () => {
  assert.match(montarLinha({ previsao_retorno: '2026-12-01' }, 'trancamentos').destaque, /dez\/26/);
  assert.match(montarLinha({}, 'trancamentos').destaque, /Sem previsão/i);
});

test('fila desconhecida NÃO inventa destaque', () => {
  const linha = montarLinha(
    { aluno_nome: 'X', valor_parcela_novo: 999, motivo: 'qualquer', tempo_permanencia_meses: 7 },
    'fila_que_nao_existe',
  );
  assert.equal(linha.destaque, null, 'tipo novo não pode nascer exibindo um número sem rótulo');
  assert.equal(linha.detalhe, null);
});

test('o contexto junta curso e professor, e aguenta faltar um dos dois', () => {
  assert.equal(montarLinha({ curso_nome: 'Violão', professor_nome: 'Valdo' }, 'renovacoes').contexto, 'Violão · Valdo');
  assert.equal(montarLinha({ curso_nome: 'Violão' }, 'renovacoes').contexto, 'Violão');
  assert.equal(montarLinha({}, 'renovacoes').contexto, '');
});

test('o nome do PROFESSOR é abreviado — devolve nome inteiro em vez de pedaço', () => {
  // Medido a 390px: "Musicalização Preparatória · Willian De Souza Ferreira"
  // pedia 308px para 233px, e o `truncate` cortava em "Willian De".
  const linha = montarLinha(
    { curso_nome: 'Musicalização Preparatória', professor_nome: 'Willian De Souza Ferreira' },
    'renovacoes',
  );
  assert.equal(linha.contexto, 'Musicalização Preparatória · Willian Souza');
  assert.doesNotMatch(linha.contexto, /\bDe$/, 'cortar num conectivo devolve um nome que não existe');

  // E o nome do ALUNO segue inteiro, sempre.
  const comAluno = montarLinha(
    { aluno_nome: 'Marcos (Marquinhos) da Silva Pereira Júnior', professor_nome: 'Ana Paula Ribeiro' },
    'renovacoes',
  );
  assert.equal(comAluno.titulo, 'Marcos (Marquinhos) da Silva Pereira Júnior');
});

// ─────────────────────────────────────────────────────────────────────────────
// O que se repete sai da linha
// ─────────────────────────────────────────────────────────────────────────────

test('a data vira cabeçalho de bloco — 43 linhas para 16 datas não é informação', () => {
  const blocos = agruparPorDia([
    { aluno_nome: 'A', data: '2026-09-21' },
    { aluno_nome: 'B', data: '2026-09-21' },
    { aluno_nome: 'C', data: '2026-09-19' },
  ]);
  assert.equal(blocos.length, 2);
  assert.equal(blocos[0].rotulo, '21/09');
  assert.equal(blocos[0].itens.length, 2);
  assert.equal(blocos[1].rotulo, '19/09');
});

test('os blocos vêm do mais recente para o mais antigo', () => {
  const blocos = agruparPorDia([
    { data: '2026-08-04' },
    { data: '2026-09-21' },
    { data: '2026-09-09' },
  ]);
  assert.deepEqual(blocos.map((b) => b.dataISO), ['2026-09-21', '2026-09-09', '2026-08-04']);
});

test('movimentação sem data não some nem é empurrada para um dia qualquer', () => {
  const blocos = agruparPorDia([{ data: '2026-09-21' }, { aluno_nome: 'Órfã', data: null }]);
  assert.equal(blocos.length, 2);
  const ultimo = blocos[blocos.length - 1];
  assert.equal(ultimo.rotulo, 'Sem data', 'o bloco sem data tem de se declarar');
  assert.equal(ultimo.itens.length, 1);
  assert.equal(
    blocos.reduce((s, b) => s + b.itens.length, 0),
    2,
    'nenhuma movimentação pode desaparecer no agrupamento',
  );
});

test('a unidade só aparece quando há mais de uma — senão é fundo, não sinal', () => {
  const soCG = [{ unidades: { codigo: 'CG' } }, { unidades: { codigo: 'CG' } }];
  assert.equal(precisaMostrarUnidade(soCG), false, 'selo em 100% das linhas não distingue nada');

  const mix = [{ unidades: { codigo: 'CG' } }, { unidades: { codigo: 'REC' } }];
  assert.equal(precisaMostrarUnidade(mix), true, 'no Consolidado ele distingue de verdade');

  assert.equal(precisaMostrarUnidade([]), false);
  assert.equal(precisaMostrarUnidade([{}, {}]), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatação
// ─────────────────────────────────────────────────────────────────────────────

test('a data é fatiada, nunca passada por Date — em BRT o Date volta um dia', () => {
  assert.equal(fmtDataCurta('2026-01-01'), '01/01', 'Date em UTC-3 devolveria 31/12');
  assert.equal(fmtDataCurta('2026-09-21T00:00:00Z'), '21/09');
  assert.equal(fmtDataCurta(null), '—');
  assert.equal(fmtDataCurta('lixo'), '—');
});

test('mês curto e valor: ausência vira travessão, nunca zero', () => {
  assert.equal(fmtMesCurto('2026-03-01'), 'mar/26');
  assert.equal(fmtMesCurto(null), '—');
  assert.equal(fmtBRL(null), '—');
  assert.equal(fmtBRL(undefined), '—');
  assert.match(fmtBRL(410.8), /410,80/);
});

test('reajuste é null quando não dá para calcular', () => {
  assert.equal(reajusteDaRenovacao({ valor_parcela_anterior: 0, valor_parcela_novo: 400 }), null);
  assert.equal(reajusteDaRenovacao({ valor_parcela_anterior: null, valor_parcela_novo: 400 }), null);
  assert.equal(reajusteDaRenovacao({ valor_parcela_anterior: 400, valor_parcela_novo: 400 }), 0);
});

test('🔴 valor novo AUSENTE não vira −100% — Number(null) é 0', () => {
  // Caso real, visto na primeira carga da tela no telefone: Maria Eduarda
  // Cardoso Moreira, set/26, com `—` no valor e `-100%` ao lado. São 5
  // renovações de 2026 assim.
  assert.equal(
    reajusteDaRenovacao({ valor_parcela_anterior: 436.42, valor_parcela_novo: null }),
    null,
    '−100% afirmaria que a parcela da aluna foi a zero',
  );
  assert.equal(reajusteDaRenovacao({ valor_parcela_anterior: 400, valor_parcela_novo: undefined }), null);
  assert.equal(reajusteDaRenovacao({ valor_parcela_anterior: 400, valor_parcela_novo: '' }), null);

  const linha = montarLinha(
    { aluno_nome: 'Maria Eduarda', valor_parcela_anterior: 436.42, valor_parcela_novo: null },
    'renovacoes',
  );
  assert.equal(linha.detalhe, null, 'a linha não pode exibir percentual sobre valor que não existe');
  assert.equal(linha.destaque, '—');
});

test('zero DECLARADO continua valendo −100% — bolsista que parou de pagar', () => {
  assert.equal(
    reajusteDaRenovacao({ valor_parcela_anterior: 400, valor_parcela_novo: 0 }),
    -100,
    'apagar o zero declarado seria o erro inverso: ausência não é zero, mas zero é zero',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Os números do mês
// ─────────────────────────────────────────────────────────────────────────────

test('sem resumo, TODO indicador mostra travessão — nunca zero', () => {
  for (const n of numerosDoMes(null)) {
    assert.equal(n.valor, '—', `${n.rotulo} afirmou um número sem ter fonte`);
    assert.notEqual(n.valor, '0', 'zero é o valor tranquilizador: foi o defeito do card SOZINHOS');
  }
});

test('taxa de renovação e churn saem das mesmas contas do computador', () => {
  const n = numerosDoMes({
    alunos_ativos: 399,
    alunos_pagantes: 370,
    renovacoes_realizadas: 43,
    nao_renovacoes: 11,
    renovacoes_pendentes: 0,
    evasoes_interrompido: 20,
    evasoes_nao_renovou: 7,
  });
  const taxa = n.find((x) => x.rotulo === 'Renovação');
  assert.equal(taxa.valor, '80%', '43 de 54 vencimentos');
  const churn = n.find((x) => x.rotulo === 'Churn');
  assert.equal(churn.valor, '7.3%', '27 evasões / 370 pagantes');
});

test('sem vencimento no mês, a taxa NÃO vira 0% — diz que não houve vencimento', () => {
  const taxa = numerosDoMes({
    alunos_ativos: 10,
    alunos_pagantes: 10,
    renovacoes_realizadas: 0,
    nao_renovacoes: 0,
    renovacoes_pendentes: 0,
  }).find((x) => x.rotulo === 'Renovação');
  assert.equal(taxa.valor, '—', '0% afirmaria que ninguém renovou quando não havia o que renovar');
  assert.match(taxa.nota, /sem vencimento/i);
});

test('o tom acompanha a meta nos dois sentidos', () => {
  const bom = numerosDoMes({
    alunos_pagantes: 100, evasoes_interrompido: 2, evasoes_nao_renovou: 0,
    renovacoes_realizadas: 95, nao_renovacoes: 5, renovacoes_pendentes: 0,
  });
  assert.equal(bom.find((x) => x.rotulo === 'Churn').tom, 'bom', '2% está dentro da meta de 4%');
  assert.equal(bom.find((x) => x.rotulo === 'Renovação').tom, 'bom', '95% passa da meta de 90%');

  const ruim = numerosDoMes({
    alunos_pagantes: 100, evasoes_interrompido: 9, evasoes_nao_renovou: 0,
    renovacoes_realizadas: 50, nao_renovacoes: 50, renovacoes_pendentes: 0,
  });
  assert.equal(ruim.find((x) => x.rotulo === 'Churn').tom, 'ruim');
  assert.equal(ruim.find((x) => x.rotulo === 'Renovação').tom, 'ruim');
});

test('indicador indisponível é neutro, nunca "bom"', () => {
  for (const n of numerosDoMes(null)) {
    assert.notEqual(n.tom, 'bom', 'pintar de verde o que não se sabe é o fail-open de novo');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Os oito lançamentos
// ─────────────────────────────────────────────────────────────────────────────

test('os oito lançamentos do computador existem no celular', () => {
  assert.equal(LANCAMENTOS.length, 8);
  const ids = LANCAMENTOS.map((l) => l.id).sort();
  assert.deepEqual(ids, [
    'aviso_previo', 'cancelamento', 'nao_renovacao', 'renovacao',
    'renovacao_antecipada', 'renovacao_pendente', 'trancamento', 'transferencia',
  ]);
});

test('cada lançamento diz QUANDO se usa — oito rótulos parecidos não se distinguem sozinhos', () => {
  for (const l of LANCAMENTOS) {
    assert.ok(l.quando && l.quando.length > 10, `${l.id} sem explicação de uso`);
  }
});

test('a página sabe abrir os oito, e nenhum cai no vazio', () => {
  const fonte = semComentarios(PAGINA);
  const bloco = fonte.slice(fonte.indexOf('function abrirLancamento'));
  const corpo = bloco.slice(0, bloco.indexOf('\n  }'));
  for (const l of LANCAMENTOS) {
    assert.ok(corpo.includes(`case '${l.id}'`), `abrirLancamento não trata ${l.id}`);
  }
  assert.match(corpo, /setModalEvasao\(true\)/, 'cancelamento tem de abrir o modal de evasão');
  assert.match(corpo, /openModalRenovacao\('antecipada_pendente'\)/);
});

// ─────────────────────────────────────────────────────────────────────────────
// A bifurcação: o desktop não muda, e o modal continua alcançável
// ─────────────────────────────────────────────────────────────────────────────

test('🔴 os modais ficam FORA do ramo mobile — senão o botão fica mudo no celular', () => {
  const fonte = semComentarios(PAGINA);
  const iMobile = fonte.indexOf('<AdministrativoMobile');
  const iModais = fonte.indexOf('<ModalRenovacao');
  assert.ok(iMobile > 0 && iModais > 0);
  assert.ok(
    iModais > iMobile,
    'ordem inesperada no arquivo',
  );
  // O trecho entre a tela mobile e os modais tem de fechar o ramo: se o
  // `<ModalRenovacao` estivesse dentro do `else` do desktop, o celular não o
  // alcançaria. Este é o defeito exato cometido na Grade em 21/09.
  const entre = fonte.slice(iMobile, iModais);
  assert.match(entre, /<\/>\s*\)\}/, 'o ramo do desktop precisa fechar ANTES dos modais');
});

test('🔴 o painel de IA de retenção fica fora do celular — ele mora no bloco dos modais', () => {
  // Achado MEDINDO, não lendo: o `PlanoAcaoRetencao` está declarado entre os
  // modais, mas é um painel visível — passou pela bifurcação e apareceu na
  // tela do telefone com 426px dentro de 354px. Nenhum assert de estrutura
  // pegaria, porque a bifurcação em si estava certa.
  const fonte = semComentarios(PAGINA);
  const i = fonte.indexOf('<PlanoAcaoRetencao');
  assert.ok(i > 0, 'PlanoAcaoRetencao sumiu da página');
  const antes = fonte.slice(Math.max(0, i - 120), i);
  assert.match(antes, /!ehCelular\s*&&\s*\(/, 'o painel voltou a vazar para o celular');
});

test('a bifurcação vem depois dos hooks', () => {
  const fonte = semComentarios(PAGINA);
  const iShell = fonte.indexOf('useShellMobile()');
  const iCompetencia = fonte.indexOf('useCompetenciaFiltro()');
  assert.ok(iShell > iCompetencia, 'detector de shell antes de um hook muda a ordem entre os shells');
});

test('a faixa âmbar fica no nível da ROTA, antes de qualquer ramo de aba', () => {
  const fonte = semComentarios(PAGINA);
  const iFaixa = fonte.indexOf('<AvisoNaoOtimizado />');
  const iPrimeiroRamo = fonte.indexOf("mainTab === 'contratos' ?");
  assert.ok(iFaixa > 0, 'a faixa sumiu');
  assert.ok(
    iFaixa < iPrimeiroRamo,
    'faixa dentro de um ramo de aba apaga o aviso das outras seis — o erro de 14/09 com Alunos',
  );
});

test('só as abas COM TELA PRÓPRIA estão marcadas como portadas', () => {
  // `contratos` entrou em 24/09, com `ContratosMobile` — lista por urgência,
  // medida a 390px: 0 vazamento, 0 alvo abaixo de 44px, 3 telas de rolagem.
  // `fideliza` entrou em 25/09, com `FidelizaMobile` — a dupla primeiro,
  // medida em 919px no Consolidado (contra 4.198px da matriz) e 740px com
  // unidade escolhida. As demais continuam sendo a tela do computador dentro
  // do shell, e a faixa âmbar delas não pode sair antes da tela existir.
  assert.match(ABAS, /'\/app\/administrativo':\s*\['lancamentos',\s*'contratos',\s*'fideliza'\]/);
  for (const outra of ['lojinha', 'farmer', 'caixa_financeiro', 'caixa_entrada']) {
    assert.doesNotMatch(
      ABAS,
      new RegExp(`'/app/administrativo':[^\\]]*'${outra}'`),
      `${outra} não foi portada e não pode perder a faixa`,
    );
  }
});

test('a rota está na lista de faixa-por-aba, senão a faixa do shell some de tudo', () => {
  // ⚠️ Um regex `ROTAS_COM_FAIXA_POR_ABA[\s\S]*?'/app/administrativo'` passa
  // em branco: ele varre o arquivo todo e casa com a ocorrência que está lá
  // embaixo, dentro de `ABAS_PORTADAS`. A mutação pegou. O recorte tem de ser
  // o array, e só ele.
  const decl = /ROTAS_COM_FAIXA_POR_ABA[^=]*=\s*\[([\s\S]*?)\]/.exec(ABAS);
  assert.ok(decl, 'ROTAS_COM_FAIXA_POR_ABA sumiu');
  assert.match(decl[1], /'\/app\/administrativo'/);
});

// ─────────────────────────────────────────────────────────────────────────────
// A tela
// ─────────────────────────────────────────────────────────────────────────────

test('a tela não busca nada no banco', () => {
  assert.doesNotMatch(TELA, /supabase/i, 'a tela do celular não pode ter fonte de dados própria');

  // ⚠️ Este assert já vetou `useEffect` por inteiro, e isso reprovava código
  // CERTO: o efeito que traz o chip aceso do trilho à vista não busca nada.
  // Vetar o MECANISMO em vez da substância é o defeito que a suíte de agentes
  // pagou em 06/09 (regex que reprovava "não traz" por não dizer "não tem").
  // O que não pode existir é leitura de dados — em efeito ou fora dele.
  for (const fonte of [/\bfetch\s*\(/, /\.rpc\s*\(/, /\baxios\b/, /use\w*Query\b/]) {
    assert.doesNotMatch(TELA, fonte, `a tela ganhou fonte de dados própria (${fonte})`);
  }
  // E nenhum efeito pode ser assíncrono: `await` dentro de `useEffect` é busca
  // por outro nome, que era o que o veto amplo tentava alcançar.
  for (const efeito of TELA.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\)/g) || []) {
    assert.doesNotMatch(efeito, /\bawait\b/, 'efeito assíncrono na tela é fonte de dados disfarçada');
  }
});

test('a tela não reimplementa as regras — CHAMA as da lib', () => {
  const fonte = semComentarios(TELA);
  assert.match(fonte, /from '@\/lib\/administrativoMobile'/);

  // ⚠️ Procurar o nome da função no arquivo inteiro NÃO serve: o import
  // continua lá mesmo quando o corpo passa a calcular por conta própria, e o
  // assert fica verde sobre uma tela que reescreveu a regra. Foi o que a
  // mutação pegou. O que vale é a CHAMADA, e dentro do corpo do componente.
  const corpo = fonte.slice(fonte.indexOf('export function AdministrativoMobile'));
  for (const fn of ['filasDoMes', 'montarLinha', 'numerosDoMes', 'totalDeMovimentacoes']) {
    assert.ok(
      new RegExp(`\\b${fn}\\(`).test(corpo),
      `a tela não chama ${fn}() — regra reescrita no componente, que é como a lib e a tela passam a discordar`,
    );
  }

  // E a contrapartida: nenhuma conta própria sobre as listas no corpo.
  assert.doesNotMatch(
    corpo,
    /\.reduce\(|Object\.(keys|values)\(listas\)/,
    'a tela está agregando as listas por conta própria',
  );
});

test('🔴 a linha NÃO pinta a borda por tipo — dentro da fila, todas são iguais', () => {
  const fonte = semComentarios(LINHA);
  assert.doesNotMatch(
    fonte,
    /border-l-(emerald|rose|amber|sky|violet|cyan|slate)-\d/,
    'era a mesma cor em 43 de 43 linhas: vocabulário de exceção no caso geral, a lição que a Agenda já tinha pago',
  );
});

test('a linha INTEIRA abre a edição — não um lápis de 44px dentro dela', () => {
  const fonte = semComentarios(LINHA);
  assert.doesNotMatch(fonte, /Pencil/, '43 ícones idênticos numa coluna são ruído');
  // O elemento clicável tem de ser o container, não um filho.
  assert.match(
    fonte,
    /<button[\s\S]{0,200}onClick=\{onEditar\}/,
    'o alvo precisa ser a linha toda',
  );
});

test('🔴 o cabeçalho de dia encosta no da tela — fresta é por onde o nome passa', () => {
  const fonte = semComentarios(TELA);
  const topoCabecalho = /sticky top-0[^"]*pb-([\d.]+) pt-([\d.]+)/.exec(fonte);
  assert.ok(topoCabecalho, 'o cabeçalho da tela mudou de forma');
  const h3 = /<h3 className="sticky top-\[(\d+)px\]/.exec(fonte);
  assert.ok(h3, 'o cabeçalho de dia deixou de ser sticky');
  // 30px é a altura medida do cabeçalho da tela. Chutei 58 e depois 42
  // (somando o padding do <main>, que o sticky não conta) e os dois deixaram
  // fresta — 16px e 12px, medidos no navegador com o nome do aluno visível
  // atrás do cabeçalho.
  assert.equal(
    Number(h3[1]),
    30,
    'o top do cabeçalho de dia tem de ser a ALTURA do cabeçalho da tela, sem somar o padding do <main>',
  );
});

test('os cards de números têm altura igual — a nota de um deles quebra em duas linhas', () => {
  // Medido na tela: 75/75/88/88. "cancelamento + não renovação" quebra e
  // empurra a segunda fileira, deixando a grade torta.
  const fonte = semComentarios(TELA);
  const grade = /<div className="grid ([^"]+)"/.exec(fonte);
  assert.ok(grade, 'a grade dos números mudou de forma');
  assert.match(grade[1], /auto-rows-fr/, 'sem isso a fileira com nota longa fica mais alta');
});

test('o cabeçalho de dia é OPACO — translúcido deixa o texto de baixo atravessar', () => {
  const fonte = semComentarios(TELA);
  const h3 = /<h3 className="([^"]+)"/.exec(fonte);
  assert.ok(h3);
  assert.match(h3[1], /bg-slate-950(?!\/)/, 'fundo com opacidade deixa ler o que passa por trás');
  assert.doesNotMatch(h3[1], /backdrop-blur/);
});

test('o nome do aluno NUNCA trunca na linha', () => {
  const fonte = semComentarios(LINHA);
  const bloco = fonte.slice(fonte.indexOf('{linha.titulo}') - 260, fonte.indexOf('{linha.titulo}'));
  assert.doesNotMatch(
    bloco,
    /truncate|line-clamp/,
    'nome cortado = a ADM não sabe em quem está tocando (defeito medido na Conciliação)',
  );
});

test('todo alvo de toque declara pelo menos 44px', () => {
  for (const [nome, fonte] of [['tela', TELA], ['linha', LINHA]]) {
    const alturas = [...semComentarios(fonte).matchAll(/min-h-\[(\d+)px\]|h-\[(\d+)px\]/g)]
      .map((m) => Number(m[1] ?? m[2]));
    for (const h of alturas) {
      assert.ok(h >= 44, `${nome}: alvo de ${h}px — abaixo do mínimo de toque`);
    }
  }
});

test('a tela DIZ o que ficou no computador, em vez de sumir com aquilo em silêncio', () => {
  assert.match(TELA, /ficam no computador/i);
  assert.match(TELA, /Motivos de saída/i);
});

test('aluno novo não oferece editar — ninguém o lançou', () => {
  const fonte = semComentarios(TELA);
  assert.match(fonte, /filaAtiva !== 'alunos_novos'/, 'prometeria uma escrita que não existe');
});

test('só o trilho de filas rola na horizontal; o resto da tela, nunca', () => {
  const fonte = semComentarios(TELA);
  const ocorrencias = [...fonte.matchAll(/overflow-x-auto/g)];
  assert.equal(ocorrencias.length, 1, 'rolagem lateral em mais de um lugar na tela do celular');
});
