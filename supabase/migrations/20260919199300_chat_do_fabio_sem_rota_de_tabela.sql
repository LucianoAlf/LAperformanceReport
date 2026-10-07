-- 19/09/2026 (revisão independente): o porteiro (20260919199000) era CONTORNÁVEL
-- por embed. A única rota de TABELA liberada ao professor era
-- `fabio_chat_mensagens`, e o PostgREST embute recurso pela QUERY STRING
-- (`select=*,professores(*)`), que o pre-request NÃO enxerga (não existe GUC de
-- query string). Provado ao vivo com as claims do professor 18:
--   fabio_chat_mensagens → professores → professores_unidades → unidades → …
-- e daí ~66 tabelas de unidade (todas com `SELECT to authenticated using (true)`),
-- chegando a 882 linhas de `lead_experimentais` (nome e telefone de lead).
--
-- O mesmo vale para FUNÇÃO que devolve TIPO DE TABELA: também é embutível. As
-- duas da lista nesse caso eram `app_minhas_preferencias_fabio` e
-- `app_atualizar_preferencia_fabio` (retornavam `fabio_professor_preferences`).
--
-- Conserto: o professor não tem mais NENHUMA rota de tabela nem função que
-- devolva linha de tabela. Tudo que ele chama devolve `jsonb` — e jsonb não
-- embute. O chat passa a ter duas RPCs (`app_fabio_chat_listar`,
-- `app_fabio_chat_enviar`), com o mesmo formato que o cliente já lia.
-- A troca na lista do porteiro está NESTA MESMA migration (tirar a tabela e pôr
-- as RPCs juntas — senão a tela quebra entre uma migration e outra).
--
-- O Realtime continua assinando a TABELA (é o que empurra a resposta do Fábio
-- sem polling) e NÃO passa pelo porteiro: ele é outro serviço. O que ele expõe
-- é o que a policy `fcm_professor_select` deixa — `professor_id =
-- fn_professor_do_usuario()`, ou seja, só as mensagens do próprio professor, uma
-- linha por INSERT, sem embed (o Realtime não faz embed). Por isso os GRANTs de
-- tabela continuam: sem SELECT o Realtime pararia de entregar.

create or replace function public.app_fabio_chat_listar(p_desde timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(m) order by m.criado_em)
      from (
        select c.id, c.professor_id, c.role, c.kind, c.content, c.media_url, c.channel, c.criado_em
          from public.fabio_chat_mensagens c
         where c.professor_id = v_prof
           and (p_desde is null or c.criado_em > p_desde)
      ) m
  ), '[]'::jsonb);
end;
$$;

create or replace function public.app_fabio_chat_enviar(p_texto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_row  jsonb;
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'texto_vazio' using errcode = '22023';
  end if;
  insert into public.fabio_chat_mensagens (professor_id, role, kind, channel, content)
  values (v_prof, 'professor', 'text', 'app', p_texto)
  returning to_jsonb(fabio_chat_mensagens) - 'media_mime' - 'media_filename' - 'media_extracted_text'
            - 'wa_message_id' - 'fabio_seen_at' - 'fabio_done_at' - 'identidade_tipo' - 'usuario_id'
    into v_row;
  return v_row;
end;
$$;

revoke execute on function public.app_fabio_chat_listar(timestamptz) from public, anon;
revoke execute on function public.app_fabio_chat_enviar(text) from public, anon;
grant execute on function public.app_fabio_chat_listar(timestamptz) to authenticated, service_role;
grant execute on function public.app_fabio_chat_enviar(text) to authenticated, service_role;

-- As preferências: mesmo corpo, retorno jsonb (o cliente já lia como objeto).
drop function if exists public.app_minhas_preferencias_fabio();
create function public.app_minhas_preferencias_fabio()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_row  public.fabio_professor_preferences;
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;
  insert into public.fabio_professor_preferences (professor_id)
  values (v_prof)
  on conflict (professor_id) do nothing;
  select * into v_row from public.fabio_professor_preferences where professor_id = v_prof;
  return to_jsonb(v_row);
end;
$$;

drop function if exists public.app_atualizar_preferencia_fabio(text, time without time zone, time without time zone, smallint[], date, boolean, boolean, text, boolean);
create function public.app_atualizar_preferencia_fabio(
  p_canal_preferido text default null,
  p_horario_silencio_inicio time without time zone default null,
  p_horario_silencio_fim time without time zone default null,
  p_dias_silencio smallint[] default null,
  p_pausa_ate date default null,
  p_limpar_pausa boolean default false,
  p_aceita_cobranca_pendencia boolean default null,
  p_tom_preferido text default null,
  p_recebe_domingo boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_row  public.fabio_professor_preferences;
begin
  if v_prof is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  insert into public.fabio_professor_preferences (professor_id)
  values (v_prof)
  on conflict (professor_id) do nothing;

  update public.fabio_professor_preferences set
    canal_preferido           = coalesce(p_canal_preferido, canal_preferido),
    horario_silencio_inicio   = coalesce(p_horario_silencio_inicio, horario_silencio_inicio),
    horario_silencio_fim      = coalesce(p_horario_silencio_fim, horario_silencio_fim),
    dias_silencio             = coalesce(p_dias_silencio, dias_silencio),
    pausa_ate                 = case when p_limpar_pausa then null else coalesce(p_pausa_ate, pausa_ate) end,
    aceita_cobranca_pendencia = coalesce(p_aceita_cobranca_pendencia, aceita_cobranca_pendencia),
    tom_preferido             = coalesce(p_tom_preferido, tom_preferido),
    recebe_domingo            = coalesce(p_recebe_domingo, recebe_domingo)
  where professor_id = v_prof
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.app_minhas_preferencias_fabio() from public, anon;
revoke execute on function public.app_atualizar_preferencia_fabio(text, time without time zone, time without time zone, smallint[], date, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.app_minhas_preferencias_fabio() to authenticated, service_role;
grant execute on function public.app_atualizar_preferencia_fabio(text, time without time zone, time without time zone, smallint[], date, boolean, boolean, text, boolean) to authenticated, service_role;

-- A lista do porteiro, na mesma transação: sai a tabela, entram as duas RPCs.
delete from public.porteiro_rota_professor where rota = 'fabio_chat_mensagens';
insert into public.porteiro_rota_professor (rota, metodos, origem) values
  ('rpc/app_fabio_chat_listar', array['GET','POST','HEAD'], 'la-teacher/src/features/fabio/chat.ts'),
  ('rpc/app_fabio_chat_enviar', array['POST'], 'la-teacher/src/features/fabio/chat.ts')
on conflict (rota) do update set metodos = excluded.metodos, origem = excluded.origem;
