import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DIAS_DISPONIBILIDADE_CANONICOS,
  normalizarDisponibilidadeSemanal,
  normalizarDisponibilidadesPorUnidade,
} from '../src/components/App/Professores/disponibilidadeCanonica.ts';

test('mantem somente os seis dias canonicos sem alterar a entrada', () => {
  const entrada = {
    Sexta: { inicio: '14:00', fim: '16:00' },
    Sábado: { inicio: '09:00', fim: '15:00' },
    'Sexta-feira': { inicio: '15:00', fim: '16:00' },
  };

  const resultado = normalizarDisponibilidadeSemanal(entrada);

  assert.deepEqual(DIAS_DISPONIBILIDADE_CANONICOS, [
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
  ]);
  assert.deepEqual(resultado, {
    Sexta: { inicio: '14:00', fim: '16:00' },
    Sábado: { inicio: '09:00', fim: '15:00' },
  });
  assert.ok(Object.hasOwn(entrada, 'Sexta-feira'));
});

test('descarta intervalos incompletos e unidades que nao estao selecionadas', () => {
  const resultado = normalizarDisponibilidadesPorUnidade(
    {
      barra: {
        Segunda: { inicio: '10:00', fim: '12:00' },
        Domingo: { inicio: '09:00', fim: '10:00' },
      },
      recreio: {
        Terça: { inicio: '13:00', fim: '' },
      },
      removida: {
        Quarta: { inicio: '14:00', fim: '16:00' },
      },
    },
    ['barra', 'recreio'],
  );

  assert.deepEqual(resultado, {
    barra: {
      Segunda: { inicio: '10:00', fim: '12:00' },
    },
    recreio: {},
  });
});

test('modal e persistencia aplicam a normalizacao defensiva', async () => {
  const [modal, pagina] = await Promise.all([
    readFile(
      new URL('../src/components/App/Professores/ModalProfessor.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/components/App/Professores/ProfessoresPage.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(modal, /normalizarDisponibilidadeSemanal/);
  assert.match(modal, /normalizarDisponibilidadesPorUnidade/);
  assert.match(pagina, /normalizarDisponibilidadeSemanal/);
});
