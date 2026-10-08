-- Snapshot da situacao do aluno: guardar 60 dias de fotos, nao para sempre.
--
-- MEDIDO (08/10/2026): `situacao_alunos_snapshot` guarda uma foto por (unidade, dia) desde
-- 15/09 e nunca apaga: ~1 mil linhas/dia, 21 MB em 24 dias (~330 MB/ano). O unico leitor e
-- `get_situacao_alunos_v1` (TOM/Sol/Lia/app, e por dentro `get_situacao_alunos_resumo_v1` e
-- `get_contrato_assinatura_aluno_v1`): com foto do dia pedido devolve a foto; sem foto,
-- recalcula ao vivo (`_compute_situacao_alunos_v1`).
--
-- MUDANCA: o proprio refresh (que ja apaga a foto do dia antes de regravar) passa a apagar,
-- da MESMA unidade, as fotos com mais de 60 dias. Sem cron novo; usa o indice
-- (unidade_id, referencia). 60 dias cobre sempre o mes passado inteiro.
-- EFEITO HOJE: nenhum (a foto mais antiga e de 15/09, 23 dias). So impede o crescimento.
-- Consulta a um dia com mais de 60 dias passa a ser recalculada ao vivo, como ja acontece
-- hoje para qualquer dia anterior a 15/09.
--
-- Custo/dia: desprezivel (DELETE por indice, 0 linhas na maioria das rodadas).
--
-- Metodo: le a definicao VIVA, troca exatamente 1 ocorrencia (guarda de contagem), confere
-- ACL e configuracao.

do $migration$
declare
  v_def text; n int;
  v_acl_antes text; v_acl_depois text;
  a constant text := E'  delete from public.situacao_alunos_snapshot\n  where unidade_id = p_unidade_id and referencia = p_referencia;\n';
  b constant text := E'  delete from public.situacao_alunos_snapshot\n  where unidade_id = p_unidade_id and referencia = p_referencia;\n\n  -- 08/10/2026: retencao de 60 dias (sem cron proprio). Dia mais antigo que isso, quando\n  -- pedido, e recalculado ao vivo por get_situacao_alunos_v1.\n  delete from public.situacao_alunos_snapshot\n  where unidade_id = p_unidade_id and referencia < p_referencia - 60;\n';
  f regprocedure;
begin
  select oid::regprocedure into f from pg_proc where proname = 'refresh_situacao_alunos_snapshot';
  v_acl_antes := (select proacl::text from pg_proc where oid = f);
  v_def := pg_get_functiondef(f);
  n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if n <> 1 then
    raise exception 'SNAPSHOT_RET: ancora esperada 1, achada %', n;
  end if;
  execute replace(v_def, a, b);

  v_def := pg_get_functiondef(f);
  v_acl_depois := (select proacl::text from pg_proc where oid = f);
  if position('referencia < p_referencia - 60' in v_def) = 0 then
    raise exception 'SNAPSHOT_RET: retencao nao entrou';
  end if;
  if v_acl_antes is distinct from v_acl_depois then
    raise exception 'SNAPSHOT_RET: ACL mudou (% -> %)', v_acl_antes, v_acl_depois;
  end if;
end
$migration$;
