-- origem da escrita: GUC confiavel > header (whitelist) > presenca de JWT
create or replace function public.fn_evento_origem_escrita()
returns text language plpgsql stable
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_headers text;
  v_header  text;
  v_guc     text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '');
    if v_headers is not null and v_headers <> '' then
      v_header := v_headers::jsonb ->> 'x-origem-escrita';
    end if;
    v_guc := nullif(current_setting('app.origem_escrita', true), '');
  exception when others then
    v_header := null;
    v_guc    := null;
  end;

  -- GUC so existe dentro de RPC (set_config com is_local=true): aceita o vocabulario inteiro
  if v_guc in ('la_teacher', 'familia', 'planilha', 'sistema', 'la_report', 'sol') then
    return v_guc;
  end if;
  -- header e forjavel: so quem poderia ser outro sistema. 'familia' daqui seria confirmacao
  -- de familia falsificada — nunca entra.
  if v_header in ('la_report', 'planilha') then
    return v_header;
  end if;
  return case when auth.uid() is not null then 'la_report' else 'sistema' end;
end;
$$;
-- NAO revogar de authenticated: fn_evento_participacao_confirmado_em e
-- fn_evento_comunicacao_deriva rodam como INVOKER e a chamam — revogar quebraria
-- toda confirmacao e todo convite. A funcao so le settings; e inofensiva.
revoke all on function public.fn_evento_origem_escrita() from public, anon;
grant execute on function public.fn_evento_origem_escrita() to authenticated, service_role;

-- igual ao fn_audit_log de movimentacoes_admin, mas com origem por canal e
-- ignorando colunas tecnicas no diff
create or replace function public.fn_evento_audit_log()
returns trigger language plpgsql security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_auth_uid uuid;
  v_usuario  text;
  v_old      jsonb;
  v_new      jsonb;
  v_reg_id   text;
  v_claims   text;
  -- carimbos de maquina: um update que so toca neles nao e evento auditavel
  -- (o cron do Drive re-carimba drive_sincronizado_em a cada rodada).
  c_ignoradas constant text[] := array[
    'updated_at',
    'drive_sincronizado_em', 'drive_erro', 'drive_playback_path', 'drive_file_id'];
begin
  begin
    v_claims := current_setting('request.jwt.claims', true);
    if v_claims is not null and v_claims <> '' then
      v_usuario := v_claims::jsonb ->> 'email';
      declare v_sub text;
      begin
        v_sub := v_claims::jsonb ->> 'sub';
        if v_sub ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_auth_uid := v_sub::uuid;
        end if;
      end;
    end if;
  exception when others then
    v_auth_uid := null;
    v_usuario  := null;
  end;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and (v_old - c_ignoradas) = (v_new - c_ignoradas) then
    return new;
  end if;

  -- registro_id: 'id' quando a tabela tem; nas de PK composta (ponte convidado×aluno,
  -- check-in por bloco, preco por evento) a PK inteira vira o identificador — new.id
  -- direto quebraria todo insert nelas.
  declare v_row jsonb;
  begin
    v_row := case when tg_op = 'DELETE' then v_old else v_new end;
    if v_row ? 'id' then
      v_reg_id := v_row ->> 'id';
    else
      select string_agg(v_row ->> a.attname, '|' order by a.attnum)
        into v_reg_id
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = tg_relid and i.indisprimary;
    end if;
  end;

  begin
    insert into public.audit_log
      (id, tabela, registro_id_text, acao, dados_antigos, dados_novos, usuario, auth_user_id, origem, created_at)
    values
      (gen_random_uuid(), tg_table_name, v_reg_id, tg_op, v_old, v_new,
       coalesce(v_usuario, 'system'), v_auth_uid, public.fn_evento_origem_escrita(), now());
  exception when others then
    raise warning '[audit_evento] falhou ao registrar %.%: %', tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;
revoke all on function public.fn_evento_audit_log() from public, anon, authenticated;

create trigger trg_audit_evento
  after insert or update or delete on public.evento
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_bloco
  after insert or update or delete on public.evento_bloco
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_apresentacao
  after insert or update or delete on public.evento_apresentacao
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_apresentacao_item
  after insert or update or delete on public.evento_apresentacao_item
  for each row execute function public.fn_evento_audit_log();
create trigger trg_audit_evento_participacao
  after insert or update or delete on public.evento_participacao
  for each row execute function public.fn_evento_audit_log();

-- quem carimbou o 'participa': familia ou equipe
alter table public.evento_participacao
  add column if not exists confirmado_origem text
  check (confirmado_origem in ('familia', 'equipe'));
comment on column public.evento_participacao.confirmado_origem is
  'Quem marcou participa: familia (canal da familia) ou equipe (coordenacao/planilha). '
  'Sem ele, o professor nao distingue confirmacao real de marcacao administrativa.';

-- backfill honesto: os 263 da Barra foram marcados pela equipe em lote
update public.evento_participacao
   set confirmado_origem = 'equipe'
 where confirmado_em is not null and confirmado_origem is null;

-- o trigger de confirmado_em passa a carimbar a origem junto
create or replace function public.fn_evento_participacao_confirmado_em()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' and new.status = 'participa' then
    new.confirmado_em     := coalesce(new.confirmado_em, now());
    new.confirmado_origem := coalesce(
      new.confirmado_origem,
      case when public.fn_evento_origem_escrita() = 'familia' then 'familia' else 'equipe' end);
  elsif tg_op = 'UPDATE'
        and new.status = 'participa'
        and old.status is distinct from 'participa' then
    new.confirmado_em     := now();
    new.confirmado_origem := case
      when public.fn_evento_origem_escrita() = 'familia' then 'familia' else 'equipe' end;
  end if;
  return new;
end;
$$;
