import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

// Contexto: ate 2026-09-08 a atividade extra (banda, Power Kids, GarageBand,
// Percussion Kids) contava na carteira do professor. A regra dizia o contrario em
// quatro documentos e ninguem media. Estes testes rodam a funcao REAL - nao conferem
// texto - para que a regra volte a quebrar em silencio nunca mais.

test('atividade extra e marcada por curso_id, e os demais cursos ficam intactos', async () => {
  const { agruparCarteiraProfessorCanonica } = await import(
    '../src/lib/carteiraProfessorDetalheCanonica.ts'
  );

  // Caso real: Mauricio Cabral faz Bateria com um professor e Minha Banda com o Will.
  // Aqui, a mesma pessoa com os dois cursos NO MESMO professor - o cenario que mais
  // engana, porque ela precisa aparecer na carteira E ter so a banda marcada.
  const jornadas = [
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 848, aluno_nome: 'Mauricio Cabral',
      emusys_aluno_id: 682, curso_id: 27, curso_nome: 'Bateria', status_matricula: 'ativa',
      dia_semana: 'Terca', horario: '17:00',
    },
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 1135, aluno_nome: 'Mauricio Cabral',
      emusys_aluno_id: 682, curso_id: 33, curso_nome: 'Minha Banda Para Sempre',
      status_matricula: 'ativa', dia_semana: 'Sabado', horario: '15:00',
    },
  ];
  const alunos = [
    { id: 848, nome: 'Mauricio Cabral', classificacao: 'EMLA', valor_parcela: 402, status: 'ativo' },
    { id: 1135, nome: 'Mauricio Cabral', classificacao: 'EMLA', valor_parcela: 0, status: 'ativo' },
  ];

  const { alunos: carteira } = agruparCarteiraProfessorCanonica(
    jornadas,
    alunos,
    [],
    new Set([33]), // so o curso de banda
  );

  assert.equal(carteira.length, 1, 'a pessoa com 2 cursos deve aparecer uma vez');
  const pessoa = carteira[0];
  assert.deepEqual(
    pessoa.cursos_atividade_extra,
    ['Minha Banda Para Sempre'],
    'so o curso de banda pode ser marcado',
  );
  assert.ok(
    pessoa.cursos_lista.includes('Bateria'),
    'o curso regular continua na lista: a decisao e sinalizar, nao esconder',
  );
  assert.ok(
    pessoa.cursos_lista.includes('Minha Banda Para Sempre'),
    'o curso de banda continua VISIVEL - o professor da essa aula e ve o aluno na agenda',
  );
});

test('sem o conjunto de cursos de projeto, nada e marcado como extra', async () => {
  const { agruparCarteiraProfessorCanonica } = await import(
    '../src/lib/carteiraProfessorDetalheCanonica.ts'
  );
  const jornadas = [{
    unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 1, aluno_nome: 'Aluno',
    emusys_aluno_id: 1, curso_id: 33, curso_nome: 'Minha Banda Para Sempre',
    status_matricula: 'ativa', dia_semana: 'Sabado', horario: '15:00',
  }];

  const { alunos: carteira } = agruparCarteiraProfessorCanonica(
    jornadas,
    [{ id: 1, nome: 'Aluno', classificacao: 'EMLA', status: 'ativo' }],
    [],
  );

  // Falha da consulta de cursos nao pode inventar marcacao: sem o conjunto, a lista
  // aparece como antes. Degradacao visivel e melhor que badge errado.
  assert.deepEqual(carteira[0].cursos_atividade_extra, []);
});

test('a marcacao NAO pode voltar a casar por nome de curso', () => {
  const fonte = read('src/lib/carteiraProfessorDetalheCanonica.ts');
  // O filtro por nome ('%banda%', '%power kids%') e o padrao fragil que a regra ja
  // aposentou em favor de cursos.is_projeto_banda. Nome varia entre unidades.
  assert.doesNotMatch(
    fonte,
    /curso_nome[^\n]*(toLowerCase|toLocaleLowerCase)[^\n]*(banda|kids)/i,
    'marcar atividade extra por nome de curso e proibido: use curso_id + is_projeto_banda',
  );
  assert.match(
    fonte,
    /cursosProjeto\.has\(Number\(jornada\.curso_id\)\)/,
    'a marcacao deve continuar sendo por curso_id',
  );
});

test('a coluna de carteira e os cabecalhos explicam o que entra em cada numero', () => {
  const tela = read('src/components/App/Professores/TabCarteiraProfessores.tsx');

  // A definicao de "Alunos" mudou em 08/09/2026 e nada na tela dizia isso. Cada
  // indicador precisa carregar a propria regra ao alcance do mouse.
  assert.match(tela, /function ThComExplicacao/);
  for (const rotulo of ['Alunos', 'Trancados', 'Atividade extra', 'MRR', 'Ticket', 'Média/Turma', 'Health Score']) {
    assert.match(
      tela,
      new RegExp(`ThComExplicacao rotulo="${rotulo.replace('/', '\/')}"`),
      `a coluna ${rotulo} precisa explicar como e calculada`,
    );
  }
  assert.match(
    tela,
    /cursos_atividade_extra\?\.includes\(nomeCurso\)/,
    'a lista expandida deve marcar o curso de atividade extra',
  );
});
