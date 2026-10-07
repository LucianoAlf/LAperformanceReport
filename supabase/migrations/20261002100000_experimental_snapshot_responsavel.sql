-- responsavel_nome no snapshot de experimentais
--
-- O Emusys entrega `nome_responsavel` em cada participante de /aulas (o outro
-- escritor, sync-presenca-emusys, ja grava com isso). O snapshot levava so o
-- nome do aluno: `responsavel_nome` ficava NULL nas 84 linhas ativas e o LA
-- Teacher nao tinha o nome completo do responsavel para a ficha.
-- Payload fresco vence; a versao anterior (h) segue como fallback para item
-- que vier sem o campo.
CREATE OR REPLACE FUNCTION public.aplicar_snapshot_experimentais_emusys_v1(p_execucao_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_agora timestamptz := clock_timestamp();
  v_recebidas integer := 0;
  v_inseridas integer := 0;
  v_atualizadas integer := 0;
  v_inativadas integer := 0;
begin
  if p_execucao_id is null then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_EXECUCAO_OBRIGATORIA'
      using errcode = '22023';
  end if;

  if p_unidade_id is null
     or not exists (
       select 1
       from public.unidades u
       where u.id = p_unidade_id
     ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_UNIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  if p_data_inicio is null
     or p_data_fim is null
     or p_data_fim < p_data_inicio
     or p_data_fim - p_data_inicio > 45 then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_INTERVALO_INVALIDO_MAX_45_DIAS'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'la_report:aplicar_snapshot_experimentais_emusys_v1:unidade:'
        || p_unidade_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.emusys_experimentais_snapshot_execucoes e
    where e.id = p_execucao_id
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_EXECUCAO_REPETIDA'
      using errcode = '23505';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_PAYLOAD_DEVE_SER_ARRAY'
      using errcode = '22023';
  end if;

  if to_regclass('pg_temp.snapshot_experimentais_lote') is null then
    create temporary table pg_temp.snapshot_experimentais_lote (
      raw_key text,
      unidade_id uuid,
      execucao_id uuid,
      emusys_aula_id integer,
      participante_chave text,
      emusys_lead_id integer,
      emusys_aluno_id integer,
      payload_emusys_lead_id_texto text,
      payload_emusys_aluno_id_texto text,
      aluno_nome text,
      aluno_telefone text,
      responsavel_nome text,
      data_aula date,
      horario_aula time without time zone,
      cancelada boolean,
      presenca_emusys text,
      situacao_operacional text,
      payload_bruto jsonb
    ) on commit drop;
  else
    truncate table pg_temp.snapshot_experimentais_lote;
  end if;

  insert into pg_temp.snapshot_experimentais_lote (
    raw_key,
    unidade_id,
    execucao_id,
    emusys_aula_id,
    participante_chave,
    emusys_lead_id,
    emusys_aluno_id,
    payload_emusys_lead_id_texto,
    payload_emusys_aluno_id_texto,
    aluno_nome,
    aluno_telefone,
    responsavel_nome,
    data_aula,
    horario_aula,
    cancelada,
    presenca_emusys,
    situacao_operacional,
    payload_bruto
  )
  select
    x.raw_key,
    x.unidade_id,
    x.execucao_id,
    x.emusys_aula_id,
    x.participante_chave,
    x.emusys_lead_id,
    x.emusys_aluno_id,
    nullif(
      ltrim(btrim(x.payload_bruto #>> '{participante,id_lead}'), '0'),
      ''
    ),
    nullif(
      ltrim(btrim(x.payload_bruto #>> '{participante,id_aluno}'), '0'),
      ''
    ),
    x.aluno_nome,
    coalesce(
      nullif(btrim(x.aluno_telefone), ''),
      nullif(
        btrim(x.payload_bruto #>> '{participante,telefone_aluno}'),
        ''
      )
    ),
    nullif(btrim(x.responsavel_nome), ''),
    x.data_aula,
    x.horario_aula,
    x.cancelada,
    x.presenca_emusys,
    x.situacao_operacional,
    x.payload_bruto
  from jsonb_to_recordset(p_itens) as x(
    raw_key text,
    unidade_id uuid,
    execucao_id uuid,
    emusys_aula_id integer,
    participante_chave text,
    emusys_lead_id integer,
    emusys_aluno_id integer,
    aluno_nome text,
    aluno_telefone text,
    responsavel_nome text,
    data_aula date,
    horario_aula time without time zone,
    cancelada boolean,
    presenca_emusys text,
    situacao_operacional text,
    payload_bruto jsonb
  );

  get diagnostics v_recebidas = row_count;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    where case
      when l.payload_emusys_lead_id_texto is null then false
      when l.payload_emusys_lead_id_texto !~ '^[0-9]+$' then true
      when l.payload_emusys_lead_id_texto ~ '^0+$' then true
      when length(ltrim(l.payload_emusys_lead_id_texto, '0')) > 10 then true
      when length(ltrim(l.payload_emusys_lead_id_texto, '0')) = 10
        then ltrim(l.payload_emusys_lead_id_texto, '0') > '2147483647'
      else false
    end
    or case
      when l.payload_emusys_aluno_id_texto is null then false
      when l.payload_emusys_aluno_id_texto !~ '^[0-9]+$' then true
      when l.payload_emusys_aluno_id_texto ~ '^0+$' then true
      when length(ltrim(l.payload_emusys_aluno_id_texto, '0')) > 10 then true
      when length(ltrim(l.payload_emusys_aluno_id_texto, '0')) = 10
        then ltrim(l.payload_emusys_aluno_id_texto, '0') > '2147483647'
      else false
    end
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_IDENTIDADE_PAYLOAD_INVALIDA'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    where nullif(btrim(l.raw_key), '') is null
       or nullif(btrim(l.participante_chave), '') is null
       or nullif(btrim(l.aluno_nome), '') is null
       or l.unidade_id is distinct from p_unidade_id
       or l.execucao_id is distinct from p_execucao_id
       or l.emusys_aula_id is null
       or l.emusys_aula_id <= 0
       or l.data_aula is null
       or l.data_aula < p_data_inicio
       or l.data_aula > p_data_fim
       or l.emusys_lead_id <= 0
       or l.emusys_aluno_id <= 0
       or nullif(btrim(l.situacao_operacional), '') is null
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_ITEM_INVALIDO'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    where l.participante_chave is distinct from case
      when l.emusys_lead_id is not null
        then 'lead:' || l.emusys_lead_id::text
      when l.emusys_aluno_id is not null
        then 'aluno:' || l.emusys_aluno_id::text
      else l.participante_chave
    end
       or (
         l.emusys_lead_id is null
         and l.emusys_aluno_id is null
         and l.participante_chave not like 'fallback:%'
       )
       or l.raw_key is distinct from concat_ws(
         ':',
         p_unidade_id::text,
         l.emusys_aula_id::text,
         l.participante_chave,
         p_execucao_id::text
       )
       or (
         case
           when l.payload_emusys_lead_id_texto is null then null
           else ltrim(l.payload_emusys_lead_id_texto, '0')::integer
         end is distinct from l.emusys_lead_id
       )
       or (
         case
           when l.payload_emusys_aluno_id_texto is null then null
           else ltrim(l.payload_emusys_aluno_id_texto, '0')::integer
         end is distinct from l.emusys_aluno_id
       )
       or (
         l.payload_bruto #>> '{aula,id}' is not null
         and l.payload_bruto #>> '{aula,id}' <> l.emusys_aula_id::text
       )
       or (
         l.emusys_lead_id is not null
         and l.payload_bruto #>> '{participante,id_lead}' is not null
         and l.payload_bruto #>> '{participante,id_lead}'
           <> l.emusys_lead_id::text
       )
       or (
         l.emusys_aluno_id is not null
         and l.payload_bruto #>> '{participante,id_aluno}' is not null
         and l.payload_bruto #>> '{participante,id_aluno}'
           <> l.emusys_aluno_id::text
       )
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_IDENTIDADE_DIVERGENTE'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    group by l.unidade_id, l.emusys_aula_id, l.participante_chave
    having count(*) > 1
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_BUSINESS_KEY_DUPLICADA'
      using errcode = '23505';
  end if;

  select count(*)::integer
    into v_atualizadas
  from pg_temp.snapshot_experimentais_lote l
  join public.emusys_experimentais_raw r
    on r.unidade_id = l.unidade_id
   and r.emusys_aula_id = l.emusys_aula_id
   and r.participante_chave = l.participante_chave
   and r.snapshot_ativo is true;

  v_inseridas := v_recebidas - v_atualizadas;

  update public.emusys_experimentais_raw r
  set
    snapshot_ativo = false,
    snapshot_inativado_em = v_agora,
    updated_at = v_agora
  where r.snapshot_ativo is true
    and exists (
      select 1
      from pg_temp.snapshot_experimentais_lote l
      where l.unidade_id = r.unidade_id
        and l.emusys_aula_id = r.emusys_aula_id
        and l.participante_chave = r.participante_chave
    );

  insert into public.emusys_experimentais_raw (
    raw_key,
    emusys_aula_id,
    aula_emusys_id,
    unidade_id,
    data_aula,
    horario_aula,
    aluno_nome,
    aluno_nome_normalizado,
    aluno_telefone,
    responsavel_nome,
    responsavel_telefone,
    professor_nome,
    professor_id,
    curso_nome,
    curso_id,
    presenca_emusys,
    situacao_operacional,
    lead_id,
    aluno_id,
    lead_experimental_id,
    payload,
    emusys_lead_id,
    emusys_aluno_id,
    participante_chave,
    snapshot_ativo,
    snapshot_execucao_id,
    snapshot_visto_em,
    snapshot_inativado_em
  )
  select
    l.raw_key,
    l.emusys_aula_id,
    h.aula_emusys_id,
    l.unidade_id,
    l.data_aula,
    l.horario_aula,
    btrim(l.aluno_nome),
    lower(regexp_replace(btrim(l.aluno_nome), '\s+', ' ', 'g')),
    coalesce(nullif(l.aluno_telefone, ''), h.aluno_telefone, ''),
    coalesce(l.responsavel_nome, h.responsavel_nome),
    h.responsavel_telefone,
    h.professor_nome,
    h.professor_id,
    h.curso_nome,
    h.curso_id,
    l.presenca_emusys,
    l.situacao_operacional,
    h.lead_id,
    h.aluno_id,
    h.lead_experimental_id,
    coalesce(l.payload_bruto, '{}'::jsonb),
    l.emusys_lead_id,
    l.emusys_aluno_id,
    l.participante_chave,
    true,
    p_execucao_id,
    v_agora,
    null
  from pg_temp.snapshot_experimentais_lote l
  left join lateral (
    select
      antigo.aula_emusys_id,
      nullif(btrim(antigo.aluno_telefone), '') as aluno_telefone,
      antigo.responsavel_nome,
      antigo.responsavel_telefone,
      antigo.professor_nome,
      antigo.professor_id,
      antigo.curso_nome,
      antigo.curso_id,
      antigo.lead_id,
      antigo.aluno_id,
      antigo.lead_experimental_id
    from public.emusys_experimentais_raw antigo
    where antigo.unidade_id = l.unidade_id
      and antigo.emusys_aula_id = l.emusys_aula_id
      and antigo.participante_chave = l.participante_chave
    order by antigo.snapshot_ativo desc, antigo.updated_at desc, antigo.id desc
    limit 1
  ) h on true;

  update public.emusys_experimentais_raw r
  set
    snapshot_ativo = false,
    snapshot_inativado_em = v_agora,
    updated_at = v_agora
  where r.unidade_id = p_unidade_id
    and r.data_aula between p_data_inicio and p_data_fim
    and r.snapshot_ativo is true
    and not exists (
      select 1
      from pg_temp.snapshot_experimentais_lote l
      where l.unidade_id = r.unidade_id
        and l.emusys_aula_id = r.emusys_aula_id
        and l.participante_chave = r.participante_chave
    );

  get diagnostics v_inativadas = row_count;

  insert into public.emusys_experimentais_snapshot_execucoes (
    id,
    unidade_id,
    data_inicio,
    data_fim,
    status,
    linhas_recebidas,
    linhas_ativas,
    linhas_inativadas,
    iniciado_em,
    concluido_em
  ) values (
    p_execucao_id,
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    'completo',
    v_recebidas,
    v_recebidas,
    v_inativadas,
    v_agora,
    clock_timestamp()
  );

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'status', 'completo',
    'linhas_recebidas', v_recebidas,
    'linhas_ativas', v_recebidas,
    'linhas_inseridas', v_inseridas,
    'linhas_atualizadas', v_atualizadas,
    'linhas_versionadas', v_atualizadas,
    'linhas_inativadas', v_inativadas
  );
end;
$function$

