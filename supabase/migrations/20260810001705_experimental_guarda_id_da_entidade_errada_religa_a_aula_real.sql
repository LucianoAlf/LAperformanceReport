-- `lead_experimentais.emusys_aula_id` esta documentado como "id unico da aula no Emusys",
-- mas em 362 das 479 linhas preenchidas (76%) guarda o id de OUTRA ENTIDADE — o agendamento
-- de aula experimental do CRM, nao a aula.
--
-- PROVA (Emusys GET /aulas, CG, 01/08/2026): a experimental do Fabio Bastos Soares tem
-- `id = 735627`, igual ao de `aulas_emusys.emusys_id`. O que `lead_experimentais` guarda
-- para a MESMA experimental e `69566`.
--
-- Os dois espacos de id nao se sobrepoem:
--   experimentais que CASAM ....... 251.539 a 824.501   (117 linhas)
--   experimentais que NAO CASAM ...  52.687 a  77.355   (362 linhas)
--   aulas experimentais reais ..... 236.826 a 831.490   (865 linhas)
--
-- ⚠️ RISCO REAL, ainda nao materializado: ha 126 aulas de `categoria='normal'` na faixa
-- 52k-77k. Nenhuma casa hoje por acaso, mas um id de agendamento coincidindo com uma aula
-- normal faria a reconciliacao atribuir a experimental a aula errada. Isso e sorte, nao
-- desenho.
--
-- CONSEQUENCIA: `sync-presenca-emusys` reconcilia por `emusys_aula_id`; com o id errado a
-- reconciliacao NUNCA fecha e a experimental fica presa no status inicial. Foi assim que o
-- Fabio ficou `experimental_faltou` tendo matriculado no MESMO dia.
--
-- ESCOPO DESTA MIGRATION — deliberadamente estreito:
--   362 quebradas
--   271 resolviveis por (unidade + data + nome), sem ambiguidade de aula
--    95 SEGURAS: alem de resolviveis, a aula alvo nao esta ocupada por outra linha E so uma
--       linha quebrada resolve para ela  <- unicas corrigidas aqui
--   176 ficam para CURADORIA: colidem com a UNIQUE (unidade_id, emusys_aula_id) porque ha
--       DUPLICATA em `lead_experimentais` — varias linhas para a mesma aula. As 271
--       resolviveis apontam para apenas 170 aulas distintas.
--
-- ⚠️ NAO corrigimos status em massa, de proposito. Dos 90 `experimental_faltou` desde junho,
-- 46 tem aula no dia — mas a presenca real diz 2 presentes / 3 faltas / 41 SEM REGISTRO.
-- Reescrever os 46 seria inventar dado. Corrigimos o VINCULO; a semantica passa a poder ser
-- resolvida pelo pipeline que ja existe.
--
-- ⚠️ A duplicata em `lead_experimentais` infla o DENOMINADOR da taxa de conversao do
-- professor (que conta linhas de experimental). Fica registrado como pendencia; nao foi
-- tocado aqui porque exige decisao humana sobre qual linha sobrevive.
--
-- Medido depois: 117 -> 212 casam; 362 -> 267 quebradas.
do $mig$
declare v_n int; v_antes int;
begin
  ---------------------------------------------------------------------------
  -- 1. Resolucao por (unidade + data + nome), so quando ha UMA aula candidata
  ---------------------------------------------------------------------------
  create or replace function public.fn_resolver_aula_da_experimental(
    p_unidade_id uuid,
    p_data date,
    p_nome_aluno text
  )
  returns bigint
  language sql
  stable
  set search_path to 'public', 'pg_temp'
  as $fn$
    with candidatas as (
      select distinct a.emusys_id
      from public.aulas_emusys a
      join public.aula_alunos_emusys aa on aa.aula_emusys_id = a.id
      where a.unidade_id = p_unidade_id
        and a.data_aula = p_data
        and a.categoria = 'experimental'
        and aa.aluno_nome_normalizado = lower(unaccent(btrim(p_nome_aluno)))
    )
    -- Duas candidatas = ambiguidade. Devolve NULL em vez de escolher: chave errada e pior
    -- que chave ausente.
    select c.emusys_id from candidatas c
    where (select count(*) from candidatas) = 1
    limit 1;
  $fn$;

  comment on function public.fn_resolver_aula_da_experimental(uuid, date, text) is
    'Resolve o emusys_id da aula experimental por unidade+data+nome do aluno. Devolve NULL quando ha mais de uma candidata — nao escolhe.';

  revoke all on function public.fn_resolver_aula_da_experimental(uuid, date, text) from public, anon;
  grant execute on function public.fn_resolver_aula_da_experimental(uuid, date, text) to authenticated, service_role;

  ---------------------------------------------------------------------------
  -- 2. Backfill SO do subconjunto seguro
  ---------------------------------------------------------------------------
  select count(*) into v_antes
    from lead_experimentais le
   where le.emusys_aula_id is not null
     and not exists (select 1 from aulas_emusys a where a.emusys_id = le.emusys_aula_id);

  if v_antes <> 362 then
    raise exception 'ABORTADO: esperava 362 experimentais com id quebrado, achei %', v_antes;
  end if;

  with quebradas as (
    select le.id, le.unidade_id,
           public.fn_resolver_aula_da_experimental(le.unidade_id, le.data_experimental, le.nome_aluno) as aula
      from lead_experimentais le
     where le.emusys_aula_id is not null
       and not exists (select 1 from aulas_emusys a where a.emusys_id = le.emusys_aula_id)
  ), resolviveis as (
    select * from quebradas where aula is not null
  ), seguros as (
    select r.* from resolviveis r
     where not exists (select 1 from lead_experimentais o
                        where o.unidade_id = r.unidade_id and o.emusys_aula_id = r.aula and o.id <> r.id)
       and 1 = (select count(*) from resolviveis r2 where r2.unidade_id = r.unidade_id and r2.aula = r.aula)
  )
  update lead_experimentais le
     set emusys_aula_id = s.aula
    from seguros s
   where le.id = s.id;
  get diagnostics v_n = row_count;

  if v_n <> 95 then
    raise exception 'ABORTADO: esperava religar 95 experimentais, religuei %', v_n;
  end if;

  ---------------------------------------------------------------------------
  -- 3. Correcao para a frente: quando a aula experimental chega no sync, a experimental
  --    sem vinculo ganha o id certo. Precisa ser AQUI porque o webhook chega ANTES de a
  --    aula existir — no insert em `lead_experimentais` nao ha o que resolver ainda.
  ---------------------------------------------------------------------------
  create or replace function public.fn_experimental_recebe_id_da_aula()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
  as $fn$
  declare
    v_aula record;
    v_alvo bigint;
  begin
    select a.emusys_id, a.unidade_id, a.data_aula, a.categoria
      into v_aula
      from public.aulas_emusys a
     where a.id = new.aula_emusys_id;

    if v_aula.categoria is distinct from 'experimental' then
      return new;
    end if;

    -- Trava anti-colisao: a UNIQUE (unidade_id, emusys_aula_id) existe, e ha duplicata
    -- historica em `lead_experimentais`. Se a aula ja esta tomada, nao mexe.
    if exists (
      select 1 from public.lead_experimentais o
       where o.unidade_id = v_aula.unidade_id and o.emusys_aula_id = v_aula.emusys_id
    ) then
      return new;
    end if;

    -- So religa quando ha EXATAMENTE uma experimental sem vinculo valido para essa aula.
    select le.id into v_alvo
      from public.lead_experimentais le
     where le.unidade_id = v_aula.unidade_id
       and le.data_experimental = v_aula.data_aula
       and lower(unaccent(btrim(le.nome_aluno))) = new.aluno_nome_normalizado
       and (
         le.emusys_aula_id is null
         or not exists (select 1 from public.aulas_emusys x where x.emusys_id = le.emusys_aula_id)
       )
     limit 2;

    if not found then
      return new;
    end if;

    if (select count(*) from public.lead_experimentais le
         where le.unidade_id = v_aula.unidade_id
           and le.data_experimental = v_aula.data_aula
           and lower(unaccent(btrim(le.nome_aluno))) = new.aluno_nome_normalizado
           and (le.emusys_aula_id is null
                or not exists (select 1 from public.aulas_emusys x where x.emusys_id = le.emusys_aula_id))
       ) > 1 then
      return new;   -- ambiguo: deixa para curadoria em vez de escolher
    end if;

    update public.lead_experimentais
       set emusys_aula_id = v_aula.emusys_id
     where id = v_alvo;

    return new;
  end;
  $fn$;

  comment on function public.fn_experimental_recebe_id_da_aula() is
    'Liga a experimental do CRM ao id REAL da aula quando ela chega pelo sync. O webhook grava o id do AGENDAMENTO, nao o da aula, e chega antes de a aula existir. Recusa agir quando a aula ja esta tomada ou quando ha mais de uma experimental candidata.';

  drop trigger if exists trg_experimental_recebe_id_da_aula on public.aula_alunos_emusys;
  create trigger trg_experimental_recebe_id_da_aula
    after insert on public.aula_alunos_emusys
    for each row execute function public.fn_experimental_recebe_id_da_aula();

  raise notice '95 experimentais religadas a aula real; trigger de costura instalado';
end
$mig$;
