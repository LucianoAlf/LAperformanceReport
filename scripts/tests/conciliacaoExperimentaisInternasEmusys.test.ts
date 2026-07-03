import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260703190000_p10b_conciliacao_experimentais_internas_emusys.sql',
  'utf8',
);

assert(
  migration.includes('experimental_interna_emusys'),
  'RPC deve classificar experimental interna vinda do Emusys',
);

assert(
  migration.includes("payload #>> '{aluno,id_lead}'") &&
    migration.includes("payload #>> '{aluno,id_aluno}'"),
  'classificacao deve usar ids do payload Emusys, nao status atual do aluno',
);

assert(
  migration.includes('raw_internas_emusys'),
  'resumo deve expor quantas experimentais internas foram removidas da leitura comercial',
);

assert(
  migration.includes('raw_realizadas_emusys_comercial'),
  'resumo deve separar bruto Emusys total de bruto comercial sem remanejamento interno',
);

assert(
  migration.includes('denominador_taxa_exp_mat') &&
    migration.includes('raw_realizadas_emusys_comercial'),
  'denominador da taxa Exp->Mat deve usar o bruto comercial filtrado',
);

console.log('conciliacao experimentais internas Emusys: OK');
