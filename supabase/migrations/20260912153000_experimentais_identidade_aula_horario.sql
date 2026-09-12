-- A identidade de uma experimental possui tres referencias diferentes:
--
-- * evento/agendamento do webhook (CRM);
-- * aula fisica retornada por GET /aulas;
-- * pessoa + unidade + data + horario.
--
-- O evento do webhook chegou a ser gravado como se fosse a aula fisica. Em
-- paralelo, dois reconciliadores casavam somente por pessoa + data. Isso faz
-- uma remarcacao das 09h poder ocupar a aula das 10h e remove a pessoa da
-- chamada correta. Esta migration separa os contratos sem alterar presenca,
-- status pedagogico ou historico de uma aula real.

-- Antes de trocar a protecao legada, garantir que o novo grao (pessoa,
-- horario e curso) nao junta registros existentes. `emusys_lead_id` separa
-- irmaos que compartilham o mesmo lead/telefone local.
do $migration$
declare
  v_duplicata record;
begin
  select
    le.unidade_id,
    coalesce(le.emusys_lead_id::bigint, -coalesce(le.lead_id, le.id)::bigint) as pessoa_chave,
    lower(btrim(le.nome_aluno)) as nome_chave,
    le.data_experimental,
    le.horario_experimental,
    coalesce(le.curso_interesse_id, -1) as curso_chave,
    array_agg(le.id order by le.id) as ids
  into v_duplicata
  from public.lead_experimentais le
  where le.status::text <> 'cancelada'
    and le.emusys_aula_id is null
  group by
    le.unidade_id,
    coalesce(le.emusys_lead_id::bigint, -coalesce(le.lead_id, le.id)::bigint),
    lower(btrim(le.nome_aluno)),
    le.data_experimental,
    le.horario_experimental,
    coalesce(le.curso_interesse_id, -1)
  having count(*) > 1
  limit 1;

  if found then
    raise exception
      'ABORTADO: duplicata no novo grao de experimental (unidade %, pessoa %, data %, horario %, curso %, ids %)',
      v_duplicata.unidade_id,
      v_duplicata.pessoa_chave,
      v_duplicata.data_experimental,
      v_duplicata.horario_experimental,
      v_duplicata.curso_chave,
      v_duplicata.ids;
  end if;
end
$migration$;

-- A regra antiga ignorava horario e identidade Emusys. Ela impedia o segundo
-- reagendamento do mesmo aluno no mesmo dia e ainda misturava irmaos com o
-- mesmo telefone. A nova chave e usada apenas enquanto nao existe aula fisica.
drop index if exists public.uq_lead_exp_negocio_novo;
drop index if exists public.uq_lead_exp_legado;

create unique index uq_lead_exp_legado
  on public.lead_experimentais (
    unidade_id,
    (coalesce(emusys_lead_id::bigint, -coalesce(lead_id, id)::bigint)),
    (lower(btrim(nome_aluno))),
    data_experimental,
    horario_experimental,
    (coalesce(curso_interesse_id, -1))
  )
  where status::text <> 'cancelada'
    and emusys_aula_id is null;

comment on index public.uq_lead_exp_legado is
  'Experimental sem aula fisica: unidade, pessoa Emusys, nome, data, horario e curso impedem retry sem misturar irmaos ou remarcacoes.';

-- Barreira de dominio para todo escritor: id de evento/agendamento nunca pode
-- permanecer em emusys_aula_id. A aula fisica so e aceita quando existe na
-- mesma unidade e e experimental; o identificador original e preservado.
create or replace function public.fn_experimental_normaliza_referencia_aula()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.emusys_aula_id is null or new.emusys_aula_id = 0 then
    return new;
  end if;

  if exists (
    select 1
    from public.aulas_emusys ae
    where ae.unidade_id = new.unidade_id
      and ae.emusys_id = new.emusys_aula_id
      and lower(btrim(coalesce(ae.categoria, ''))) = 'experimental'
  ) then
    return new;
  end if;

  new.emusys_agendamento_id := coalesce(
    new.emusys_agendamento_id,
    new.emusys_aula_id::bigint
  );
  new.emusys_aula_id := null;
  return new;
end
$function$;

drop trigger if exists trg_experimental_normaliza_referencia_aula
  on public.lead_experimentais;

create trigger trg_experimental_normaliza_referencia_aula
before insert or update of emusys_aula_id
on public.lead_experimentais
for each row
execute function public.fn_experimental_normaliza_referencia_aula();

comment on function public.fn_experimental_normaliza_referencia_aula() is
  'Protege o contrato: emusys_aula_id so aceita aula experimental real da mesma unidade; IDs de evento vao para emusys_agendamento_id.';

-- Corrige valores historicos sem decidir presenca, sem mudar status e sem
-- apagar informacao: todo ID que nao resolve em uma aula experimental da mesma
-- unidade passa a ser metadata do agendamento.
update public.lead_experimentais le
set
  emusys_agendamento_id = coalesce(le.emusys_agendamento_id, le.emusys_aula_id::bigint),
  emusys_aula_id = null
where le.emusys_aula_id is not null
  and not exists (
    select 1
    from public.aulas_emusys ae
    where ae.unidade_id = le.unidade_id
      and ae.emusys_id = le.emusys_aula_id
      and lower(btrim(coalesce(ae.categoria, ''))) = 'experimental'
  );

-- Quando existe exatamente uma aula fisica no mesmo horario para a mesma
-- pessoa e ela ainda esta livre, liga o ID real. Casos ambíguos ou ocupados
-- ficam sem inventar associacao e sao resolvidos pelo roster/Agenda.
with candidatas as (
  select distinct
    le.id as lead_experimental_id,
    le.unidade_id,
    ae.emusys_id as emusys_aula_id
  from public.lead_experimentais le
  left join public.leads l on l.id = le.lead_id
  join public.aulas_emusys ae
    on ae.unidade_id = le.unidade_id
   and le.data_experimental = ae.data_aula
   and le.horario_experimental
       = (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time
   and lower(btrim(coalesce(ae.categoria, ''))) = 'experimental'
   and not coalesce(ae.cancelada, false)
  where le.emusys_aula_id is null
    and le.status::text <> 'cancelada'
    and exists (
      select 1
      from public.aula_alunos_emusys aa
      where aa.aula_emusys_id = ae.id
        and (
          (le.emusys_lead_id is not null and aa.emusys_lead_id = le.emusys_lead_id)
          or (
            coalesce(le.aluno_id, l.aluno_id) is not null
            and aa.aluno_id = coalesce(le.aluno_id, l.aluno_id)
          )
        )
    )
), unicas_por_experimental as (
  select lead_experimental_id, unidade_id, min(emusys_aula_id) as emusys_aula_id
  from candidatas
  group by lead_experimental_id, unidade_id
  having count(*) = 1
), livres as (
  select c.*
  from unicas_por_experimental c
  where not exists (
    select 1
    from public.lead_experimentais ocupado
    where ocupado.unidade_id = c.unidade_id
      and ocupado.emusys_aula_id = c.emusys_aula_id
      and ocupado.id <> c.lead_experimental_id
  )
    and not exists (
      select 1
      from unicas_por_experimental outra
      where outra.unidade_id = c.unidade_id
        and outra.emusys_aula_id = c.emusys_aula_id
        and outra.lead_experimental_id <> c.lead_experimental_id
  )
)
update public.lead_experimentais le
set emusys_aula_id = l.emusys_aula_id
from livres l
where le.id = l.lead_experimental_id;

-- Uma ponte criada pela regra antiga (lead + data, sem hora) nao e evidência
-- de aula. Mantemos a linha para auditoria, mas tiramos apenas a vigência dos
-- vínculos comprovadamente fora do horario, desde que nao exista ID real.
update public.lead_experimental_aulas v
set substituido_em = now()
from public.lead_experimentais le,
     public.aulas_emusys ae
where v.lead_experimental_id = le.id
  and ae.id = v.aula_local_id
  and v.substituido_em is null
  and v.estado = 'vinculado'
  and v.casado_por = 'emusys_lead_id'
  and le.emusys_aula_id is null
  and (
    ae.data_aula is distinct from le.data_experimental
    or (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time
       is distinct from le.horario_experimental
  );

-- A aula fisica e a raiz da exibicao. Um ID fisico confirmado pelo roster
-- vence qualquer data antiga na linha comercial; sem esse ID, so existe
-- fallback com unidade, pessoa, data e horario exatos.
create or replace view public.vw_experimental_aula_canonica
with (security_invoker = true)
as
with aulas as (
  select
    ae.id as aula_local_id,
    ae.unidade_id,
    ae.emusys_id,
    ae.data_aula,
    (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_aula
  from public.aulas_emusys ae
  where lower(btrim(coalesce(ae.categoria, ''))) = 'experimental'
    and not coalesce(ae.cancelada, false)
), candidatas as (
  select
    ae.aula_local_id,
    le.id as lead_experimental_id,
    0 as prioridade,
    case
      when le.emusys_lead_id is not null then 'lead:' || le.emusys_lead_id::text
      when coalesce(le.aluno_id, l.aluno_id) is not null
        then 'aluno:' || coalesce(le.aluno_id, l.aluno_id)::text
      else 'registro:' || le.id::text
    end as pessoa_chave
  from aulas ae
  join public.lead_experimentais le
    on le.unidade_id = ae.unidade_id
   and le.emusys_aula_id = ae.emusys_id
  left join public.leads l on l.id = le.lead_id
  where le.status::text <> 'cancelada'
    and exists (
      select 1
      from public.aula_alunos_emusys aa
      where aa.aula_emusys_id = ae.aula_local_id
        and (
          (le.emusys_lead_id is not null and aa.emusys_lead_id = le.emusys_lead_id)
          or (
            coalesce(le.aluno_id, l.aluno_id) is not null
            and aa.aluno_id = coalesce(le.aluno_id, l.aluno_id)
          )
        )
    )

  union all

  select
    ae.aula_local_id,
    le.id as lead_experimental_id,
    1 as prioridade,
    case
      when le.emusys_lead_id is not null then 'lead:' || le.emusys_lead_id::text
      when coalesce(le.aluno_id, l.aluno_id) is not null
        then 'aluno:' || coalesce(le.aluno_id, l.aluno_id)::text
      else 'registro:' || le.id::text
    end as pessoa_chave
  from aulas ae
  join public.lead_experimentais le
    on le.unidade_id = ae.unidade_id
   and le.emusys_aula_id is null
   and le.data_experimental = ae.data_aula
   and le.horario_experimental = ae.horario_aula
  left join public.leads l on l.id = le.lead_id
  where le.status::text <> 'cancelada'
    and exists (
      select 1
      from public.aula_alunos_emusys aa
      where aa.aula_emusys_id = ae.aula_local_id
        and (
          (le.emusys_lead_id is not null and aa.emusys_lead_id = le.emusys_lead_id)
          or (
            coalesce(le.aluno_id, l.aluno_id) is not null
            and aa.aluno_id = coalesce(le.aluno_id, l.aluno_id)
          )
        )
    )
), ranqueadas as (
  select
    c.*,
    row_number() over (
      partition by c.aula_local_id, c.pessoa_chave
      order by c.prioridade, c.lead_experimental_id desc
    ) as posicao
  from candidatas c
)
select aula_local_id, lead_experimental_id
from ranqueadas
where posicao = 1;

comment on view public.vw_experimental_aula_canonica is
  'Liga experimental a aula fisica confirmada pelo roster; fallback so aceita mesma unidade, pessoa, data e horario.';

-- O reconciliador disparado quando chega o roster precisa usar o mesmo
-- horario exato. A função e pequena; reescrevemos integralmente para deixar a
-- regra auditavel e sem qualquer match por nome.
create or replace function public.fn_experimental_recebe_id_da_aula()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_aula record;
  v_alvo bigint;
  v_qtd int;
begin
  select
    a.emusys_id,
    a.unidade_id,
    a.data_aula,
    a.categoria,
    (a.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_aula
  into v_aula
  from public.aulas_emusys a
  where a.id = new.aula_emusys_id;

  if v_aula.categoria is distinct from 'experimental' then
    return new;
  end if;

  if exists (
    select 1
    from public.lead_experimentais o
    where o.unidade_id = v_aula.unidade_id
      and o.emusys_aula_id = v_aula.emusys_id
  ) then
    return new;
  end if;

  if new.emusys_lead_id is not null then
    select count(*), min(le.id)
    into v_qtd, v_alvo
    from public.lead_experimentais le
    where le.unidade_id = v_aula.unidade_id
      and le.emusys_lead_id = new.emusys_lead_id
      and le.data_experimental = v_aula.data_aula
      and le.horario_experimental = v_aula.horario_aula
      and (
        le.emusys_aula_id is null
        or not exists (
          select 1
          from public.aulas_emusys x
          where x.unidade_id = le.unidade_id
            and x.emusys_id = le.emusys_aula_id
            and lower(btrim(coalesce(x.categoria, ''))) = 'experimental'
        )
      );

    if v_qtd = 1 then
      update public.lead_experimentais
      set emusys_aula_id = v_aula.emusys_id
      where id = v_alvo;
      return new;
    end if;
    if v_qtd > 1 then
      return new;
    end if;
  end if;

  select count(*), min(le.id)
  into v_qtd, v_alvo
  from public.lead_experimentais le
  where le.unidade_id = v_aula.unidade_id
    and le.data_experimental = v_aula.data_aula
    and le.horario_experimental = v_aula.horario_aula
    and lower(unaccent(btrim(le.nome_aluno))) = new.aluno_nome_normalizado
    and (
      le.emusys_aula_id is null
      or not exists (
        select 1
        from public.aulas_emusys x
        where x.unidade_id = le.unidade_id
          and x.emusys_id = le.emusys_aula_id
          and lower(btrim(coalesce(x.categoria, ''))) = 'experimental'
      )
    );

  if v_qtd = 1 then
    update public.lead_experimentais
    set emusys_aula_id = v_aula.emusys_id
    where id = v_alvo;
  end if;

  return new;
end
$function$;

-- A agenda diaria e semanal passam a consumir a mesma relacao fisica. O
-- replace e ancorado e falha se o contrato anterior mudar, em vez de publicar
-- uma funcao parcialmente reescrita.
do $migration$
declare
  v_item record;
  v_def text;
  v_inicio integer;
  v_fim integer;
  v_novo text := $sql$
  from base b
  join public.vw_experimental_aula_canonica ve
    on ve.aula_local_id = b.id
  join public.lead_experimentais le
    on le.id = ve.lead_experimental_id
$sql$;
begin
  for v_item in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid in (
        'public.get_agenda_dia(date,uuid)'::regprocedure,
        'public.get_agenda_semana(date,uuid)'::regprocedure
      )
  loop
    v_def := pg_get_functiondef(v_item.oid);
    v_inicio := position(E'  from base b\n  join lead_experimentais le\n' in v_def);
    v_fim := position(E'  left join cursos c on c.id = le.curso_interesse_id' in v_def);

    if v_inicio = 0 or v_fim = 0 or v_fim <= v_inicio then
      raise exception
        'agenda experimental: ancora de substituicao nao encontrada em %',
        v_item.oid::regprocedure;
    end if;

    v_def := left(v_def, v_inicio - 1)
      || v_novo
      || substring(v_def from v_fim);
    execute v_def;
  end loop;
end
$migration$;

-- A mesma protecao temporal vale para as duas portas de reconciliacao. A
-- primeira ligava uma linha por lead + data; a segunda tratava esse elo como
-- soberano mesmo quando apontava para outro horario.
do $migration$
declare
  v_def text;
  v_select_antigo text :=
    '    select le.id, le.unidade_id, le.data_experimental, le.emusys_lead_id';
  v_select_novo text :=
    '    select le.id, le.unidade_id, le.data_experimental, le.horario_experimental, le.emusys_lead_id';
  v_match_antigo text := $sql$
       and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date
           = v_lead.data_experimental;
$sql$;
  v_match_novo text := $sql$
       and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date
           = v_lead.data_experimental
       and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time
           = v_lead.horario_experimental;
$sql$;
begin
  v_def := pg_get_functiondef(
    'public.fn_reconciliar_experimental_por_lead(integer,integer,integer)'::regprocedure
  );

  if position(v_select_antigo in v_def) = 0 or position(v_match_antigo in v_def) = 0 then
    raise exception 'reconciliador por lead: ancora temporal nao encontrada';
  end if;

  v_def := replace(v_def, v_select_antigo, v_select_novo);
  v_def := replace(v_def, v_match_antigo, v_match_novo);
  execute v_def;
end
$migration$;

do $migration$
declare
  v_def text;
  v_match_antigo text := $sql$
             and r.emusys_lead_id = v_lead.emusys_lead_id
             and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date
                 = v_lead.data_experimental;
$sql$;
  v_match_novo text := $sql$
             and r.emusys_lead_id = v_lead.emusys_lead_id
             and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date
                 = v_lead.data_experimental
             and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time
                 = v_lead.horario_experimental;
$sql$;
begin
  v_def := pg_get_functiondef(
    'public.fn_reconciliar_experimental_aulas(integer,integer)'::regprocedure
  );

  if position(v_match_antigo in v_def) = 0 then
    raise exception 'reconciliador de aulas: ancora temporal nao encontrada';
  end if;

  v_def := replace(v_def, v_match_antigo, v_match_novo);
  execute v_def;
end
$migration$;

-- O webhook/legado continua chamando a mesma RPC, mas a chave deixa de ser o
-- telefone local sozinho. Quando o Emusys entrega lead_id, ele e a identidade
-- da pessoa; sem ele, a degradacao exige nome alem do lead local.
do $migration$
declare
  v_def text;
  v_busca_antiga text := $sql$
  WHERE lead_id = v_lead_id
    AND data_experimental IS NOT DISTINCT FROM p_data_experimental
    AND horario_experimental IS NOT DISTINCT FROM p_horario_experimental
    AND COALESCE(curso_interesse_id, -1) = COALESCE(v_curso_id, -1)
    AND status::text <> 'cancelada'
  ORDER BY id
  LIMIT 1;
$sql$;
  v_busca_nova text := $sql$
  WHERE unidade_id = p_unidade_id
    AND data_experimental IS NOT DISTINCT FROM p_data_experimental
    AND horario_experimental IS NOT DISTINCT FROM p_horario_experimental
    AND COALESCE(curso_interesse_id, -1) = COALESCE(v_curso_id, -1)
    AND (
      (p_emusys_lead_id IS NOT NULL AND emusys_lead_id = p_emusys_lead_id)
      OR (
        p_emusys_lead_id IS NULL
        AND lead_id = v_lead_id
        AND lower(btrim(nome_aluno)) = lower(btrim(v_nome_aluno_safe))
      )
    )
    AND status::text <> 'cancelada'
  ORDER BY id
  LIMIT 1;
$sql$;
  v_insert_antigo text := $sql$
  ELSE
    INSERT INTO lead_experimentais (
      lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
      professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id,
      emusys_lead_id, emusys_aula_id, created_at
    ) VALUES (
      v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
      p_professor_id, v_curso_id, p_status, p_etapa, p_emusys_lead_id, p_emusys_aula_id, p_created_at
    )
    ON CONFLICT (lead_id, data_experimental, horario_experimental, (COALESCE(curso_interesse_id, -1)))
    WHERE id > 1227 AND status::text <> 'cancelada'
    DO UPDATE SET
      nome_aluno = EXCLUDED.nome_aluno,
      professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, lead_experimentais.curso_interesse_id),
      status = CASE
        WHEN lead_experimentais.status::text IN ('experimental_realizada','experimental_faltou','matriculado')
             AND EXCLUDED.status = 'experimental_agendada'
        THEN lead_experimentais.status ELSE EXCLUDED.status END,
      etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
      emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
      emusys_aula_id = COALESCE(lead_experimentais.emusys_aula_id, EXCLUDED.emusys_aula_id),
      updated_at = NOW()
    RETURNING id INTO v_exp_id;
  END IF;
$sql$;
  v_insert_novo text := $sql$
  ELSE
    INSERT INTO lead_experimentais (
      lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
      professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id,
      emusys_lead_id, emusys_aula_id, created_at
    ) VALUES (
      v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
      p_professor_id, v_curso_id, p_status, p_etapa, p_emusys_lead_id, p_emusys_aula_id, p_created_at
    )
    ON CONFLICT (
      unidade_id,
      (coalesce(emusys_lead_id::bigint, -coalesce(lead_id, id)::bigint)),
      (lower(btrim(nome_aluno))),
      data_experimental,
      horario_experimental,
      (coalesce(curso_interesse_id, -1))
    )
    WHERE status::text <> 'cancelada'
      AND emusys_aula_id IS NULL
    DO UPDATE SET
      nome_aluno = EXCLUDED.nome_aluno,
      professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, lead_experimentais.curso_interesse_id),
      status = CASE
        WHEN lead_experimentais.status::text IN ('experimental_realizada','experimental_faltou','matriculado')
             AND EXCLUDED.status = 'experimental_agendada'
        THEN lead_experimentais.status ELSE EXCLUDED.status END,
      etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
      emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
      emusys_aula_id = COALESCE(lead_experimentais.emusys_aula_id, EXCLUDED.emusys_aula_id),
      updated_at = NOW()
    RETURNING id INTO v_exp_id;
  END IF;
$sql$;
begin
  v_def := pg_get_functiondef(
    'public.registrar_experimental(text,text,uuid,text,integer,date,time,integer,integer,timestamptz,text,integer)'::regprocedure
  );

  if position(v_busca_antiga in v_def) = 0 or position(v_insert_antigo in v_def) = 0 then
    raise exception 'registrar experimental: ancora de identidade nao encontrada';
  end if;

  v_def := replace(v_def, v_busca_antiga, v_busca_nova);
  v_def := replace(v_def, v_insert_antigo, v_insert_novo);
  execute v_def;
end
$migration$;

comment on function public.get_agenda_dia(date, uuid) is
  'Agenda diaria: experimental usa a relacao fisica confirmada pelo roster; sem ID, exige pessoa, data e horario exatos.';

comment on function public.get_agenda_semana(date, uuid) is
  'Agenda semanal: experimental usa a relacao fisica confirmada pelo roster; sem ID, exige pessoa, data e horario exatos.';
