-- 19/09/2026: SONDA do porteiro — "quando o vigia quebra, ninguém avisa".
-- O porteiro do professor (20260919199000) vive em três coisas que um `alter
-- role` distraído, um restore ou outra sessão apagam sem barulho:
--   1. `authenticator` com `pgrst.db_pre_request = public.fn_porteiro_requisicao`;
--   2. `porteiro_config.modo = 'bloquear'`;
--   3. a lista sem rota embutível (nenhuma rota de TABELA e nenhuma RPC que
--      devolva tipo de tabela — foi assim que o porteiro foi contornado hoje).
-- A sonda roda de 6 em 6 horas e grava no MESMO lugar dos outros canários
-- (`fabio_canario_execucao`), então ela entra no ritmo que o
-- `fn_fabio_canarios_parados` vigia: se a própria sonda parar, o coletor do
-- diário abre ocorrência sozinho. E quando ela RODA e reprova, ela mesma abre a
-- ocorrência (`canario_de_escrita_falhou`, referência `porteiro_do_professor:…`),
-- que é o que o laudo das 7h já sabe mostrar.
--
-- Junto vai a trava que impede o furo de voltar pela porta da frente: a lista do
-- porteiro não aceita mais rota de tabela nem RPC embutível.

create or replace function public.fn_porteiro_rota_segura()
returns trigger
language plpgsql
as $$
declare
  v_nome text;
  v_embutivel boolean;
begin
  if new.rota !~ '^rpc/[a-z0-9_]+$' then
    raise exception 'rota_do_professor_tem_que_ser_rpc'
      using errcode = '22023',
            detail = 'rota de TABELA volta a abrir o embed do PostgREST (select=*,professores(*)), que o porteiro não enxerga: ' || new.rota;
  end if;
  v_nome := replace(new.rota, 'rpc/', '');
  select exists (
    select 1 from pg_proc p join pg_type t on t.oid = p.prorettype
     where p.pronamespace = 'public'::regnamespace and p.proname = v_nome
       and (t.typrelid <> 0 or t.typtype = 'c')
  ) into v_embutivel;
  if v_embutivel then
    raise exception 'rpc_devolve_tipo_de_tabela'
      using errcode = '22023',
            detail = 'função que devolve linha de tabela é embutível; devolva jsonb: ' || new.rota;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_porteiro_rota_segura on public.porteiro_rota_professor;
create trigger trg_porteiro_rota_segura
before insert or update on public.porteiro_rota_professor
for each row execute function public.fn_porteiro_rota_segura();

create or replace function public.fn_porteiro_sonda()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t0        timestamptz := clock_timestamp();
  v_pre       boolean;
  v_modo      text;
  v_tabelas   integer;
  v_embutivel integer;
  v_passou    boolean;
  v_motivos   text[] := '{}';
  v_detalhe   text;
  v_evid      jsonb;
begin
  v_pre := exists (
    select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
     where r.rolname = 'authenticator'
       and 'pgrst.db_pre_request=public.fn_porteiro_requisicao' = any (s.setconfig)
  );
  select modo into v_modo from public.porteiro_config where id;
  select count(*) into v_tabelas from public.porteiro_rota_professor where rota !~ '^rpc/';
  select count(*) into v_embutivel
    from public.porteiro_rota_professor r
    join pg_proc p on p.proname = replace(r.rota, 'rpc/', '') and p.pronamespace = 'public'::regnamespace
    join pg_type t on t.oid = p.prorettype
   where t.typrelid <> 0 or t.typtype = 'c';

  if not v_pre then v_motivos := v_motivos || 'pre_request_fora'::text; end if;
  if coalesce(v_modo, '') <> 'bloquear' then v_motivos := v_motivos || ('modo_' || coalesce(v_modo, 'ausente'))::text; end if;
  if v_tabelas > 0 then v_motivos := v_motivos || 'rota_de_tabela_na_lista'::text; end if;
  if v_embutivel > 0 then v_motivos := v_motivos || 'rpc_embutivel_na_lista'::text; end if;

  v_passou := array_length(v_motivos, 1) is null;
  v_detalhe := case when v_passou then 'porteiro no ar, bloqueando, sem rota embutível'
                    else 'PORTEIRO FURADO: ' || array_to_string(v_motivos, ', ') end;
  v_evid := jsonb_build_object('pre_request', v_pre, 'modo', v_modo,
              'rotas', (select count(*) from public.porteiro_rota_professor),
              'rotas_de_tabela', v_tabelas, 'rpcs_embutiveis', v_embutivel);

  insert into public.fabio_canario_execucao (nome, rodou_em, passou, detalhe, duracao_ms, evidencia)
  values ('porteiro_do_professor', now(), v_passou, v_detalhe,
          (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::integer, v_evid);

  if not v_passou and not exists (
       select 1 from public.fabio_diario_ocorrencia o
        where o.referencia = 'porteiro_do_professor:' || array_to_string(v_motivos, ',')
          and o.resolvido_em is null) then
    insert into public.fabio_diario_ocorrencia (origem, tipo, referencia, o_que, porque, gravidade, detectado_por, bruto)
    values ('claude', 'canario_de_escrita_falhou',
            'porteiro_do_professor:' || array_to_string(v_motivos, ','),
            'O porteiro do professor não está mais segurando',
            'sem ele, qualquer professor logado alcança as RPCs da equipe (financeiro, Health Score, conversas). Motivo: '
              || array_to_string(v_motivos, ', '),
            'alta', 'automatico', v_evid);
  end if;

  return jsonb_build_object('passou', v_passou, 'motivos', to_jsonb(v_motivos), 'evidencia', v_evid);
end;
$$;

revoke execute on function public.fn_porteiro_sonda() from public, anon, authenticated;
grant execute on function public.fn_porteiro_sonda() to service_role;

select cron.unschedule('porteiro-sonda') where exists (select 1 from cron.job where jobname = 'porteiro-sonda');
select cron.schedule('porteiro-sonda', '20 */6 * * *', $cron$select public.fn_porteiro_sonda();$cron$);
