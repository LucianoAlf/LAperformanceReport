-- Tira da pontuacao do Health Score V3 duas coisas que hoje entram e sujam a conta,
-- SEPARANDO-AS, porque sao problemas diferentes (decisao do Alf, 09/08/2026):
--
--   1. DUPLICATA DE CADASTRO — nao e uma pessoa. E o mesmo professor com o nome escrito
--      diferente, ja mesclado. Nunca deve pontuar, em competencia nenhuma.
--        51 "Lucas Souza dos Santos (mesclado 51)"        -> 48 Lucas Amorim Souza
--        57 "Matheus Reis da Silva Gaspar (mesclado 57)"  -> 46 Matheus Reis
--        58 "Marcos Serafim (mesclado 58)"                -> 56 Marcos Delfino Serafim
--      Os 3 mortos tem ZERO aulas na vida; os 3 vivos tem 400/464/307 aulas, ativos, em
--      duas unidades cada. A mesclagem estava correta — faltava marca-la no banco.
--
--   2. EX-PROFESSOR — pessoa de verdade que trabalhou aqui. O historico dela e real e
--      FICA. So para de gerar snapshot novo quando esta inativa E nao deu nenhuma aula no
--      periodo avaliado.
--
-- Por que as DUAS condicoes no caso 2, e nao so `ativo = false`: professor que sai no dia
-- 20 de agosto ainda tem agosto pela metade. Filtrar so por "inativo" congelaria o mes
-- dele no meio. Com as duas, quem trabalhou continua pontuando ate o fim do mes em que
-- trabalhou.
--
-- SEGURANCA MEDIDA ANTES: os 6 (3 duplicatas + Vinicius 38, Juliana 44, Vanessa 66) tem
-- 435 snapshots em jun/jul/ago e em TODOS eles:
--   score_exibivel = 0 | score not null = 0 | publicado = 0 | ranking_habilitado = 0
-- Nunca contaram para nada. E os 6 tem ZERO aulas desde junho (ultimas 16/04, 26/03, 14/03).
-- Conferido depois: a regra pega 16 professores em agosto e TODOS sao `ativo = false` —
-- nenhum professor ativo e afetado.
--
-- ⚠️ NAO invalidamos os 435 snapshots existentes, de proposito. O trigger
-- `fn_health_score_professor_v3_bloquear_snapshot_fechado` so permite `fechado ->
-- invalidado`, e os nossos sao `provisorio` — a tentativa foi recusada pelo banco, e ele
-- esta certo: snapshot e imutavel. A exclusao e feita na LEITURA, nos dois wrappers, sem
-- reescrever historico.
--
-- ⚠️ NAO altera a formula do V3. Muda a POPULACAO (quem entra na fila), nao o calculo.
do $mig$
declare
  v_def text; v_novo text; v_pos int; v_n int;
  v_corpo_3arg constant text :=
E'
  select b.*
  from public.get_hs_prof_v3_performance_before_scope_fix_20260804(
    p_competencia, p_unidade_id, p_periodicidade
  ) b
  where (
    p_unidade_id is null
    or b.unidade_id is not distinct from p_unidade_id
  )
  and not exists (
    select 1
    from public.fn_health_score_v3_professores_fora_da_pontuacao(p_competencia) f
    where f.professor_id = b.professor_id
  );
';
  v_ancora_2arg constant text :=
E'and s.estado in (''provisorio'', ''em_maturacao'', ''fechado'')';
  v_novo_2arg constant text :=
E'and s.estado in (''provisorio'', ''em_maturacao'', ''fechado'')
      and s.invalidado_em is null
      and not exists (
        select 1
        from public.fn_health_score_v3_professores_fora_da_pontuacao(p_competencia) f
        where f.professor_id = s.professor_id
      )';
begin
  ---------------------------------------------------------------------------
  -- 1. Marca explicita de duplicata (a marca so existia dentro do NOME)
  ---------------------------------------------------------------------------
  if exists (select 1 from information_schema.columns
              where table_name='professores' and column_name='mesclado_em_professor_id') then
    raise exception 'ABORTADO: coluna mesclado_em_professor_id ja existe — migration ja aplicada';
  end if;

  alter table public.professores
    add column mesclado_em_professor_id integer
      references public.professores(id) on delete restrict;

  comment on column public.professores.mesclado_em_professor_id is
    'Quando preenchido, esta linha NAO e uma pessoa: e cadastro duplicado ja mesclado no professor apontado. Nunca entra na populacao do Health Score V3.';

  -- Guarda: duplicata de verdade nao tem aula nenhuma.
  perform 1 from (values (51,48),(57,46),(58,56)) as t(morto, vivo)
   where (select count(*) from aulas_emusys a where a.professor_id = t.morto) > 0;
  if found then
    raise exception 'ABORTADO: algum cadastro marcado como duplicata TEM aulas — nao e duplicata';
  end if;

  update public.professores p
     set mesclado_em_professor_id = v.vivo
    from (values (51,48),(57,46),(58,56)) as v(morto, vivo)
   where p.id = v.morto;
  get diagnostics v_n = row_count;
  if v_n <> 3 then
    raise exception 'ABORTADO: esperava marcar 3 duplicatas, marquei %', v_n;
  end if;

  ---------------------------------------------------------------------------
  -- 2. A regra num lugar so (DRY) — os dois wrappers a consomem
  ---------------------------------------------------------------------------
  create or replace function public.fn_health_score_v3_professores_fora_da_pontuacao(
    p_competencia date
  )
  returns table(professor_id integer)
  language sql
  stable
  set search_path to 'public', 'pg_temp'
  as $fn$
    select pr.id
    from public.professores pr
    where
      -- (1) duplicata de cadastro: nunca pontua, em competencia nenhuma
      pr.mesclado_em_professor_id is not null
      -- (2) ex-professor sem nenhuma aula no periodo avaliado
      -- Janela de 3 meses terminando no mes da competencia: cobre o ciclo trimestral
      -- sem precisar saber a periodicidade, e erra para o lado de MANTER o professor.
      or (
        not pr.ativo
        and not exists (
          select 1
          from public.aulas_emusys ae
          where ae.professor_id = pr.id
            and ae.data_aula >= (date_trunc('month', p_competencia) - interval '2 months')::date
            and ae.data_aula <  (date_trunc('month', p_competencia) + interval '1 month')::date
            and not coalesce(ae.cancelada, false)
        )
      )
  $fn$;

  comment on function public.fn_health_score_v3_professores_fora_da_pontuacao(date) is
    'Quem NAO entra na pontuacao do Health Score V3 numa competencia: duplicata de cadastro (sempre) e ex-professor sem aula no periodo. Consumida pelos dois wrappers de get_health_score_professor_v3_performance.';

  -- ⚠️ ALTER DEFAULT PRIVILEGES deste projeto concede EXECUTE a `anon` em funcao nova.
  -- Revogar nominalmente (revoke from public NAO basta).
  revoke all on function public.fn_health_score_v3_professores_fora_da_pontuacao(date) from public;
  revoke all on function public.fn_health_score_v3_professores_fora_da_pontuacao(date) from anon;
  grant execute on function public.fn_health_score_v3_professores_fora_da_pontuacao(date) to authenticated, service_role;

  ---------------------------------------------------------------------------
  -- 3. Wrapper de 3 args = tela viva + materializacao diaria
  --    Corpo reescrito por posicao para NAO transcrever as 60 colunas do RETURNS TABLE.
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='get_health_score_professor_v3_performance'
     and pg_get_function_identity_arguments(p.oid) = 'p_competencia date, p_unidade_id uuid, p_periodicidade text';

  if v_def is null then raise exception 'ABORTADO: nao achei a sobrecarga de 3 args'; end if;
  if v_def like '%fora_da_pontuacao%' then raise exception 'ABORTADO: wrapper 3 args ja filtrado'; end if;
  if v_def not like '%get_hs_prof_v3_performance_before_scope_fix_20260804%' then
    raise exception 'ABORTADO: wrapper 3 args nao delega para o produtor esperado';
  end if;

  v_pos := position('AS $function$' in v_def);
  if v_pos = 0 then raise exception 'ABORTADO: nao localizei o inicio do corpo (3 args)'; end if;
  execute left(v_def, v_pos + length('AS $function$') - 1) || v_corpo_3arg || '$function$';

  ---------------------------------------------------------------------------
  -- 4. Wrapper de 2 args = leitura de snapshot ja materializado
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='get_health_score_professor_v3_performance'
     and pg_get_function_identity_arguments(p.oid) = 'p_competencia date, p_unidade_id uuid';

  if v_def like '%fora_da_pontuacao%' then raise exception 'ABORTADO: wrapper 2 args ja filtrado'; end if;
  if (length(v_def) - length(replace(v_def, v_ancora_2arg, ''))) / length(v_ancora_2arg) <> 1 then
    raise exception 'ABORTADO: ancora do filtro de estado nao aparece exatamente 1x';
  end if;

  execute replace(v_def, v_ancora_2arg, v_novo_2arg);

  raise notice '3 duplicatas marcadas; regra criada; 2 wrappers filtrados';
end
$mig$;
