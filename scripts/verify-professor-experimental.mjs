import assert from 'node:assert/strict';
import { resolverProfessorExperimentalCanonico } from '../src/lib/comercialProfessorExperimental.js';

const semExperimentalCanonica = resolverProfessorExperimentalCanonico({
  alunoProfessorExperimentalNome: 'Matheus Lana da Silva',
  experimentais: [],
});

assert.equal(
  semExperimentalCanonica,
  null,
  'sem lead_experimentais realizado, nao deve reaproveitar professor_experimental_id antigo do aluno',
);

const comExperimentalCanonica = resolverProfessorExperimentalCanonico({
  alunoProfessorExperimentalNome: null,
  experimentais: [
    {
      status: 'experimental_realizada',
      dataExperimental: '2026-06-17',
      professorExperimentalNome: 'Jeyson Gaia Ramos',
    },
  ],
});

assert.equal(
  comExperimentalCanonica,
  'Jeyson Gaia Ramos',
  'deve usar professor vindo de lead_experimentais realizado',
);

const apenasFalta = resolverProfessorExperimentalCanonico({
  alunoProfessorExperimentalNome: 'Professor Legado',
  experimentais: [
    {
      status: 'experimental_faltou',
      dataExperimental: '2026-06-17',
      professorExperimentalNome: 'Professor da Falta',
    },
  ],
});

assert.equal(
  apenasFalta,
  null,
  'falta/no-show nao deve preencher professor experimental de conversao',
);

console.log('professor experimental canonico ok');
