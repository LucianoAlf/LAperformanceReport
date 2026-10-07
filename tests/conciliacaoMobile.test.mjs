import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ATRIBUTO_CAMPOS_APLICAVEIS,
  ATRIBUTO_TIPO_ROTULO,
  EXPLICACAO_SEM_DECISAO,
  chaveAlunoAtributo,
  decisaoDeAtributoNoCelular,
  decisaoDeMatriculaNoCelular,
  descricaoAtributo,
  fmtDataCurta,
  grupoAtributo,
  ladosDaMatricula,
  origemAtributo,
  passoDaDecisao,
  resumirFila,
  textoCurtoValor,
} from '../src/lib/conciliacao.ts';
import { ABAS_PORTADAS, abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/alunos/ConciliacaoMobile.tsx');
const desktop = le('../src/components/App/Alunos/ConciliacaoMatriculas.tsx');
const lib = le('../src/lib/conciliacao.ts');

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---------------------------------------------- a régua do que pode decidir ----

test('🔴 checklist NÃO é decisão — e são 89% da fila', () => {
  // Medido em 22/09: 293 dos 330 atributos abertos são `anamnese_pendente`.
  // Ali o "lado do Emusys" é a frase "Checklist interno do LA Report": não há
  // valor a aplicar, então um botão seria uma escrita sem conteúdo.
  for (const tipo of ['anamnese_pendente', 'contrato_assinatura_pendente']) {
    const d = decisaoDeAtributoNoCelular({ tipo_divergencia: tipo, campo: 'anamnese_preenchida', sugestao: null });
    assert.equal(d.pode, false, `${tipo} virou decidível`);
    assert.equal(d.motivo, 'checklist');
  }
});

test('🔴 data de nascimento pede conferência fora — a própria sugestão diz isso', () => {
  const d = decisaoDeAtributoNoCelular({
    tipo_divergencia: 'data_nascimento_divergente',
    campo: 'data_nascimento',
    sugestao: { data_nascimento: '2010-05-01' },
  });
  assert.equal(d.pode, false);
  assert.equal(d.motivo, 'precisa_conferir_fora');
  // E o campo ESTÁ na lista de aplicáveis — ou seja, a recusa é da régua, não
  // um efeito colateral de o campo faltar no conjunto.
  assert.ok(ATRIBUTO_CAMPOS_APLICAVEIS.has('data_nascimento'));
});

test('forma de pagamento só decide com sugestão pronta', () => {
  const semSugestao = decisaoDeAtributoNoCelular({
    tipo_divergencia: 'forma_pagamento_divergente',
    campo: 'forma_pagamento_id',
    sugestao: null,
  });
  assert.equal(semSugestao.pode, false);
  assert.equal(semSugestao.motivo, 'precisa_escolher');

  const comSugestao = decisaoDeAtributoNoCelular({
    tipo_divergencia: 'forma_pagamento_divergente',
    campo: 'forma_pagamento_id',
    sugestao: { forma_pagamento: 'Cartão' },
  });
  assert.equal(comSugestao.pode, true);
});

test('campo que o sync não sabe aplicar não vira botão', () => {
  const d = decisaoDeAtributoNoCelular({
    tipo_divergencia: 'contato_divergente',
    campo: 'campo_que_ninguem_aplica',
    sugestao: { algo: 1 },
  });
  assert.equal(d.pode, false);
  assert.equal(d.motivo, 'sem_sugestao');

  assert.equal(
    decisaoDeAtributoNoCelular({ tipo_divergencia: 'contato_divergente', campo: 'telefone', sugestao: {} }).pode,
    true,
  );
});

test('🔴 ambíguo, órfão e valor nunca se decidem no telefone', () => {
  const casos = [
    ['ambiguo', 'varios_candidatos'],
    ['ausente_nosso_sistema', 'cria_cadastro'],
    ['valor_divergente', 'precisa_digitar'],
  ];
  for (const [tipo, motivo] of casos) {
    const d = decisaoDeMatriculaNoCelular({ tipo_divergencia: tipo, sugestao: { qualquer: 1 } });
    assert.equal(d.pode, false, `${tipo} virou decidível`);
    assert.equal(d.motivo, motivo);
  }
  // ⚠️ Nem mesmo COM sugestão: para estes três a sugestão não torna a decisão
  // binária — ela continua exigindo escolher entre pessoas, criar cadastro ou
  // digitar um número.
});

test('status e classificação decidem — mas só com sugestão', () => {
  for (const tipo of ['status_divergente', 'classificacao_divergente']) {
    assert.equal(decisaoDeMatriculaNoCelular({ tipo_divergencia: tipo, sugestao: { status: 'ativo' } }).pode, true);
    const sem = decisaoDeMatriculaNoCelular({ tipo_divergencia: tipo, sugestao: null });
    assert.equal(sem.pode, false, `${tipo} sem sugestão virou decidível`);
    assert.equal(sem.motivo, 'sem_sugestao');
  }
});

test('tipo desconhecido é recusado por padrão', () => {
  // Um tipo novo do sync não pode nascer decidível no celular sem ninguém
  // olhar para ele.
  const d = decisaoDeMatriculaNoCelular({ tipo_divergencia: 'tipo_que_nao_existe_ainda', sugestao: { a: 1 } });
  assert.equal(d.pode, false);
  assert.equal(d.motivo, 'sem_sugestao');
});

test('todo motivo de recusa tem explicação escrita', () => {
  // Desabilitar sem dizer por quê transfere a dúvida para quem está no balcão.
  const motivos = new Set();
  for (const tipo of ['ambiguo', 'ausente_nosso_sistema', 'valor_divergente', 'status_divergente', 'x']) {
    const d = decisaoDeMatriculaNoCelular({ tipo_divergencia: tipo, sugestao: null });
    if (d.motivo) motivos.add(d.motivo);
  }
  for (const tipo of ['anamnese_pendente', 'data_nascimento_divergente', 'forma_pagamento_divergente']) {
    const d = decisaoDeAtributoNoCelular({ tipo_divergencia: tipo, campo: 'x', sugestao: null });
    if (d.motivo) motivos.add(d.motivo);
  }
  assert.ok(motivos.size >= 5);
  for (const m of motivos) {
    assert.ok(EXPLICACAO_SEM_DECISAO[m], `motivo "${m}" não tem explicação`);
    assert.ok(EXPLICACAO_SEM_DECISAO[m].length > 20, `explicação de "${m}" é curta demais para explicar`);
  }
});

test('o resumo separa o que dá para resolver aqui', () => {
  const fila = [
    { tipo_divergencia: 'status_divergente', sugestao: { s: 1 } },
    { tipo_divergencia: 'status_divergente', sugestao: { s: 1 } },
    { tipo_divergencia: 'ambiguo', sugestao: null },
    { tipo_divergencia: 'valor_divergente', sugestao: null },
  ];
  const r = resumirFila(fila, decisaoDeMatriculaNoCelular);
  assert.equal(r.total, 4);
  assert.equal(r.decidiveis, 2);
  assert.equal(r.soLeitura, 2);
  assert.deepEqual(r.porMotivo, { varios_candidatos: 1, precisa_digitar: 1 });
  assert.deepEqual(resumirFila([], decisaoDeMatriculaNoCelular), {
    total: 0, decidiveis: 0, soLeitura: 0, porMotivo: {},
  });
});

// ------------------------------------------------------------- vocabulário ----

test('os dois lados de cada divergência', () => {
  assert.deepEqual(
    descricaoAtributo({ tipo_divergencia: 'foto_ausente', valor_nosso: null, valor_emusys: null, sugestao: null }),
    { nosso: 'Sem foto no LA Report', emusys: 'Foto disponivel no Emusys', sugestao: 'Aplicar foto do Emusys' },
  );
  const fin = descricaoAtributo({
    tipo_divergencia: 'status_financeiro_divergente',
    valor_nosso: { status_pagamento: 'em_dia' },
    valor_emusys: { status_pagamento: 'inadimplente' },
    sugestao: { status_pagamento: 'inadimplente' },
  });
  assert.equal(fin.nosso, 'Em dia');
  assert.equal(fin.emusys, 'Inadimplente');
  assert.match(fin.sugestao, /Inadimplente/);
});

test('⚠️ a sugestão de nascimento carrega o aviso de conferir', () => {
  const d = descricaoAtributo({
    tipo_divergencia: 'data_nascimento_divergente',
    valor_nosso: { data_nascimento: '2010-05-01' },
    valor_emusys: { data_nascimento: '2010-06-01' },
    sugestao: { data_nascimento: '2010-06-01' },
  });
  assert.equal(d.nosso, '01/05/2010');
  assert.match(d.sugestao, /confirmar com a escola/);
});

test('🔴 o lado do Emusys é o SUGERIDO, não o vocabulário de lá', () => {
  // Payload real, copiado do banco em 22/09 (Bento Cabral do Nascimento):
  // lá a matrícula é "trancada", aqui o aluno fica "trancado". Mostrar
  // "Ativo → Trancada" faz parecer que há diferença de conteúdo onde só há
  // diferença de palavra — e o que será gravado é o sugerido.
  const item = {
    tipo_divergencia: 'status_divergente',
    valor_nosso: { nome: 'Bento Cabral do Nascimento', tipo: 'REGULAR', status: 'ativo', curso_id: 27 },
    valor_api: { data_fim: null, status_emusys: 'trancada', emusys_matricula_id: 1379, status_sugerido_la_report: 'trancado' },
    sugestao: 'trancado',
  };
  const lados = ladosDaMatricula(item);
  assert.equal(lados.nosso, 'Ativo');
  assert.equal(lados.emusys, 'Trancado', 'voltou a exibir o vocabulário do Emusys');
  assert.notEqual(lados.emusys, 'Trancada');
});

test('🔴 nenhum lado vira "—" nos payloads reais', () => {
  // A primeira versão desta leitura adivinhava os nomes dos campos e exibia
  // "trancado → —" na tela: o lado que a pessoa precisa ver antes de
  // confirmar era justamente o que sumia.
  const reais = [
    {
      tipo_divergencia: 'classificacao_divergente',
      valor_nosso: { nome: 'Ana Beatriz Paz de Almeida', tipo: 'REGULAR', status: 'ativo', curso_id: 6 },
      valor_api: { bolsa: true, tipo_sugerido: 'BOLSISTA_INT', efetivo: 0 },
      sugestao: 'BOLSISTA_INT',
    },
    {
      tipo_divergencia: 'ausente_nosso_sistema',
      valor_nosso: null,
      valor_api: { nome: 'Ester Soares Gomes Christianes', status: 'ativa', emusys_id: 2312, disciplinas: 'Minha Banda Para Sempre T ' },
      sugestao: null,
    },
  ];
  for (const item of reais) {
    const lados = ladosDaMatricula(item);
    assert.notEqual(lados.emusys, '—', `${item.tipo_divergencia}: lado do Emusys vazio`);
    assert.ok(lados.nosso, `${item.tipo_divergencia}: lado nosso vazio`);
  }

  // No órfão, o que identifica a pessoa é o NOME — cair no "Emusys #2312" é
  // um identificador que ninguém reconhece, e a tela ficaria sem dizer de
  // quem é o cadastro que se está propondo criar.
  const orfao = ladosDaMatricula(reais[1]);
  assert.match(orfao.emusys, /Ester Soares Gomes Christianes/);
  assert.match(orfao.emusys, /Minha Banda/);
  assert.equal(orfao.nosso, 'Não existe aqui');
  // Sem nome nenhum, aí sim o id é melhor que o vazio.
  assert.match(
    ladosDaMatricula({ tipo_divergencia: 'ausente_nosso_sistema', valor_nosso: null, valor_api: { emusys_id: 7 }, sugestao: null }).emusys,
    /#7/,
  );

  // Com o mapa de tipos, o código vira o nome que a escola usa.
  const comMapa = ladosDaMatricula(reais[0], new Map([['BOLSISTA_INT', 'Bolsista integral'], ['REGULAR', 'Regular']]));
  assert.equal(comMapa.nosso, 'Regular');
  assert.equal(comMapa.emusys, 'Bolsista integral');
  // Sem o mapa, o código aparece cru — nunca um traço, que esconderia o valor.
  assert.equal(ladosDaMatricula(reais[0]).emusys, 'BOLSISTA_INT');
});

test('ambíguo diz quantos candidatos há', () => {
  const lados = ladosDaMatricula({
    tipo_divergencia: 'ambiguo',
    valor_nosso: null,
    valor_api: { candidatos: [{ id: 1 }, { id: 2 }] },
    sugestao: null,
  });
  assert.equal(lados.emusys, '2 candidatos no Emusys');
  assert.equal(
    ladosDaMatricula({ tipo_divergencia: 'ambiguo', valor_nosso: null, valor_api: { candidatos: [{ id: 1 }] }, sugestao: null }).emusys,
    '1 candidato no Emusys',
  );
});

test('inadimplente é crítico mesmo com severidade baixa', () => {
  assert.equal(
    grupoAtributo({ severidade: 'baixa', tipo_divergencia: 'status_financeiro_divergente', valor_emusys: { status_pagamento: 'inadimplente' } }),
    'criticas',
  );
  assert.equal(
    grupoAtributo({ severidade: 'baixa', tipo_divergencia: 'status_financeiro_divergente', valor_emusys: { status_pagamento: 'em_dia' } }),
    'financeiro',
  );
  assert.equal(grupoAtributo({ severidade: 'alta', tipo_divergencia: 'foto_ausente', valor_emusys: null }), 'criticas');
  // Tipo desconhecido não some: cai em cadastro.
  assert.equal(grupoAtributo({ severidade: 'baixa', tipo_divergencia: 'novo_tipo', valor_emusys: null }), 'cadastro');
});

test('a origem diz de onde veio a divergência', () => {
  assert.equal(origemAtributo({ severidade: 'baixa', tipo_divergencia: 'anamnese_pendente', valor_emusys: null }), 'Checklist interno LA Report');
  assert.equal(origemAtributo({ severidade: 'baixa', tipo_divergencia: 'foto_ausente', valor_emusys: null }), 'Emusys -> LA Report');
  assert.equal(origemAtributo({ severidade: 'baixa', tipo_divergencia: 'contato_divergente', valor_emusys: null }), 'LA Report x Emusys');
});

test('⚠️ emusys_student_id é o ÚLTIMO degrau da identidade', () => {
  // Ele colide entre unidades (91 ids em duas unidades, com nomes
  // diferentes), então nunca pode vencer o aluno local nem a matrícula.
  assert.equal(chaveAlunoAtributo({ id: 9, aluno_id: 5, emusys_matricula_id: 'm1', emusys_student_id: 's1' }), 'aluno:5');
  assert.equal(chaveAlunoAtributo({ id: 9, aluno_id: null, emusys_matricula_id: 'm1', emusys_student_id: 's1' }), 'mat:m1');
  assert.equal(chaveAlunoAtributo({ id: 9, aluno_id: null, emusys_matricula_id: null, emusys_student_id: 's1' }), 'student:s1');
  assert.equal(chaveAlunoAtributo({ id: 9, aluno_id: null, emusys_matricula_id: null, emusys_student_id: null }), 'atributo:9');
});

test('data inválida não vira "Invalid Date" na tela', () => {
  assert.equal(fmtDataCurta(null), '—');
  assert.equal(fmtDataCurta('nao-e-data'), '—');
  assert.equal(fmtDataCurta('2010-06-01'), '01/06/2010');
});

test('valor em objeto vira texto legível', () => {
  assert.equal(textoCurtoValor(null), '—');
  assert.equal(textoCurtoValor(''), '—');
  assert.equal(textoCurtoValor({ telefone: '21999', email: 'a@b.c' }), 'telefone: 21999 · email: a@b.c');
  assert.equal(textoCurtoValor(['a', 'b']), 'a, b');
});

// ------------------------------------------------------- contrato do código ----

test('🔴 o celular NÃO tem ação em lote', () => {
  // O lote é o que transforma um erro em muitos — e aqui cada aplicação
  // escreve na ficha de um aluno.
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /Checkbox|selecionados|aplicarLote|ignorarLote/);
  assert.doesNotMatch(limpo, /toggleSel/);
});

test('🔴 NENHUM caminho vai de "nada escolhido" direto a gravar', () => {
  // Esta é a garantia que importa, e ela se prova por valores. Um teste que
  // procura a palavra "Confirmar" no arquivo passaria mesmo com o ramo da
  // confirmação inalcançável — o texto continua lá.
  for (const lado of ['emusys', 'nosso']) {
    const escolheu = passoDaDecisao(null, { tipo: 'escolher', lado });
    assert.equal(escolheu.gravar, null, 'escolher gravou de primeira');
    assert.equal(escolheu.confirmando, lado);

    const confirmou = passoDaDecisao(escolheu.confirmando, { tipo: 'confirmar' });
    assert.equal(confirmou.gravar, lado, 'confirmar não gravou o lado escolhido');
    assert.equal(confirmou.confirmando, null, 'a confirmação ficou pendurada');
  }

  // Confirmar sem ter escolhido — o que um clique duplo ou um evento repetido
  // produziria — não grava nada.
  assert.deepEqual(passoDaDecisao(null, { tipo: 'confirmar' }), { confirmando: null, gravar: null });
  // E voltar desfaz sem gravar.
  assert.deepEqual(passoDaDecisao('emusys', { tipo: 'voltar' }), { confirmando: null, gravar: null });
});

test('a tela usa a máquina em vez de decidir no JSX', () => {
  assert.match(tela, /passoDaDecisao\(confirmando, evento\)/);
  assert.match(tela, /if \(!passo\.gravar\) return;/);
  // E o texto da confirmação diz o NOME de quem vai ser alterado.
  assert.match(tela, /selecionado\.item\.aluno_nome/);
});

test('🔴 o nome do aluno não é truncado na linha', () => {
  // Na tela do computador ele é cortado ao lado do botão que grava na ficha
  // dele — foi o que motivou este recorte.
  const bloco = tela.slice(tela.indexOf('function LinhaDivergencia'), tela.indexOf('function LinhaSoLeitura'));
  const linhaDoNome = bloco.split('\n').find((l) => l.includes('aluno_nome'));
  assert.ok(linhaDoNome, 'a linha do nome sumiu');
  const pNome = bloco.slice(0, bloco.indexOf('aluno_nome'));
  const ultimaClasse = pNome.lastIndexOf('className=');
  assert.doesNotMatch(
    pNome.slice(ultimaClasse),
    /truncate/,
    'o nome do aluno voltou a ser truncado',
  );
});

test('a tela do celular não escreve no banco por conta própria', () => {
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /from '@\/lib\/supabase'/);
  assert.doesNotMatch(limpo, /aplicar_conciliacao/);
  assert.doesNotMatch(limpo, /\.rpc\(/);
});

test('a régua não foi reescrita na tela', () => {
  const limpo = semComentarios(tela);
  assert.match(tela, /from '@\/lib\/conciliacao'/);
  assert.doesNotMatch(limpo, /'anamnese_pendente'/, 'a régua do checklist foi copiada para a tela');
  assert.doesNotMatch(limpo, /'ambiguo'/, 'a régua do ambíguo foi copiada para a tela');
});

test('🔴 o computador e o celular leem o MESMO vocabulário', () => {
  assert.match(desktop, /from '@\/lib\/conciliacao'/);
  const limpo = semComentarios(desktop);
  for (const sumiu of [
    'function descricaoAtributo',
    'function grupoAtributo',
    'function origemAtributo',
    'function chaveAlunoAtributo',
    'function textoCurtoValor',
    'const STATUS_PAGAMENTO_LABEL',
  ]) {
    assert.ok(!limpo.includes(sumiu), `${sumiu} voltou a ser definida no componente`);
  }
  // E o mapa de tipos deriva da lib, em vez de repetir label e grupo.
  assert.match(desktop, /Object\.entries\(ATRIBUTO_TIPO_ROTULO\)/);
});

test('o alvo de toque tem 44px', () => {
  const alturas = [...tela.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length >= 4, 'quase nenhum alvo declara altura mínima');
  assert.ok(alturas.every((px) => px >= 44), 'alvo abaixo de 44px');
});

test('a aba entrou nas portadas, e a função responde pela lista viva', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'conciliacao'), true);
  const TODAS = ['lista', 'turmas', 'grade', 'distribuicao', 'importar', 'automacao', 'historico', 'conciliacao'];
  const portadas = ABAS_PORTADAS['/app/alunos'];
  for (const aba of TODAS) {
    assert.equal(abaFoiPortada('/app/alunos', aba), portadas.includes(aba), `${aba}: a função discorda da lista`);
  }
});

test('⚠️ a bifurcação fica depois dos hooks e o JSX do desktop segue lá', () => {
  const iBif = desktop.indexOf('if (ehCelular) {');
  assert.ok(iBif > -1, 'a bifurcação sumiu');
  for (const hook of ['useState(', 'useEffect(', 'useMemo(', 'useCallback(']) {
    assert.equal(desktop.indexOf(hook, iBif), -1, `há ${hook} depois da bifurcação`);
  }
  const bloco = desktop.slice(iBif);
  assert.match(bloco, /Conciliação Emusys/, 'o cabeçalho do desktop sumiu');
  assert.match(bloco, /Checkbox/, 'o lote do desktop sumiu');
});

test('a lib não importa React nem toca no DOM', () => {
  assert.doesNotMatch(lib, /from 'react'/);
  assert.doesNotMatch(semComentarios(lib), /document\.|window\./);
});

test('todo tipo com rótulo tem grupo conhecido', () => {
  const grupos = new Set(['imagem', 'cadastro', 'financeiro', 'contrato']);
  for (const [tipo, meta] of Object.entries(ATRIBUTO_TIPO_ROTULO)) {
    assert.ok(meta.label, `${tipo} sem rótulo`);
    assert.ok(grupos.has(meta.grupo), `${tipo} tem grupo desconhecido: ${meta.grupo}`);
  }
});
