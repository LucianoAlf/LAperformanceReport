import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  getHealthScoreV3ActivationBlockers,
  type HealthScoreV3CatalogSegment,
  type HealthScoreV3SegmentDraftGoal,
} from '../../src/lib/healthScoreProfessorV3.ts';

const migrationPath =
  'supabase/migrations/20260721152000_health_score_v3_oferta_formal_guard.sql';

const catalogSegment: HealthScoreV3CatalogSegment = {
  unidadeId: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  unidadeNome: 'Campo Grande',
  cursoId: 3,
  cursoNome: 'Musicalizacao Infantil IND',
  emusysDisciplinaId: 3,
  emusysDisciplinaIds: [3],
  modalidade: 'individual',
  ofertado: true,
  professoresFormais: 3,
  fonte: 'emusys',
  sincronizadoEm: '2026-07-21T12:00:00Z',
};

function draftGoal(
  estado: 'configurada' | 'nao_ofertada',
): HealthScoreV3SegmentDraftGoal {
  const base = {
    id: 'meta-1',
    configId: 'config-1',
    unidadeId: catalogSegment.unidadeId,
    unidadeNome: catalogSegment.unidadeNome,
    cursoId: catalogSegment.cursoId,
    cursoNome: catalogSegment.cursoNome,
    emusysDisciplinaId: catalogSegment.emusysDisciplinaId,
    emusysDisciplinaIds: catalogSegment.emusysDisciplinaIds,
    modalidade: catalogSegment.modalidade,
    ofertado: catalogSegment.ofertado,
    professoresFormais: catalogSegment.professoresFormais,
    fonte: 'emusys' as const,
    sincronizadoEm: catalogSegment.sincronizadoEm,
    persistida: true,
    tocada: false,
    parametros: {},
    criadoEm: null,
    atualizadoEm: null,
  };

  return estado === 'configurada'
    ? {
        ...base,
        estado,
        capacidadeMaxima: 1,
        metaMediaTurma: 1,
        metaCarteiraCurso: 3,
      }
    : {
        ...base,
        estado,
        capacidadeMaxima: null,
        metaMediaTurma: null,
        metaCarteiraCurso: null,
      };
}

test('oferta formal nao pode ser ativada como nao ofertada', () => {
  const blockers = getHealthScoreV3ActivationBlockers(
    [draftGoal('nao_ofertada')],
    [catalogSegment],
  );

  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].cursoId, catalogSegment.cursoId);
  assert.equal(
    getHealthScoreV3ActivationBlockers(
      [draftGoal('configurada')],
      [catalogSegment],
    ).length,
    0,
  );
});

test('banco repete o guard de oferta formal no salvamento', () => {
  assert.equal(existsSync(migrationPath), true, 'migration de guard deve existir');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /formalmente_ofertado\s+is\s+true/i);
  assert.match(migration, /r\.estado\s*=\s*'nao_ofertada'/i);
  assert.match(migration, /oferta formal nao pode ser marcada como nao ofertada/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
});
