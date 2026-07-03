import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260703214500_p12_instagram_nao_possui_conciliacao.sql';
const sourcePath = 'src/components/App/Alunos/ConciliacaoMatriculas.tsx';
const syncPath = 'supabase/functions/sync-matriculas-emusys/index.ts';

assert(existsSync(migrationPath), 'migration P12 deve existir para marcar aluno sem Instagram');

const migration = readFileSync(migrationPath, 'utf8');
const source = readFileSync(sourcePath, 'utf8');
const sync = readFileSync(syncPath, 'utf8');

assert(
  migration.includes('ALTER TABLE public.alunos'),
  'migration deve persistir a decisao no cadastro canonico do aluno',
);

assert(
  migration.includes('instagram_nao_possui'),
  'migration deve criar flag instagram_nao_possui em alunos',
);

assert(
  migration.includes('marcar_aluno_sem_instagram_conciliacao'),
  'migration deve criar RPC auditada para marcar aluno sem Instagram',
);

assert(
  migration.includes("decisao IN ('aplicar_emusys', 'manter_la', 'ignorar', 'revisar', 'definir_manual', 'nao_possui_instagram')"),
  'decisoes de atributo devem aceitar nao_possui_instagram na trilha de auditoria',
);

assert(
  migration.includes('INSERT INTO public.alunos_emusys_atributos_decisoes'),
  'RPC deve registrar a decisao na auditoria de atributos',
);

assert(
  migration.includes('UPDATE public.alunos_emusys_atributos_divergencias'),
  'RPC deve resolver somente a divergencia de Instagram selecionada',
);

assert(
  migration.includes('public.texto_indica_sem_instagram'),
  'migration deve criar helper para reconhecer variacoes de nao possui vindas do Emusys',
);

assert(
  source.includes('marcar_aluno_sem_instagram_conciliacao'),
  'UI deve chamar RPC especifica, nao update direto',
);

assert(
  source.includes('Não tem Instagram') || source.includes('Nao tem Instagram'),
  'UI deve oferecer acao clara para o caso sem Instagram',
);

assert(
  source.includes('textoIndicaSemInstagramUI'),
  'UI deve filtrar variacoes de nao possui vindas do Emusys',
);

assert(
  sync.includes('instagram_nao_possui'),
  'sync deve ler a flag canonica para nao recriar pendencia de Instagram',
);

assert(
  sync.includes('textoIndicaSemInstagramEmusys'),
  'sync deve reconhecer variacoes de nao possui vindas do Emusys',
);

console.log('conciliacaoInstagramNaoPossui OK');
