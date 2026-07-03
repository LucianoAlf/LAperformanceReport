import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/App/Alunos/ConciliacaoMatriculas.tsx', 'utf8');
const migrations = readFileSync(
  'supabase/migrations/20260703165000_p10_conciliacao_forma_pagamento_manual.sql',
  'utf8',
);

assert(
  source.includes('alunosAtributosFixados'),
  'a conciliacao deve fixar aluno em atendimento apos resolver uma divergencia individual',
);

assert(
  source.includes('gruposFixadosExtras'),
  'alunos fixados devem continuar visiveis mesmo se sairem do top 50 por prioridade',
);

assert(
  source.includes('definir_forma_pagamento_conciliacao_aluno'),
  'forma de pagamento manual deve passar por RPC auditada, nao por update direto no front',
);

assert(
  migrations.includes('CREATE OR REPLACE FUNCTION public.definir_forma_pagamento_conciliacao_aluno'),
  'migration deve criar RPC especifica para definir forma de pagamento pela conciliacao',
);

assert(
  migrations.includes("decisao IN ('aplicar_emusys', 'manter_la', 'ignorar', 'revisar', 'definir_manual')"),
  'decisoes de atributo devem registrar definir_manual na trilha de auditoria',
);

console.log('conciliacao atributos aluno: OK');
