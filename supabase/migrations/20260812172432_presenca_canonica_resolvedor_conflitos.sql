-- Presença canônica compartilhada: Emusys, LA Report, LA Teacher e Fábio
--
-- Uma linha operacional por aluno/aula continua em aluno_presenca. O raw do
-- Emusys é evidência própria da aula; decisões humanas e espelhamentos nunca
-- o sobrescrevem. "ausente" do Emusys permanece pendência, enquanto
-- "presente" fecha a chamada. Não existe escrita outbound no Emusys aqui.

alter table public.aluno_presenca
  add column if not exists emusys_presenca_bruta_anterior text,
  add column if not exists emusys_presenca_alterada_em timestamptz,
  add column if not exists espelhado_de_presenca_id uuid;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aluno_presenca_espelhado_de_presenca_id_fkey'
      and conrelid = 'public.aluno_presenca'::regclass
  ) then
    alter table public.aluno_presenca
      add constraint aluno_presenca_espelhado_de_presenca_id_fkey
      foreign key (espelhado_de_presenca_id)
      references public.aluno_presenca(id)
      on delete set null;
  end if;
end
$do$;

create index if not exists aluno_presenca_espelhado_de_presenca_id_idx
  on public.aluno_presenca(espelhado_de_presenca_id)
  where espelhado_de_presenca_id is not null;

comment on column public.aluno_presenca.emusys_presenca_bruta_anterior is
  'Último raw anterior recebido do Emusys quando o valor mudou; nunca é decisão humana.';
comment on column public.aluno_presenca.emusys_presenca_alterada_em is
  'Instante de observação da última alteração do raw do Emusys.';
comment on column public.aluno_presenca.espelhado_de_presenca_id is
  'Linha canônica irmã que originou a decisão espelhada; o raw desta aula continua próprio.';

create table if not exists public.aluno_presenca_conflitos (
  id uuid primary key default gen_random_uuid(),
  aluno_presenca_id uuid not null references public.aluno_presenca(id) on delete cascade,
  aluno_presenca_gemea_id uuid references public.aluno_presenca(id) on delete set null,
  chave text not null,
  tipo text not null,
  estado text not null default 'aberto'
    check (estado in ('aberto', 'resolvido', 'dispensado')),
  status_decisao text,
  origem_decisao text,
  status_contraparte text,
  origem_contraparte text,
  evidencia jsonb not null default '{}'::jsonb,
  detectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolucao text
);

alter table public.aluno_presenca_conflitos enable row level security;

create unique index if not exists aluno_presenca_conflitos_abertos_uniq
  on public.aluno_presenca_conflitos(aluno_presenca_id, chave)
  where estado = 'aberto';

create index if not exists aluno_presenca_conflitos_abertos_idx
  on public.aluno_presenca_conflitos(aluno_presenca_id, detectado_em desc)
  where estado = 'aberto';

comment on table public.aluno_presenca_conflitos is
  'Divergências abertas entre decisão humana, presença positiva do Emusys ou aula gêmea. Não substitui retificações nem eventos do Fábio.';

create or replace function public.fn_presenca_fecha_chamada(
  p_status_presenca text,
  p_respondido_por text
)
returns boolean
language sql
immutable
parallel safe
as $function$
  select coalesce(
    p_status_presenca in ('presente', 'falta', 'falta_justificada')
    and (
      public.fn_presenca_e_forte(p_respondido_por)
      or (p_respondido_por = 'emusys' and p_status_presenca = 'presente')
    ),
    false
  )
$function$;

comment on function public.fn_presenca_fecha_chamada(text, text) is
  'Resolvedor operacional: decisão humana terminal ou presença positiva explícita do Emusys fecha chamada; ausência bruta do Emusys não fecha.';

revoke all on function public.fn_presenca_fecha_chamada(text, text)
  from public, anon, authenticated;
grant execute on function public.fn_presenca_fecha_chamada(text, text)
  to service_role;

create or replace function public.fn_registrar_conflito_presenca(
  p_aluno_presenca_id uuid,
  p_aluno_presenca_gemea_id uuid,
  p_chave text,
  p_tipo text,
  p_status_decisao text,
  p_origem_decisao text,
  p_status_contraparte text,
  p_origem_contraparte text,
  p_evidencia jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_id uuid;
begin
  insert into public.aluno_presenca_conflitos (
    aluno_presenca_id,
    aluno_presenca_gemea_id,
    chave,
    tipo,
    status_decisao,
    origem_decisao,
    status_contraparte,
    origem_contraparte,
    evidencia
  ) values (
    p_aluno_presenca_id,
    p_aluno_presenca_gemea_id,
    p_chave,
    p_tipo,
    p_status_decisao,
    p_origem_decisao,
    p_status_contraparte,
    p_origem_contraparte,
    coalesce(p_evidencia, '{}'::jsonb)
  )
  on conflict (aluno_presenca_id, chave) where estado = 'aberto'
  do update set
    aluno_presenca_gemea_id = excluded.aluno_presenca_gemea_id,
    tipo = excluded.tipo,
    status_decisao = excluded.status_decisao,
    origem_decisao = excluded.origem_decisao,
    status_contraparte = excluded.status_contraparte,
    origem_contraparte = excluded.origem_contraparte,
    evidencia = excluded.evidencia,
    atualizado_em = now(),
    resolvido_em = null,
    resolucao = null
  returning id into v_id;

  return v_id;
end
$function$;

revoke all on function public.fn_registrar_conflito_presenca(
  uuid, uuid, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

-- O sync do Emusys preserva uma decisão humana, mas sempre atualiza o raw.
-- "presente -> ausente" automático deixa de ficar preso no presente: sem
-- decisão humana volta a pendente; com humano só registra conflito quando o
-- Emusys declara explicitamente presente contra uma falta humana.
create or replace function public.upsert_presenca_emusys_bruta(
  p_aluno_id integer,
  p_aula_emusys_id integer,
  p_professor_id integer,
  p_unidade_id uuid,
  p_data_aula date,
  p_horario_aula time without time zone,
  p_status_origem text,
  p_curso_nome text,
  p_turma_nome text,
  p_sala_nome text,
  p_sincronizado_em timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_id uuid;
  v_atual public.aluno_presenca%rowtype;
  v_raw text := lower(coalesce(nullif(btrim(p_status_origem), ''), 'ausente'));
  v_status text;
  v_status_presenca text;
  v_status_atual text;
  v_mudou_raw boolean;
begin
  if v_raw not in ('presente', 'ausente') then
    v_raw := 'ausente';
  end if;

  v_status := case when v_raw = 'presente' then 'presente' else 'ausente' end;
  v_status_presenca := case when v_raw = 'presente' then 'presente' else null end;

  select * into v_atual
    from public.aluno_presenca
   where aluno_id = p_aluno_id
     and aula_emusys_id = p_aula_emusys_id
   for update;

  if not found then
    insert into public.aluno_presenca (
      aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
      status, status_presenca, curso_nome, turma_nome, sala_nome,
      respondido_por, respondido_em, emusys_presenca_bruta,
      emusys_presenca_bruta_anterior, emusys_presenca_alterada_em,
      sincronizado_emusys_em, espelhado_de_presenca_id
    ) values (
      p_aluno_id, p_aula_emusys_id, p_professor_id, p_unidade_id, p_data_aula,
      p_horario_aula, v_status, v_status_presenca, p_curso_nome, p_turma_nome,
      p_sala_nome, 'emusys', null, v_raw, null, coalesce(p_sincronizado_em, now()),
      coalesce(p_sincronizado_em, now()), null
    ) returning id into v_id;
    return v_id;
  end if;

  v_id := v_atual.id;
  v_mudou_raw := v_atual.emusys_presenca_bruta is distinct from v_raw;
  v_status_atual := coalesce(
    v_atual.status_presenca,
    case v_atual.status when 'presente' then 'presente' when 'ausente' then 'falta' end
  );

  update public.aluno_presenca
     set professor_id = p_professor_id,
         unidade_id = p_unidade_id,
         data_aula = p_data_aula,
         horario_aula = p_horario_aula,
         curso_nome = p_curso_nome,
         turma_nome = p_turma_nome,
         sala_nome = p_sala_nome,
         emusys_presenca_bruta_anterior = case
           when v_mudou_raw then v_atual.emusys_presenca_bruta
           else aluno_presenca.emusys_presenca_bruta_anterior
         end,
         emusys_presenca_bruta = v_raw,
         emusys_presenca_alterada_em = case
           when v_mudou_raw then coalesce(p_sincronizado_em, now())
           else aluno_presenca.emusys_presenca_alterada_em
         end,
         sincronizado_emusys_em = coalesce(p_sincronizado_em, now())
   where id = v_id;

  if public.fn_presenca_e_forte(v_atual.respondido_por) then
    if v_raw = 'presente' and v_status_atual in ('falta', 'falta_justificada') then
      perform public.fn_registrar_conflito_presenca(
        v_id, null, 'emusys', 'decisao_humana_vs_emusys',
        v_status_atual, v_atual.respondido_por, 'presente', 'emusys',
        jsonb_build_object('raw_anterior', v_atual.emusys_presenca_bruta, 'raw_atual', v_raw)
      );
    else
      update public.aluno_presenca_conflitos
         set estado = 'resolvido', resolvido_em = now(),
             resolucao = 'raw_emusys_deixou_de_divergir', atualizado_em = now()
       where aluno_presenca_id = v_id and chave = 'emusys' and estado = 'aberto';
    end if;
    return v_id;
  end if;

  -- Uma presença positiva recebida pela aula irmã é terminal. O "ausente"
  -- próprio desta aula ainda é inconclusivo e, portanto, não pode apagá-la.
  if v_atual.espelhado_de_presenca_id is not null
     and v_raw = 'ausente'
     and public.fn_presenca_fecha_chamada(v_status_atual, v_atual.respondido_por) then
    return v_id;
  end if;

  update public.aluno_presenca
     set status = v_status,
         status_presenca = v_status_presenca,
         respondido_por = 'emusys',
         respondido_em = null,
         espelhado_de_presenca_id = null
   where id = v_id;

  update public.aluno_presenca_conflitos
     set estado = 'resolvido', resolvido_em = now(),
         resolucao = 'decisao_automatica_atualizada', atualizado_em = now()
   where aluno_presenca_id = v_id and chave = 'emusys' and estado = 'aberto';

  return v_id;
end
$function$;

revoke all on function public.upsert_presenca_emusys_bruta(
  integer, integer, integer, uuid, date, time without time zone,
  text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.upsert_presenca_emusys_bruta(
  integer, integer, integer, uuid, date, time without time zone,
  text, text, text, text, timestamptz
) to service_role;

-- Espelhamento entre turma e individual é para decisão humana explícita. O raw
-- do destino nunca é copiado: o sync do Emusys atualiza cada aula que ele
-- trouxe, e não pode cruzar evidências entre aulas gêmeas.
create or replace function public.fn_sincronizar_gemeos_presenca(
  p_aula_ancora_id integer default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_fonte record;
  v_gemeo public.aulas_emusys%rowtype;
  v_destino public.aluno_presenca%rowtype;
  v_status_fonte text;
  v_status_destino text;
  v_sincronizados integer := 0;
begin
  for v_fonte in
    select ap.*, ae.tipo as aula_tipo, ae.data_hora_inicio
      from public.aluno_presenca ap
      join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
     where ap.espelhado_de_presenca_id is null
       and (p_aula_ancora_id is null or ap.aula_emusys_id = p_aula_ancora_id)
       and public.fn_presenca_e_forte(ap.respondido_por)
       and public.fn_presenca_fecha_chamada(
         coalesce(ap.status_presenca,
           case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
         ap.respondido_por
       )
  loop
    v_status_fonte := coalesce(
      v_fonte.status_presenca,
      case v_fonte.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    );

    select i.* into v_gemeo
      from public.aulas_emusys i
      join public.aula_alunos_emusys ri
        on ri.aula_emusys_id = i.id and ri.aluno_id = v_fonte.aluno_id
     where i.tipo = case when v_fonte.aula_tipo = 'turma' then 'individual' else 'turma' end
       and i.unidade_id = v_fonte.unidade_id
       and i.data_hora_inicio = v_fonte.data_hora_inicio
       and i.professor_id is not distinct from v_fonte.professor_id
       and coalesce(i.cancelada, false) = false
     order by i.id
     limit 1;

    if not found then
      continue;
    end if;

    select * into v_destino
      from public.aluno_presenca
     where aluno_id = v_fonte.aluno_id and aula_emusys_id = v_gemeo.id
     for update;

    if not found then
      insert into public.aluno_presenca (
        aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
        status, status_presenca, curso_nome, turma_nome, sala_nome,
        respondido_por, respondido_em, espelhado_de_presenca_id
      ) values (
        v_fonte.aluno_id, v_gemeo.id, v_gemeo.professor_id, v_gemeo.unidade_id,
        v_gemeo.data_aula,
        (v_gemeo.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
        v_fonte.status, v_status_fonte, v_gemeo.curso_nome, v_gemeo.turma_nome,
        v_gemeo.sala_nome, v_fonte.respondido_por, v_fonte.respondido_em, v_fonte.id
      );
      v_sincronizados := v_sincronizados + 1;
      continue;
    end if;

    v_status_destino := coalesce(
      v_destino.status_presenca,
      case v_destino.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    );

    if v_destino.espelhado_de_presenca_id is null
       and public.fn_presenca_e_forte(v_destino.respondido_por) then
      if v_status_destino is distinct from v_status_fonte then
        perform public.fn_registrar_conflito_presenca(
          v_destino.id, v_fonte.id, 'gemeo:' || v_fonte.id::text,
          'decisoes_gemeas_divergentes', v_status_destino, v_destino.respondido_por,
          v_status_fonte, v_fonte.respondido_por,
          jsonb_build_object('aula_origem_id', v_fonte.aula_emusys_id, 'aula_destino_id', v_gemeo.id)
        );
      end if;
      continue;
    end if;

    if lower(coalesce(v_destino.emusys_presenca_bruta, '')) = 'presente'
       and v_status_fonte in ('falta', 'falta_justificada') then
      perform public.fn_registrar_conflito_presenca(
        v_destino.id, v_fonte.id, 'gemeo:' || v_fonte.id::text,
        'decisao_humana_vs_emusys', v_status_fonte, v_fonte.respondido_por,
        'presente', 'emusys',
        jsonb_build_object('aula_origem_id', v_fonte.aula_emusys_id, 'aula_destino_id', v_gemeo.id)
      );
      continue;
    end if;

    if v_destino.espelhado_de_presenca_id is not distinct from v_fonte.id
       and v_status_destino is not distinct from v_status_fonte
       and v_destino.respondido_por is not distinct from v_fonte.respondido_por then
      continue;
    end if;

    update public.aluno_presenca
       set status = v_fonte.status,
           status_presenca = v_status_fonte,
           respondido_por = v_fonte.respondido_por,
           respondido_em = v_fonte.respondido_em,
           espelhado_de_presenca_id = v_fonte.id
     where id = v_destino.id;
    v_sincronizados := v_sincronizados + 1;
  end loop;

  return v_sincronizados;
end
$function$;

revoke all on function public.fn_sincronizar_gemeos_presenca(integer)
  from public, anon, authenticated;

create or replace function public.trg_sincronizar_gemeos_presenca()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status_novo text;
begin
  v_status_novo := coalesce(
    new.status_presenca,
    case new.status when 'presente' then 'presente' when 'ausente' then 'falta' end
  );

  if new.espelhado_de_presenca_id is null
     and public.fn_presenca_e_forte(new.respondido_por)
     and public.fn_presenca_fecha_chamada(v_status_novo, new.respondido_por)
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.status_presenca is distinct from new.status_presenca
       or old.respondido_por is distinct from new.respondido_por
       or old.espelhado_de_presenca_id is distinct from new.espelhado_de_presenca_id
     ) then
    perform public.fn_sincronizar_gemeos_presenca(new.aula_emusys_id);
  end if;
  return new;
end
$function$;

drop trigger if exists trg_sincronizar_gemeos_presenca on public.aluno_presenca;
create trigger trg_sincronizar_gemeos_presenca
after insert or update of status, status_presenca, respondido_por, espelhado_de_presenca_id
on public.aluno_presenca
for each row execute function public.trg_sincronizar_gemeos_presenca();

revoke all on function public.trg_sincronizar_gemeos_presenca()
  from public, anon, authenticated;

-- A secretaria pode retirar a própria decisão sem apagar o raw do Emusys.
-- O registro continua sendo a linha canônica da aula; o resolvedor o devolve
-- para pendente quando só existe "ausente" bruto.
create or replace function public.app_registrar_chamada_agenda(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
  v_item jsonb;
  v_aula_id integer;
  v_aluno_id integer;
  v_status text;
  v_motivo text;
  v_evidencia text;
  v_existente public.aluno_presenca%rowtype;
  v_status_anterior text;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_retificados integer := 0;
  v_reabertos integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_humanos constant text[] := array[
    'professor_la_teacher', 'professor_whatsapp', 'manual', 'fabio_audio', 'agenda_secretaria'
  ];
begin
  select id into v_usuario_id
    from public.usuarios
   where auth_user_id = auth.uid() and coalesce(ativo, true)
   limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_aula_id := (v_item ->> 'aula_emusys_id')::integer;
    v_aluno_id := (v_item ->> 'aluno_id')::integer;
    v_status := v_item ->> 'status';
    v_motivo := nullif(btrim(coalesce(v_item ->> 'motivo', '')), '');
    v_evidencia := nullif(btrim(coalesce(v_item ->> 'evidencia_path', '')), '');

    select * into v_aula from public.aulas_emusys where id = v_aula_id;
    if not found then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'aula_emusys_id', v_aula_id, 'erro', 'aula_nao_encontrada');
      continue;
    end if;

    if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'sem_permissao_unidade');
      continue;
    end if;

    if coalesce(v_aula.cancelada, false) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'aula_cancelada');
      continue;
    end if;

    if v_status not in ('presente', 'falta', 'falta_justificada', 'indeterminado') then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'status_invalido');
      continue;
    end if;

    if v_status = 'falta_justificada' and (v_motivo is null or length(v_motivo) < 3) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'motivo_obrigatorio_justificada');
      continue;
    end if;

    if not exists (
      select 1 from public.aula_alunos_emusys r
       where r.aula_emusys_id = v_aula.id and r.aluno_id = v_aluno_id
    ) then
      v_erros := v_erros || jsonb_build_object('aluno_id', v_aluno_id, 'erro', 'aluno_fora_do_roster');
      continue;
    end if;

    select * into v_existente
      from public.aluno_presenca
     where aluno_id = v_aluno_id and aula_emusys_id = v_aula.id
     for update;

    if v_status = 'indeterminado' then
      if found then
        v_status_anterior := coalesce(
          v_existente.status_presenca,
          case v_existente.status when 'presente' then 'presente' when 'ausente' then 'falta' end
        );

        if v_existente.respondido_por = any(v_humanos) then
          insert into public.aluno_presenca_retificacoes (
            aluno_presenca_id, unidade_id, status_anterior, status_novo,
            respondido_por_anterior, respondido_em_anterior,
            motivo, autor_usuario_id, autor_auth_user_id
          ) values (
            v_existente.id, v_existente.unidade_id, v_status_anterior, 'indeterminado',
            v_existente.respondido_por, v_existente.respondido_em,
            v_motivo, v_usuario_id, auth.uid()
          );
          v_retificados := v_retificados + 1;
        end if;

        update public.aluno_presenca
           set status = case
                 when lower(coalesce(v_existente.emusys_presenca_bruta, '')) = 'presente' then 'presente'
                 when v_existente.emusys_presenca_bruta is not null then 'ausente'
                 else 'pendente'
               end,
               status_presenca = case
                 when lower(coalesce(v_existente.emusys_presenca_bruta, '')) = 'presente' then 'presente'
                 else null
               end,
               respondido_por = case
                 when v_existente.emusys_presenca_bruta is not null then 'emusys'
                 else 'sistema'
               end,
               respondido_em = null,
               espelhado_de_presenca_id = null
         where id = v_existente.id;
        v_reabertos := v_reabertos + 1;

        update public.aluno_presenca_conflitos
           set estado = 'resolvido', resolvido_em = now(),
               resolucao = 'decisao_humana_retirada', atualizado_em = now()
         where aluno_presenca_id = v_existente.id and estado = 'aberto';

        update public.aluno_presenca_administrativo
           set justificada = false, updated_at = now()
         where aluno_id = v_aluno_id and aula_emusys_id = v_aula.id;

        update public.aluno_reposicoes
           set status = 'cancelada', updated_at = now()
         where aluno_id = v_aluno_id and aula_origem_id = v_aula.id
           and origem = 'falta_justificada' and status = 'pendente';
      end if;
      continue;
    end if;

    if found then
      v_status_anterior := coalesce(
        v_existente.status_presenca,
        case v_existente.status when 'presente' then 'presente' when 'ausente' then 'falta' end
      );

      if v_status_anterior is not distinct from v_status
         and v_existente.respondido_por = 'agenda_secretaria'
         and v_existente.espelhado_de_presenca_id is null then
        continue;
      end if;

      if v_existente.respondido_por = any(v_humanos) then
        insert into public.aluno_presenca_retificacoes (
          aluno_presenca_id, unidade_id, status_anterior, status_novo,
          respondido_por_anterior, respondido_em_anterior,
          motivo, autor_usuario_id, autor_auth_user_id
        ) values (
          v_existente.id, v_existente.unidade_id, v_status_anterior, v_status,
          v_existente.respondido_por, v_existente.respondido_em,
          v_motivo, v_usuario_id, auth.uid()
        );
        v_retificados := v_retificados + 1;
      end if;

      update public.aluno_presenca
         set status = case when v_status = 'presente' then 'presente' else 'ausente' end,
             status_presenca = v_status,
             respondido_por = 'agenda_secretaria',
             respondido_em = now(),
             espelhado_de_presenca_id = null
       where id = v_existente.id;
      v_atualizados := v_atualizados + 1;

      if lower(coalesce(v_existente.emusys_presenca_bruta, '')) = 'presente'
         and v_status in ('falta', 'falta_justificada') then
        perform public.fn_registrar_conflito_presenca(
          v_existente.id, null, 'emusys', 'decisao_humana_vs_emusys',
          v_status, 'agenda_secretaria', 'presente', 'emusys',
          jsonb_build_object('via', 'agenda_secretaria')
        );
      else
        update public.aluno_presenca_conflitos
           set estado = 'resolvido', resolvido_em = now(),
               resolucao = 'decisao_secretaria_convergente', atualizado_em = now()
         where aluno_presenca_id = v_existente.id and chave = 'emusys' and estado = 'aberto';
      end if;
    else
      insert into public.aluno_presenca (
        aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
        status, status_presenca, curso_nome, turma_nome, sala_nome,
        respondido_por, respondido_em, espelhado_de_presenca_id
      ) values (
        v_aluno_id, v_aula.id, v_aula.professor_id, v_aula.unidade_id, v_aula.data_aula,
        (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
        case when v_status = 'presente' then 'presente' else 'ausente' end,
        v_status, v_aula.curso_nome, v_aula.turma_nome, v_aula.sala_nome,
        'agenda_secretaria', now(), null
      );
      v_inseridos := v_inseridos + 1;
    end if;

    if v_status = 'falta_justificada' then
      insert into public.aluno_presenca_administrativo (
        aluno_id, aula_emusys_id, unidade_id, justificada, fonte,
        motivo, evidencia_path, autor_usuario_id, autor_auth_user_id,
        sincronizado_em, updated_at
      ) values (
        v_aluno_id, v_aula.id, v_aula.unidade_id, true, 'agenda_secretaria',
        v_motivo, v_evidencia, v_usuario_id, auth.uid(), now(), now()
      )
      on conflict (aluno_id, aula_emusys_id) do update set
        justificada = true,
        fonte = 'agenda_secretaria',
        motivo = excluded.motivo,
        evidencia_path = coalesce(excluded.evidencia_path, aluno_presenca_administrativo.evidencia_path),
        autor_usuario_id = excluded.autor_usuario_id,
        autor_auth_user_id = excluded.autor_auth_user_id,
        updated_at = now();

      insert into public.aluno_reposicoes (unidade_id, aluno_id, aula_origem_id, origem, motivo, evidencia_path)
      values (v_aula.unidade_id, v_aluno_id, v_aula.id, 'falta_justificada', v_motivo, v_evidencia)
      on conflict (aluno_id, aula_origem_id, origem) do nothing;
    elsif v_status = 'falta' then
      update public.aluno_reposicoes
         set status = 'cancelada', updated_at = now()
       where aluno_id = v_aluno_id and aula_origem_id = v_aula.id
         and origem = 'falta_justificada' and status = 'pendente';

      update public.aluno_presenca_administrativo
         set justificada = false, updated_at = now()
       where aluno_id = v_aluno_id and aula_emusys_id = v_aula.id;
    end if;
  end loop;

  return jsonb_build_object(
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'retificados', v_retificados,
    'reabertos', v_reabertos,
    'removidos', 0,
    'erros', v_erros
  );
end
$function$;

revoke all on function public.app_registrar_chamada_agenda(jsonb) from public, anon;
grant execute on function public.app_registrar_chamada_agenda(jsonb) to authenticated;

-- Uma confirmação de chamada pelo WhatsApp só grava depois de revalidar a
-- ação pendente, o professor, a shortlist e a chave idempotente da mensagem.
-- A mesma transação registra o evento final; não há janela entre "gravou" e
-- "auditou".
create or replace function public.fabio_confirmar_chamada_acao(
  p_acao_id uuid,
  p_professor_id integer,
  p_wa_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_acao public.fabio_acoes_pendentes%rowtype;
  v_existente jsonb;
  v_resultado jsonb;
  v_escrita jsonb;
  v_aula_id integer;
  v_ausentes integer[];
begin
  select resultado into v_existente
    from public.fabio_acao_eventos
   where wa_message_id = p_wa_message_id;
  if v_existente is not null then
    return jsonb_build_object(
      'ok', true,
      'codigo', 'evento_existente',
      'resultado', v_existente
    );
  end if;

  select * into v_acao
    from public.fabio_acoes_pendentes
   where id = p_acao_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_encontrada');
  end if;
  if v_acao.professor_id is distinct from p_professor_id then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_pertence_ao_professor');
  end if;
  if v_acao.tipo <> 'confirmar_chamada' or v_acao.estado <> 'aberta' then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_confirmavel');
  end if;
  if v_acao.expira_em is not null and v_acao.expira_em < now() then
    update public.fabio_acoes_pendentes
       set estado = 'expirada', atualizado_em = now(), encerrado_em = now()
     where id = v_acao.id;
    return jsonb_build_object('ok', false, 'codigo', 'acao_expirada');
  end if;

  v_aula_id := v_acao.aula_id;
  if v_aula_id is null or not (v_aula_id = any(v_acao.candidatas))
     or not public.fabio_shortlist_valida(
       p_professor_id, 'chamada', array[v_aula_id], now()
     ) then
    return jsonb_build_object('ok', false, 'codigo', 'aula_fora_da_shortlist');
  end if;

  select coalesce(array_agg(value::integer), '{}'::integer[])
    into v_ausentes
    from jsonb_array_elements_text(coalesce(v_acao.payload -> 'alunos_ausentes', '[]'::jsonb));

  v_escrita := public.fabio_registrar_presencas_aula(
    p_professor_id, v_aula_id, v_ausentes
  );

  update public.fabio_acoes_pendentes
     set estado = 'resolvida',
         ultima_resposta_wa_id = p_wa_message_id,
         atualizado_em = now(),
         encerrado_em = now()
   where id = v_acao.id;

  v_resultado := jsonb_build_object(
    'ok', true,
    'codigo', 'chamada_confirmada',
    'acao', public.fabio_acao_json(v_acao.id),
    'escrita', v_escrita
  );

  insert into public.fabio_acao_eventos(acao_id, wa_message_id, evento, resultado)
  values (v_acao.id, p_wa_message_id, 'confirmado', v_resultado);

  return v_resultado;
end
$function$;

revoke all on function public.fabio_confirmar_chamada_acao(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.fabio_confirmar_chamada_acao(uuid, integer, text)
  to service_role;

-- A agenda e as candidatas do Fábio usam exatamente o mesmo resolvedor. Uma
-- presença "Emusys" positiva deixa de aparecer como pendência nos dois lados.
create or replace function public.app_minha_agenda_sessao(p_data date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
begin
  if v_professor_id is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;

  return coalesce((
    with aulas_dia as (
      select ae.*
        from public.aulas_emusys ae
       where ae.professor_id = v_professor_id
         and ae.data_aula = p_data
         and coalesce(ae.cancelada, false) = false
    ), slots as (
      select data_hora_inicio, data_hora_fim,
             (array_agg(id order by case when tipo = 'turma' then 0 else 1 end, id))[1] as aula_id_ancora
        from aulas_dia
       group by data_hora_inicio, data_hora_fim
    ), ancoras as (
      select ae.*
        from slots s
        join aulas_dia ae on ae.id = s.aula_id_ancora
    )
    select jsonb_agg(jsonb_build_object(
      'aula_id_ancora', ae.id,
      'hora', to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'hora_fim', to_char(ae.data_hora_fim at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'data_hora_inicio', ae.data_hora_inicio,
      'data_hora_fim', ae.data_hora_fim,
      'curso', ae.curso_nome,
      'turma_nome', ae.turma_nome,
      'tipo', ae.tipo,
      'n_alunos', coalesce(roster.n_alunos, 0),
      'n_registradas', coalesce(roster.n_registradas, 0),
      'tem_registro', coalesce(roster.tem_registro, false),
      'tem_rascunho', coalesce(roster.tem_rascunho, false),
      'roster_incompleto', coalesce(roster.n_sem_vinculo, 0) > 0,
      'alunos', coalesce(roster.alunos, '[]'::jsonb),
      'experimental', ae.categoria = 'experimental',
      'vinculo_id', (
        select v.id from public.lead_experimental_aulas v
         where v.aula_local_id = ae.id and v.cancelado_em is null
         order by v.id desc limit 1
      ),
      'experimental_nome', (
        select le.nome_aluno
          from public.lead_experimental_aulas v
          join public.lead_experimentais le on le.id = v.lead_experimental_id
         where v.aula_local_id = ae.id and v.cancelado_em is null
         order by v.id desc limit 1
      )
    ) order by ae.data_hora_inicio, ae.id)
      from ancoras ae
      left join lateral (
        select
          count(*) as n_alunos,
          count(distinct ap.aluno_id) filter (
            where public.fn_presenca_fecha_chamada(
              coalesce(ap.status_presenca,
                case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
              ap.respondido_por
            )
          ) as n_registradas,
          count(*) filter (where r.aluno_id is null) as n_sem_vinculo,
          bool_or(nullif(btrim(coalesce(aula_alvo.anotacoes_fabio, '')), '') is not null) as tem_registro,
          bool_or(rascunho.id is not null) as tem_rascunho,
          jsonb_agg(jsonb_build_object(
            'aluno_id', r.aluno_id,
            'nome', r.aluno_nome,
            'aula_id_alvo', coalesce(aula_alvo.id, ae.id),
            'presenca', coalesce(
              ap.status_presenca,
              case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end,
              'a_confirmar'
            ),
            'tem_presenca_registrada', ap.id is not null and public.fn_presenca_fecha_chamada(
              coalesce(ap.status_presenca,
                case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
              ap.respondido_por
            ),
            'origem_presenca', ap.respondido_por,
            'tem_conflito_presenca', exists (
              select 1 from public.aluno_presenca_conflitos c
               where c.aluno_presenca_id = ap.id and c.estado = 'aberto'
            ),
            'tem_registro', nullif(btrim(coalesce(aula_alvo.anotacoes_fabio, '')), '') is not null,
            'tem_rascunho', rascunho.id is not null,
            'justificada', coalesce(adm.justificada, false)
          ) order by r.aluno_nome) as alunos
        from public.aula_alunos_emusys r
        left join public.aluno_presenca ap
          on ap.aula_emusys_id = ae.id and ap.aluno_id = r.aluno_id
        left join public.aluno_presenca_administrativo adm
          on adm.aula_emusys_id = ae.id and adm.aluno_id = r.aluno_id
        left join lateral (
          select alvo.id, alvo.anotacoes_fabio
            from public.aulas_emusys alvo
            join public.aula_alunos_emusys alvo_roster
              on alvo_roster.aula_emusys_id = alvo.id
             and alvo_roster.aluno_id = r.aluno_id
           where alvo.professor_id = v_professor_id
             and alvo.data_aula = p_data
             and alvo.data_hora_inicio = ae.data_hora_inicio
             and alvo.data_hora_fim is not distinct from ae.data_hora_fim
             and coalesce(alvo.cancelada, false) = false
             and coalesce(alvo.tipo, '') <> 'turma'
           order by alvo.id
           limit 1
        ) aula_individual on true
        left join public.aulas_emusys aula_alvo
          on aula_alvo.id = coalesce(aula_individual.id, ae.id)
        left join lateral (
          select rasc.id
            from public.fabio_registros_aula rasc
           where rasc.professor_id = v_professor_id
             and rasc.status = 'aguardando_confirmacao'
             and (
               (rasc.parent_id is null and rasc.aluno_id is null and rasc.aula_id = ae.id)
               or (rasc.parent_id is null and rasc.aluno_id = r.aluno_id
                   and rasc.aula_id = coalesce(aula_individual.id, ae.id))
               or (rasc.parent_id is not null and rasc.aluno_id = r.aluno_id
                   and exists (
                     select 1 from public.fabio_registros_aula tronco
                      where tronco.id = rasc.parent_id
                        and tronco.aula_id = ae.id
                        and tronco.professor_id = v_professor_id
                   ))
             )
           order by rasc.criado_em, rasc.id
           limit 1
        ) rascunho on true
       where r.aula_emusys_id = ae.id
      ) roster on true
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.app_minha_agenda_sessao(date) from public, anon;
grant execute on function public.app_minha_agenda_sessao(date) to authenticated;

create or replace view public.vw_presenca_pendencia as
select
  ae.unidade_id,
  u.nome as unidade_nome,
  ae.professor_id,
  p.nome as professor_nome,
  ae.id as aula_id,
  ae.tipo,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
  ae.curso_nome,
  ae.turma_nome,
  r.aluno_id,
  al.nome as aluno_nome,
  split_part(btrim(al.nome), ' ', 1) as aluno_primeiro_nome,
  coalesce(adm.justificada, false) as justificada,
  floor(extract(epoch from (now() - ae.data_hora_fim)) / 86400)::integer as dias_em_atraso
from public.aulas_emusys ae
join public.aula_alunos_emusys r
  on r.aula_emusys_id = ae.id and r.aluno_id is not null
join public.alunos al on al.id = r.aluno_id
join public.unidades u on u.id = ae.unidade_id
left join public.professores p on p.id = ae.professor_id
left join public.aluno_presenca_administrativo adm
  on adm.aula_emusys_id = ae.id and adm.aluno_id = r.aluno_id
where coalesce(ae.cancelada, false) = false
  and ae.professor_id is not null
  and ae.data_hora_fim < now()
  and ae.data_aula >= current_date - 45
  and (
    ae.tipo = 'turma'
    or not exists (
      select 1 from public.aulas_emusys t
       where t.tipo = 'turma'
         and t.unidade_id = ae.unidade_id
         and t.data_hora_inicio = ae.data_hora_inicio
         and t.professor_id is not distinct from ae.professor_id
         and coalesce(t.cancelada, false) = false
    )
  )
  and not exists (
    select 1 from public.aluno_presenca ap
     where ap.aula_emusys_id = ae.id
       and ap.aluno_id = r.aluno_id
       and public.fn_presenca_fecha_chamada(
         coalesce(ap.status_presenca,
           case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
         ap.respondido_por
       )
  );

create or replace function public.fabio_aulas_candidatas(
  p_professor_id integer,
  p_fluxo text,
  p_referencia timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_candidatas jsonb;
begin
  if p_fluxo not in ('registro', 'chamada') then
    return jsonb_build_object('ok', false, 'codigo', 'fluxo_invalido', 'candidatas', '[]'::jsonb);
  end if;
  if not exists (select 1 from public.professores p where p.id = p_professor_id) then
    return jsonb_build_object('ok', false, 'codigo', 'professor_nao_encontrado', 'candidatas', '[]'::jsonb);
  end if;

  if p_fluxo = 'registro' then
    with passado as (
      select
        v.aula_ancora_id as aula_id,
        max(v.data_aula) as data_aula,
        max(v.data_hora_inicio) as data_hora_inicio,
        max(v.curso_nome) as curso,
        max(v.turma_nome) as turma,
        max(v.tipo) as tipo,
        max(v.dias_em_atraso) as dias_em_atraso,
        jsonb_agg(distinct jsonb_build_object(
          'aluno_id', v.aluno_id,
          'nome', v.aluno_nome,
          'aula_alvo_id', v.aula_alvo_id
        ) order by jsonb_build_object(
          'aluno_id', v.aluno_id,
          'nome', v.aluno_nome,
          'aula_alvo_id', v.aula_alvo_id
        )) as alunos
      from public.vw_registro_pendencia v
      where v.professor_id = p_professor_id
        and v.data_hora_fim <= p_referencia
        and v.data_hora_fim >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval
      group by v.aula_ancora_id
    ), futuro as (
      select
        ae.id as aula_id,
        ae.data_aula,
        ae.data_hora_inicio,
        ae.curso_nome as curso,
        ae.turma_nome as turma,
        ae.tipo,
        0 as dias_em_atraso,
        jsonb_agg(jsonb_build_object(
          'aluno_id', r.aluno_id,
          'nome', al.nome,
          'aula_alvo_id', ae.id
        ) order by al.nome) as alunos
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
      join public.alunos al on al.id = r.aluno_id
      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio > p_referencia
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and nullif(btrim(coalesce(ae.anotacoes_fabio, '')), '') is null
      group by ae.id, ae.data_aula, ae.data_hora_inicio, ae.curso_nome, ae.turma_nome, ae.tipo
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'aula_id', x.aula_id,
      'data', x.data_aula,
      'hora', to_char(x.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'curso', x.curso,
      'turma', x.turma,
      'tipo', x.tipo,
      'dias_em_atraso', x.dias_em_atraso,
      'alunos', x.alunos
    ) order by x.data_hora_inicio desc), '[]'::jsonb)
      into v_candidatas
    from (select * from passado union all select * from futuro) x;
  else
    with roster as (
      select
        ae.id as aula_id,
        ae.data_aula,
        ae.data_hora_inicio,
        ae.curso_nome as curso,
        ae.turma_nome as turma,
        ae.tipo,
        r.aluno_id,
        al.nome,
        not exists (
          select 1
          from public.aulas_emusys gem
          join public.aluno_presenca ap
            on ap.aula_emusys_id = gem.id
           and ap.aluno_id = r.aluno_id
          where gem.unidade_id = ae.unidade_id
            and gem.data_hora_inicio = ae.data_hora_inicio
            and gem.professor_id is not distinct from ae.professor_id
            and coalesce(gem.cancelada, false) = false
            and public.fn_presenca_fecha_chamada(
              coalesce(ap.status_presenca,
                case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
              ap.respondido_por
            )
        ) as sem_presenca_fechada
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id and r.aluno_id is not null
      join public.alunos al on al.id = r.aluno_id
      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and coalesce(ae.data_hora_fim, ae.data_hora_inicio) >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval
    ), por_aula as (
      select aula_id, max(data_aula) as data_aula, max(data_hora_inicio) as data_hora_inicio,
             max(curso) as curso, max(turma) as turma, max(tipo) as tipo,
             jsonb_agg(jsonb_build_object('aluno_id', aluno_id, 'nome', nome)
                       order by nome) filter (where sem_presenca_fechada) as alunos,
             count(*) filter (where sem_presenca_fechada) as faltantes
      from roster group by aula_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'aula_id', aula_id,
      'data', data_aula,
      'hora', to_char(data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'curso', curso,
      'turma', turma,
      'tipo', tipo,
      -- Mantém a chave pública existente; a régua por trás dela agora é o
      -- resolvedor canônico, não só origem humana.
      'alunos_sem_presenca_forte', coalesce(alunos, '[]'::jsonb)
    ) order by data_hora_inicio desc), '[]'::jsonb)
      into v_candidatas
    from por_aula where faltantes > 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'codigo', 'candidatas_prontas',
    'professor_id', p_professor_id,
    'fluxo', p_fluxo,
    'candidatas', coalesce(v_candidatas, '[]'::jsonb)
  );
end
$function$;

revoke all on function public.fabio_aulas_candidatas(integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fabio_aulas_candidatas(integer, text, timestamptz)
  to service_role;
