import test from 'node:test';
import assert from 'node:assert/strict';

import {
  derivarCamposCadastro,
  devePreservarCursoBase,
  montarPatchCadastro,
  normalizarDiaParaComparacao,
  parseDiaDeTurma,
  parseHorarioDeTurma,
  resolverCursoDasDisciplinas,
  resolverProfessorDasDisciplinas,
  valoresIguaisParaCampo,
} from '../supabase/functions/_shared/emusys-cadastro-canonico.ts';

// De/para e mapas de apoio usados na maioria dos casos.
const DEPARA = new Map([[1, 40], [7, 25], [9, 4], [88, 77]]);
const BANDA = new Set([77]);
const PROFS = new Map([[22, 3], [31, 8]]);

test('comparacao normaliza os formatos que o Emusys e o cadastro usam', async (t) => {
  await t.test('horario time do Postgres contra HH:MM do Emusys', () => {
    // `alunos.horario_aula` volta como "16:00:00"; o Emusys manda "16:00".
    // Comparar cru acusava divergencia em 1.163 de 1.163 matriculas ativas.
    assert.equal(valoresIguaisParaCampo('horario_aula', '16:00', '16:00:00'), true);
    assert.equal(valoresIguaisParaCampo('horario_aula', '16:00:00', '16:00:00'), true);
    assert.equal(valoresIguaisParaCampo('horario_aula', '17:00', '16:00:00'), false);
  });

  await t.test('dia da semana em qualquer das formas que o Emusys emite', () => {
    assert.equal(valoresIguaisParaCampo('dia_aula', 'Quinta-feira', 'Quinta'), true);
    assert.equal(valoresIguaisParaCampo('dia_aula', 'Quinta feira', 'Quinta'), true);
    assert.equal(valoresIguaisParaCampo('dia_aula', 'Qui', 'Quinta'), true);
    assert.equal(valoresIguaisParaCampo('dia_aula', 'Terça', 'Terca'), true, 'acento nao pode gerar divergencia');
    assert.equal(valoresIguaisParaCampo('dia_aula', 'Quarta', 'Quinta'), false);
  });

  await t.test('sabado com e sem acento, e nulo nao explode', () => {
    assert.equal(normalizarDiaParaComparacao('Sábado'), 'sabado');
    assert.equal(normalizarDiaParaComparacao('Sab'), 'sabado');
    assert.equal(normalizarDiaParaComparacao(null), '');
    assert.equal(valoresIguaisParaCampo('dia_aula', null, null), true);
  });

  await t.test('campo comum cai na comparacao de texto', () => {
    assert.equal(valoresIguaisParaCampo('professor_atual_id', 3, 3), true);
    assert.equal(valoresIguaisParaCampo('professor_atual_id', 3, null), false);
  });
});

test('nome da turma e a fonte de dia e horario', async (t) => {
  await t.test('padrao normal', () => {
    assert.equal(parseDiaDeTurma('G_Ter_14'), 'Terça');
    assert.equal(parseHorarioDeTurma('G_Ter_14'), '14:00:00');
    assert.equal(parseDiaDeTurma('MPpi_Qua_16'), 'Quarta');
    assert.equal(parseHorarioDeTurma('MPpi_Qua_16'), '16:00:00');
  });

  await t.test('horario quebrado em minutos', () => {
    assert.equal(parseHorarioDeTurma('X_Qua_1430'), '14:30:00');
  });

  await t.test('nome fora do padrao nao inventa valor', () => {
    assert.equal(parseDiaDeTurma('TurmaLivre'), null);
    assert.equal(parseHorarioDeTurma('TurmaLivre'), null);
    assert.equal(parseHorarioDeTurma('G_Ter_99'), null, 'hora invalida');
    assert.equal(parseHorarioDeTurma('G_Ter_abc'), null);
    assert.equal(parseDiaDeTurma(''), null);
  });
});

test('webhook e sync derivam EXATAMENTE o mesmo resultado', () => {
  // Esta e a garantia central do modulo: os dois payloads tem formatos diferentes,
  // mas a regra e uma so. Se este teste quebrar, voltamos a ter duas fontes de
  // escrita divergentes — o padrao que causou as duplicatas de renovacao.

  // Recorte real do webhook `matricula_alterada` (Arthur Ludogero / Barra, 19/08).
  const disciplinasDoWebhook = [{
    id: 1079,
    nome: 'Musicalização Preparatória para instrumento',
    tipo: 'Turma',
    nome_turma: 'MPpi_Qua_16',
    agendamentos: [{ horario: '16:00', dia_da_semana_nome: 'Quarta-feira', duracao_em_minutos: 50 }],
    id_professor: 22,
    disciplina_id: 1,
  }];

  // A mesma matricula como vem de `GET /matriculas`: sem `agendamentos`.
  const disciplinasDaApi = [{
    disciplina_id: 1,
    nome_turma: 'MPpi_Qua_16',
    id_professor: 22,
  }];

  const base = {
    deparaCurso: DEPARA,
    cursosBanda: BANDA,
    professorPorEmusysId: PROFS,
    cursoAtualAluno: 40,
  };

  const viaWebhook = derivarCamposCadastro({ ...base, disciplinas: disciplinasDoWebhook });
  const viaApi = derivarCamposCadastro({ ...base, disciplinas: disciplinasDaApi });

  assert.deepEqual(viaWebhook, viaApi, 'as duas fontes precisam produzir o mesmo patch');
  assert.deepEqual(viaWebhook, {
    curso_id: 40,
    professor_atual_id: 3,
    dia_aula: 'Quarta',
    horario_aula: '16:00:00',
  });
});

test('dia e horario saem do nome_turma, nao do agendamento', () => {
  // O webhook traz `agendamentos.horario` pronto, mas a API nao tem esse campo.
  // Usar o agendamento faria as duas fontes derivarem de origens diferentes.
  // Aqui os dois discordam de proposito: vence o nome_turma.
  const derivados = derivarCamposCadastro({
    disciplinas: [{
      disciplina_id: 7,
      nome_turma: 'G_Ter_14',
      id_professor: 22,
      agendamentos: [{ horario: '19:00', dia_da_semana_nome: 'Sexta-feira' }],
    }],
    deparaCurso: DEPARA,
    cursosBanda: BANDA,
    professorPorEmusysId: PROFS,
    cursoAtualAluno: 25,
  });

  assert.equal(derivados.dia_aula, 'Terça');
  assert.equal(derivados.horario_aula, '14:00:00');
});

test('ambiguidade nunca vira escrita automatica', async (t) => {
  await t.test('dois cursos regulares nao definem curso', () => {
    const derivados = derivarCamposCadastro({
      disciplinas: [
        { disciplina_id: 7, nome_turma: 'G_Ter_14', id_professor: 22 },
        { disciplina_id: 9, nome_turma: 'G_Qui_10', id_professor: 22 },
      ],
      deparaCurso: DEPARA,
      cursosBanda: BANDA,
      professorPorEmusysId: PROFS,
      cursoAtualAluno: null,
    });
    assert.equal(derivados.curso_id, undefined, 'curso ambiguo fica para a fila humana');
    assert.equal(derivados.dia_aula, undefined, 'turmas divergentes nao forcam dia');
    assert.equal(derivados.horario_aula, undefined);
  });

  await t.test('curso do aluno desempata a turma quando ele tem varias disciplinas', () => {
    const derivados = derivarCamposCadastro({
      disciplinas: [
        { disciplina_id: 7, nome_turma: 'G_Ter_14', id_professor: 22 },
        { disciplina_id: 9, nome_turma: 'G_Qui_10', id_professor: 31 },
      ],
      deparaCurso: DEPARA,
      cursosBanda: BANDA,
      professorPorEmusysId: PROFS,
      cursoAtualAluno: 4,
    });
    assert.equal(derivados.dia_aula, 'Quinta', 'usa a turma da disciplina do curso dele');
    assert.equal(derivados.horario_aula, '10:00:00');
  });

  await t.test('sem disciplina nao deriva nada', () => {
    assert.deepEqual(derivarCamposCadastro({
      disciplinas: [],
      deparaCurso: DEPARA,
      cursosBanda: BANDA,
      professorPorEmusysId: PROFS,
    }), {});
  });
});

test('banda e Musicalizacao Preparatoria seguem as regras do dominio', async (t) => {
  await t.test('curso de banda nao vira o curso comercial do aluno', () => {
    const { cursos, cursosBanda } = resolverCursoDasDisciplinas(
      [{ disciplina_id: 88, nome_turma: 'B_Sex_19' }],
      DEPARA,
      BANDA,
    );
    assert.deepEqual(cursos, []);
    assert.deepEqual(cursosBanda, [77]);

    const derivados = derivarCamposCadastro({
      disciplinas: [{ disciplina_id: 88, nome_turma: 'B_Sex_19', id_professor: 22 }],
      deparaCurso: DEPARA,
      cursosBanda: BANDA,
      professorPorEmusysId: PROFS,
      cursoAtualAluno: 25,
    });
    assert.equal(derivados.curso_id, undefined, 'banda nunca sobrescreve o curso');
  });

  await t.test('aluno de MP mantem MP mesmo quando a disciplina e o instrumento', () => {
    assert.equal(devePreservarCursoBase(40, 25), true);
    assert.equal(devePreservarCursoBase(25, 40), false);

    const derivados = derivarCamposCadastro({
      disciplinas: [{ disciplina_id: 7, nome_turma: 'G_Ter_14', id_professor: 22 }],
      deparaCurso: DEPARA,
      cursosBanda: BANDA,
      professorPorEmusysId: PROFS,
      cursoAtualAluno: 40,
    });
    assert.equal(derivados.curso_id, undefined, 'MP preservada');
    assert.equal(derivados.professor_atual_id, 3, 'mas professor e turma seguem valendo');
  });

  await t.test('disciplina sem de/para e sinalizada e nao vira curso', () => {
    const { cursos, naoMapeada } = resolverCursoDasDisciplinas(
      [{ disciplina_id: 4242, nome_turma: 'G_Ter_14' }],
      DEPARA,
      BANDA,
    );
    assert.deepEqual(cursos, []);
    assert.equal(naoMapeada, 4242);
  });

  await t.test('professor desconhecido nao zera o vinculo atual', () => {
    assert.equal(resolverProfessorDasDisciplinas([{ id_professor: 999 }], PROFS), null);
    const derivados = derivarCamposCadastro({
      disciplinas: [{ disciplina_id: 7, nome_turma: 'G_Ter_14', id_professor: 999 }],
      deparaCurso: DEPARA,
      cursosBanda: BANDA,
      professorPorEmusysId: PROFS,
      cursoAtualAluno: 25,
    });
    assert.equal(derivados.professor_atual_id, undefined);
  });
});

test('patch so leva o que mudou e respeita decisao humana', async (t) => {
  const derivados = {
    curso_id: 25,
    professor_atual_id: 8,
    dia_aula: 'Terça',
    horario_aula: '14:00:00',
  };

  await t.test('campo ja igual nao entra no patch', () => {
    const { patch } = montarPatchCadastro(derivados, {
      curso_id: 25,
      professor_atual_id: 8,
      dia_aula: 'Terça',
      horario_aula: '14:00:00',
    }, new Set());
    assert.deepEqual(patch, {}, 'nada mudou -> nenhum UPDATE');
  });

  await t.test('formato diferente NAO conta como mudanca', () => {
    // Este e o falso positivo que inflava a fila: "14:00" x "14:00:00".
    const { patch } = montarPatchCadastro(derivados, {
      curso_id: 25,
      professor_atual_id: 8,
      dia_aula: 'Terça-feira',
      horario_aula: '14:00',
    }, new Set());
    assert.deepEqual(patch, {});
  });

  await t.test('so o campo que mudou de verdade entra', () => {
    const { patch, diffs } = montarPatchCadastro(derivados, {
      curso_id: 25,
      professor_atual_id: 3,
      dia_aula: 'Terça',
      horario_aula: '14:00:00',
    }, new Set());
    assert.deepEqual(patch, { professor_atual_id: 8 });
    assert.deepEqual(diffs, { professor_atual_id: { de: 3, para: 8 } });
  });

  await t.test('campo fixado por decisao humana e intocavel', () => {
    const { patch } = montarPatchCadastro(derivados, {
      curso_id: 99,
      professor_atual_id: 3,
      dia_aula: 'Sexta',
      horario_aula: '09:00:00',
    }, new Set(['curso_id', 'horario_aula']));
    assert.deepEqual(patch, { professor_atual_id: 8, dia_aula: 'Terça' });
    assert.equal('curso_id' in patch, false, 'Manter LA Report tem que segurar');
    assert.equal('horario_aula' in patch, false);
  });

  await t.test('campo ausente na derivacao nunca apaga o valor atual', () => {
    const { patch } = montarPatchCadastro({ professor_atual_id: 8 }, {
      curso_id: 25,
      professor_atual_id: 3,
      dia_aula: 'Terça',
      horario_aula: '14:00:00',
    }, new Set());
    assert.deepEqual(patch, { professor_atual_id: 8 });
  });
});
