-- `sync_aluno_to_leads` estava com a lista de colunas e os VALUES desalinhados.
--
-- A migration `20260905190000_marcar_leads_sinteticos` acrescentou `origem_registro` ao
-- INSERT: o nome entrou no FIM da lista de colunas, mas o valor `'sync_aluno'` foi posto
-- ANTES de `NOW()` e `false`. O mapeamento ficou:
--
--   created_at       <- 'sync_aluno'   (texto em timestamptz -> 22007)
--   arquivado        <- NOW()
--   origem_registro  <- false
--
-- Sintoma: `invalid input syntax for type timestamp with time zone: "sync_aluno"` em
-- qualquer INSERT de aluno ou reativação (`evadido` -> `ativo`) que caia no ramo "nenhum
-- lead encontrado". Descoberto ao tentar reverter o status da Layara Sales Magalhães.
--
-- ⚠️ Não mordeu ninguém ainda porque os 5 alunos criados desde 05/09 acharam lead e
-- passaram pelo outro ramo — o último lead `sync_aluno` é de 04/09 16:18, véspera do
-- defeito. O primeiro aluno sem lead correspondente falharia inteiro.
--
-- O corpo é reescrito por `replace` sobre `pg_get_functiondef`, com guarda de ocorrência:
-- transcrever à mão uma função deste tamanho é como se perde o resto dela.

do $$
declare
  v_def text;
  v_novo text;
  v_errado text := E'                ''Lead organico - nenhum lead encontrado para vincular com o aluno'',\n'
    || E'                -- 🔴 marca a origem: esta linha NAO e conversao de funil,\n'
    || E'                -- e uma matricula sem lead que ganhou ficha de lead.\n'
    || E'                ''sync_aluno'',\n'
    || E'                NOW(),\n'
    || E'                false';
  v_certo text := E'                ''Lead organico - nenhum lead encontrado para vincular com o aluno'',\n'
    || E'                NOW(),\n'
    || E'                false,\n'
    || E'                -- 🔴 marca a origem: esta linha NAO e conversao de funil,\n'
    || E'                -- e uma matricula sem lead que ganhou ficha de lead.\n'
    || E'                ''sync_aluno''';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sync_aluno_to_leads';

  if v_def is null then
    raise exception 'SYNC_ALUNO_TO_LEADS_AUSENTE';
  end if;

  -- A guarda declara o número esperado em vez de assumir 1: se aparecerem duas, o corpo
  -- mudou desde a apuração e o replace cego trocaria o bloco errado.
  if (select count(*) from regexp_matches(v_def, regexp_replace(v_errado, '([\.\^\$\*\+\?\(\)\[\]\{\}\|\\])', '\\\1', 'g'), 'g')) <> 1 then
    raise exception 'SYNC_ALUNO_TO_LEADS_BLOCO_NAO_ENCONTRADO: corpo divergente do apurado em 08/09/2026';
  end if;

  v_novo := replace(v_def, v_errado, v_certo);
  if v_novo = v_def then
    raise exception 'SYNC_ALUNO_TO_LEADS_REPLACE_SEM_EFEITO';
  end if;

  execute v_novo;
  raise notice 'sync_aluno_to_leads: ordem de origem_registro corrigida';
end $$;
