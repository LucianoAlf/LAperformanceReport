-- 2026-08-11 — Importa data_nascimento do Emusys e calcula faixa_etaria automaticamente.
--
-- Problema: o observador descartava webhooks de lead sem telefone (paridade com n8n),
-- jogando fora email, canal, instrumento e data de nascimento que o Emusys tinha.
-- Resultado: 23 leads com experimental agendada estao sem faixa_etaria, e 14 webhooks
-- descartados em agosto so. O campo faixa_etaria e enum (LAMK = ate 11 anos, EMLA = 12+),
-- mas ninguem preenchia — nem o Emusys envia, nem a equipe preenche.
--
-- Solucao:
--   1. Adiciona data_nascimento em leads (o Emusys manda data_nascimento_aluno).
--   2. Trigger calcula faixa_etaria automaticamente: <12 = LAMK, >=12 = EMLA.
--   3. upsert_lead ganha p_data_nascimento e para de exigir telefone (match so por emusys_lead_id).

-- 1. Coluna data_nascimento
alter table public.leads add column if not exists data_nascimento date;
comment on column public.leads.data_nascimento is
  'Data de nascimento do lead, importada do Emusys (data_nascimento_aluno). Usada para calcular faixa_etaria.';

-- 2. Funcao que deriva faixa_etaria da data de nascimento
--    LAMK = LA Music Kids (ate 11 anos completos)
--    EMLA = Escola de Musica LA (12+ anos)
create or replace function public.calcular_faixa_etaria(p_data_nascimento date)
returns text
language sql
immutable
as $$
  select case
    when p_data_nascimento is null then null
    when extract(year from age(current_date, p_data_nascimento)) < 12 then 'LAMK'
    else 'EMLA'
  end
$$;

-- 3. Trigger: quando data_nascimento for gravada/atualizada e faixa_etaria estiver vazia,
--    calcula automaticamente. Nao sobrescreve faixa_etaria preenchida manualmente.
create or replace function public.trg_calcular_faixa_etaria_lead()
returns trigger
language plpgsql
as $function$
begin
  if new.data_nascimento is not null and new.faixa_etaria is null then
    new.faixa_etaria := public.calcular_faixa_etaria(new.data_nascimento);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_calcular_faixa_etaria_lead on public.leads;
create trigger trg_calcular_faixa_etaria_lead
  before insert or update of data_nascimento on public.leads
  for each row
  execute function public.trg_calcular_faixa_etaria_lead();

-- 4. Backfill: leads que ja tem data_nascimento mas faixa_etaria vazia
--    (vai rodar quando aplicarmos o backfill dos webhooks descartados)
update public.leads
  set faixa_etaria = public.calcular_faixa_etaria(data_nascimento)
  where data_nascimento is not null
    and faixa_etaria is null;

-- 5. upsert_lead: ganha p_data_nascimento e nao exige mais telefone
--    Reescrevemos a funcao inteira porque plpgsql nao suporta ALTER FUNCTION ADD PARAMETER.
create or replace function public.upsert_lead(
  p_nome text,
  p_telefone text,
  p_email text,
  p_unidade_id uuid,
  p_curso text,
  p_canal text,
  p_source_id integer,
  p_source_type text default 'emusys',
  p_arquivar boolean default false,
  p_data_contato date default null,
  p_data_nascimento date default null
)
returns json
language plpgsql
security definer
as $function$
declare
  v_lead_id       integer;
  v_curso_id      integer;
  v_canal_id      integer;
  v_telefone_safe text;
  v_action        text;
  v_detalhes      jsonb;
  v_log_nome      text;
begin
  if upper(trim(coalesce(p_nome, ''))) = 'NÃO INFORMADO' then
    p_nome := null;
  end if;

  v_log_nome := coalesce(nullif(trim(p_nome), ''), '(sem nome)');

  -- 1. Resolver curso_interesse_id
  v_curso_id := case upper(trim(unaccent(coalesce(p_curso, ''))))
    when 'TECLADO' then 16 when 'PIANO' then 18
    when 'VIOLAO' then 10 when 'GUITARRA' then 14
    when 'CANTO' then 6  when 'BATERIA' then 27
    when 'MUSICALIZACAO' then 4 when 'UKULELE' then 8
    when 'VIOLINO' then 12 when 'FLAUTA DOCE' then 20
    when 'CONTRABAIXO' then 21 when 'SAX' then 31
    when 'CAVAQUINHO' then 35 when 'FLAUTA TRANSVERSA' then 37
    when 'VOZ' then 6
    when 'MUSICA' then 4
    when 'MUSICALIZACAO INFANTIL' then 4
    when 'MUSICALIZACAO BEBES' then 2
    when 'MUSICALIZACAO PARA BEBES' then 2
    when 'MUSICALIZACAO PREPARATORIA' then 40
    when 'SAXOFONE' then 31
    when 'FLAUTA TRANSVERSAL' then 37
    else null
  end;

  -- 2. Normalizar aliases do Emusys para nomes do canais_origem
  p_canal := case upper(trim(p_canal))
    when 'WHATSAPP' then 'Facebook'
    when 'SITE DA ESCOLA' then 'Google'
    when 'INTERNET' then 'Google'
    when 'E-MAIL MARKETING' then 'Google'
    when 'EX ALUNO' then 'Ex-aluno'
    when 'PLACA DA FACHADA' then 'Visita/Placa'
    when 'AMIGO' then 'Indicação'
    when 'VISITA' then 'Visita/Placa'
    when 'PROFESSOR' then 'Indicação'
    when 'ALUNO DA ESCOLA' then 'Indicação'
    when 'DIGITAL INFLUENCER' then 'Instagram'
    when 'TELEFONE' then 'Ligação'
    when 'SMS' then 'Convênios'
    when 'PANFLETOS' then 'Convênios'
    when 'PESQUISA DE RUA' then 'Convênios'
    when 'SHOPPING' then 'Convênios'
    when 'COMERCIOS' then 'Convênios'
    when 'LOJA DE MÚSICA' then 'Convênios'
    when 'IGREJA' then 'Convênios'
    when 'RECITAL' then 'Convênios'
    when 'JORNAL' then 'Convênios'
    when 'RÁDIO' then 'Convênios'
    when 'REVISTA' then 'Convênios'
    when 'TWITTER' then 'Convênios'
    when 'POLO UNIVERSITARIO' then 'Convênios'
    when 'PATROCINADORES' then 'Convênios'
    when 'FAMILY' then 'Indicação'
    when 'INSTAGRAM' then 'Instagram'
    else p_canal
  end;

  select id into v_canal_id from canais_origem where lower(nome) = lower(trim(p_canal)) limit 1;

  -- 3. Buscar lead existente por emusys_lead_id (prioridade) ou telefone
  --    Telefone pode ser null — nesse caso so casa por source_id.
  if p_source_type = 'emusys' then
    select id into v_lead_id from leads
      where emusys_lead_id = p_source_id and unidade_id = p_unidade_id and p_source_id is not null
      limit 1;
    if v_lead_id is null and p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  elsif p_source_type = 'nocodb' then
    select id into v_lead_id from leads
      where nocodb_lead_id = p_source_id and unidade_id = p_unidade_id and p_source_id is not null
      limit 1;
    if v_lead_id is null and p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  elsif p_source_type = 'campanha' then
    if p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  end if;

  v_detalhes := json_build_object(
    'source_id', p_source_id, 'telefone', p_telefone, 'canal', p_canal, 'curso', p_curso,
    'data_nascimento', p_data_nascimento,
    'sem_nome', (p_nome is null or trim(p_nome) = ''), 'sem_telefone', (p_telefone is null or trim(p_telefone) = '')
  )::jsonb;

  -- 4. Arquivamento
  if p_arquivar and v_lead_id is not null then
    update leads set arquivado = true, status = 'arquivado', updated_at = now() where id = v_lead_id;
    v_action := 'archived';
    insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
    return json_build_object('action', v_action, 'lead_id', v_lead_id);
  end if;

  -- 5. UPDATE
  if v_lead_id is not null then
    v_telefone_safe := null;
    if p_telefone is not null then
      if not exists (select 1 from leads where telefone = p_telefone and unidade_id = p_unidade_id and id != v_lead_id and arquivado = false) then
        v_telefone_safe := p_telefone;
      end if;
    end if;

    if p_source_type = 'emusys' then
      update leads set
        emusys_lead_id = coalesce(p_source_id, emusys_lead_id),
        nome = coalesce(nullif(p_nome, ''), nome),
        telefone = coalesce(v_telefone_safe, telefone),
        email = coalesce(nullif(p_email, ''), email),
        curso_interesse_id = coalesce(v_curso_id, curso_interesse_id),
        canal_origem_id = coalesce(v_canal_id, canal_origem_id),
        data_nascimento = coalesce(p_data_nascimento, data_nascimento),
        data_contato = coalesce(p_data_contato, data_contato),
        updated_at = now(), data_ultimo_contato = now()
      where id = v_lead_id;
    elsif p_source_type = 'nocodb' then
      update leads set
        nocodb_lead_id = coalesce(p_source_id, nocodb_lead_id),
        nome = coalesce(nullif(p_nome, ''), nome),
        telefone = coalesce(v_telefone_safe, telefone),
        email = coalesce(nullif(p_email, ''), email),
        curso_interesse_id = coalesce(v_curso_id, curso_interesse_id),
        canal_origem_id = coalesce(v_canal_id, canal_origem_id),
        data_nascimento = coalesce(p_data_nascimento, data_nascimento),
        data_contato = coalesce(p_data_contato, data_contato),
        updated_at = now(), data_ultimo_contato = now()
      where id = v_lead_id;
    elsif p_source_type = 'campanha' then
      update leads set updated_at = now(), data_ultimo_contato = now() where id = v_lead_id;
    end if;

    v_action := 'updated';
    insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
    return json_build_object('action', v_action, 'lead_id', v_lead_id);
  end if;

  -- 6. INSERT — telefone pode ser null; ON CONFLICT so dispara quando telefone nao e null
  if p_source_type = 'emusys' then
    insert into leads (nome, telefone, email, unidade_id, emusys_lead_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      emusys_lead_id = coalesce(excluded.emusys_lead_id, leads.emusys_lead_id),
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = coalesce(excluded.canal_origem_id, leads.canal_origem_id),
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  elsif p_source_type = 'nocodb' then
    insert into leads (nome, telefone, email, unidade_id, nocodb_lead_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      nocodb_lead_id = coalesce(excluded.nocodb_lead_id, leads.nocodb_lead_id),
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = coalesce(excluded.canal_origem_id, leads.canal_origem_id),
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  elsif p_source_type = 'campanha' then
    insert into leads (nome, telefone, email, unidade_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = coalesce(excluded.canal_origem_id, leads.canal_origem_id),
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  end if;

  v_action := 'created';
  insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
  values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
  return json_build_object('action', v_action, 'lead_id', v_lead_id);
end;
$function$;

revoke all on function public.upsert_lead(text, text, text, uuid, text, text, integer, text, boolean, date, date) from public;
revoke all on function public.upsert_lead(text, text, text, uuid, text, text, integer, text, boolean, date, date) from anon;
grant execute on function public.upsert_lead(text, text, text, uuid, text, text, integer, text, boolean, date, date) to authenticated;
grant execute on function public.upsert_lead(text, text, text, uuid, text, text, integer, text, boolean, date, date) to service_role;
