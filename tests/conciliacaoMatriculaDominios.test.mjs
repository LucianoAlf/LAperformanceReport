import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPOS_GRADE_MATRICULA,
  separarPatchConciliacaoMatricula,
} from '../supabase/functions/_shared/conciliacao-matricula-dominios.mjs';

test('delimita grade somente a curso, professor, dia e horário', () => {
  assert.deepEqual(
    [...CAMPOS_GRADE_MATRICULA].sort(),
    ['curso_id', 'dia_aula', 'horario_aula', 'professor_atual_id'],
  );

  const resultado = separarPatchConciliacaoMatricula({
    curso_id: 77,
    professor_atual_id: 15,
    dia_aula: 'Segunda',
    horario_aula: '18:00:00',
  });

  assert.deepEqual(resultado.grade, {
    curso_id: 77,
    professor_atual_id: 15,
    dia_aula: 'Segunda',
    horario_aula: '18:00:00',
  });
  assert.deepEqual(resultado.cadastro, {});
  assert.deepEqual(resultado.financeiro, {});
  assert.deepEqual(resultado.valoresContrato, {});
  assert.equal(resultado.ehSomenteGrade, true);
});

test('nunca classifica cadastro, pagamento ou valores como grade', () => {
  const resultado = separarPatchConciliacaoMatricula({
    telefone: '(21) 99999-9999',
    foto_url: 'https://foto.example/aluno.png',
    forma_pagamento_id: 8,
    status_pagamento: 'inadimplente',
    valor_cheio: 480,
    desconto_condicional: 75,
    valor_parcela: 405,
    data_fim_contrato: '2026-12-20',
  });

  assert.deepEqual(resultado.grade, {});
  assert.deepEqual(resultado.cadastro, {
    telefone: '(21) 99999-9999',
    foto_url: 'https://foto.example/aluno.png',
  });
  assert.deepEqual(resultado.financeiro, {
    forma_pagamento_id: 8,
    status_pagamento: 'inadimplente',
  });
  assert.deepEqual(resultado.valoresContrato, {
    valor_cheio: 480,
    desconto_condicional: 75,
    valor_parcela: 405,
    data_fim_contrato: '2026-12-20',
  });
  assert.equal(resultado.ehSomenteGrade, false);
});

test('preserva a separação quando um patch legado mistura grade e financeiro', () => {
  const resultado = separarPatchConciliacaoMatricula({
    curso_id: 77,
    professor_atual_id: 15,
    forma_pagamento_id: 8,
    valor_parcela: 405,
    campo_desconhecido: 'nao pode virar grade',
  });

  assert.deepEqual(resultado.grade, { curso_id: 77, professor_atual_id: 15 });
  assert.deepEqual(resultado.financeiro, { forma_pagamento_id: 8 });
  assert.deepEqual(resultado.valoresContrato, { valor_parcela: 405 });
  assert.deepEqual(resultado.desconhecidos, { campo_desconhecido: 'nao pode virar grade' });
  assert.equal(resultado.ehSomenteGrade, false);
});
