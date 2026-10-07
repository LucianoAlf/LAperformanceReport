-- 19/09/2026 (revisão independente, 3ª camada): o **Realtime** não passa pelo
-- porteiro de requisição — ele é outro serviço. O que ele entrega é decidido só
-- pela RLS. E a publicação `supabase_realtime` tem tabelas cuja policy de
-- leitura para `authenticated` é literalmente `true`: qualquer professor logado
-- abria um canal e recebia AO VIVO cada linha nova de conversa de lead/família,
-- campanha e afins. Medido com as claims do professor 18 (conta como
-- authenticated): campanha_contatos 10.040, mensagens_campanha 11.306,
-- conversas_campanha 2.536, inventario_pendencias 35, pesquisa_evasao 146 — e
-- crm_conversas/crm_mensagens/crm_mensagens_agendadas/bi_messages_lamusic hoje
-- vazias, mas abertas para tudo que entrar (é exatamente por onde chega a
-- conversa de WhatsApp do lead).
--
-- Conserto sem tirar ninguém do Realtime (a caixa de entrada do LA Report vive
-- desses canais): o predicado continua o MESMO, só ganha "e quem pergunta não é
-- professor". Equipe (admin/unidade) e papéis de agente (mila/sol, sem
-- auth.uid()) não mudam de comportamento — conferido tabela a tabela com JWT
-- simulado antes e depois.
--
-- `(select public.fn_usuario_e_professor())` entre parênteses de propósito: sem
-- o subselect o planner chama a função por LINHA; com ele, uma vez por consulta
-- (InitPlan).
--
-- pesquisa_evasao entrou junto: `fn_pesquisa_evasao_usuario_interno_ativo()`
-- considera QUALQUER usuário ativo, então o professor via as 146 respostas de
-- pesquisa de evasão de famílias.
--
-- Tabelas do LA Report: espelhar no repositório de lá (prompt entregue).

create or replace function public.fn_usuario_e_professor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
     where u.auth_user_id = auth.uid()
       and u.perfil = 'professor'
       and coalesce(u.ativo, true)
  );
$$;

grant execute on function public.fn_usuario_e_professor() to public, anon, authenticated, service_role;

-- ── CRM (conversa de lead/família) ──────────────────────────────────────────
alter policy crm_conversas_select on public.crm_conversas using (true and not (select public.fn_usuario_e_professor()));
alter policy crm_conversas_update on public.crm_conversas using (true and not (select public.fn_usuario_e_professor()));
alter policy crm_conversas_delete on public.crm_conversas using (true and not (select public.fn_usuario_e_professor()));
alter policy crm_conversas_insert on public.crm_conversas with check (true and not (select public.fn_usuario_e_professor()));

alter policy crm_mensagens_select on public.crm_mensagens using (true and not (select public.fn_usuario_e_professor()));
alter policy crm_mensagens_update on public.crm_mensagens using (true and not (select public.fn_usuario_e_professor()));
alter policy crm_mensagens_delete on public.crm_mensagens using (true and not (select public.fn_usuario_e_professor()));
alter policy crm_mensagens_insert on public.crm_mensagens with check (true and not (select public.fn_usuario_e_professor()));

alter policy "Authenticated users can manage scheduled messages" on public.crm_mensagens_agendadas
  using (true and not (select public.fn_usuario_e_professor()))
  with check (true and not (select public.fn_usuario_e_professor()));

-- ── Campanhas (contato, conversa e mensagem) ────────────────────────────────
alter policy campanha_contatos_all on public.campanha_contatos
  using (true and not (select public.fn_usuario_e_professor()))
  with check (true and not (select public.fn_usuario_e_professor()));

alter policy conversas_campanha_all on public.conversas_campanha
  using (true and not (select public.fn_usuario_e_professor()))
  with check (true and not (select public.fn_usuario_e_professor()));

alter policy mensagens_campanha_all on public.mensagens_campanha
  using (true and not (select public.fn_usuario_e_professor()))
  with check (true and not (select public.fn_usuario_e_professor()));

-- ── BI (conversa do agente com a auditoria) ─────────────────────────────────
alter policy bi_msg_select on public.bi_messages_lamusic using (true and not (select public.fn_usuario_e_professor()));
alter policy bi_msg_update on public.bi_messages_lamusic using (true and not (select public.fn_usuario_e_professor()));
alter policy bi_msg_insert on public.bi_messages_lamusic with check (true and not (select public.fn_usuario_e_professor()));

-- ── Inventário (pendência de sala) ──────────────────────────────────────────
alter policy rls_inventario_pendencias_roles_internos on public.inventario_pendencias
  using (true and not (select public.fn_usuario_e_professor()))
  with check (true and not (select public.fn_usuario_e_professor()));

-- ── Pesquisa de evasão (resposta de família) ────────────────────────────────
alter policy pesquisa_evasao_leitura_interna on public.pesquisa_evasao
  using (fn_pesquisa_evasao_usuario_interno_ativo() and not (select public.fn_usuario_e_professor()));

-- ── A sonda passa a vigiar esta classe também ───────────────────────────────
-- Regra: nenhuma tabela da publicação `supabase_realtime` pode ter policy
-- permissiva de leitura (SELECT/ALL) valendo para `authenticated`/`public` com
-- predicado em branco (`true` ou ausente). Predicado que fala de quem pergunta
-- (auth.uid, auth.email, fn_professor_do_usuario, fn_usuario_e_professor,
-- auth.role) está ok; `true` puro, não.
create or replace function public.fn_realtime_aberto_ao_professor()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct t.tablename order by t.tablename), '{}'::text[])
    from pg_publication_tables t
    join pg_policies p
      on p.schemaname = t.schemaname and p.tablename = t.tablename
   where t.pubname = 'supabase_realtime'
     and t.schemaname = 'public'
     and p.permissive = 'PERMISSIVE'
     and p.cmd in ('ALL', 'SELECT')
     and (p.roles @> array['authenticated']::name[] or p.roles @> array['public']::name[])
     and coalesce(p.qual, 'true') !~ '(auth\.uid|auth\.email|auth\.role|request\.jwt|fn_professor_do_usuario|fn_usuario_e_professor|get_unidade_usuario|is_admin)';
$$;

revoke execute on function public.fn_realtime_aberto_ao_professor() from public, anon, authenticated;
grant execute on function public.fn_realtime_aberto_ao_professor() to service_role;

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
  v_realtime  text[];
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
  v_realtime := public.fn_realtime_aberto_ao_professor();

  if not v_pre then v_motivos := v_motivos || 'pre_request_fora'::text; end if;
  if coalesce(v_modo, '') <> 'bloquear' then v_motivos := v_motivos || ('modo_' || coalesce(v_modo, 'ausente'))::text; end if;
  if v_tabelas > 0 then v_motivos := v_motivos || 'rota_de_tabela_na_lista'::text; end if;
  if v_embutivel > 0 then v_motivos := v_motivos || 'rpc_embutivel_na_lista'::text; end if;
  if array_length(v_realtime, 1) is not null then
    v_motivos := v_motivos || ('realtime_aberto:' || array_to_string(v_realtime, '+'))::text;
  end if;

  v_passou := array_length(v_motivos, 1) is null;
  v_detalhe := case when v_passou then 'porteiro no ar, bloqueando, sem rota embutível, realtime fechado ao professor'
                    else 'PORTEIRO FURADO: ' || array_to_string(v_motivos, ', ') end;
  v_evid := jsonb_build_object('pre_request', v_pre, 'modo', v_modo,
              'rotas', (select count(*) from public.porteiro_rota_professor),
              'rotas_de_tabela', v_tabelas, 'rpcs_embutiveis', v_embutivel,
              'realtime_aberto', to_jsonb(v_realtime));

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
            'sem ele, qualquer professor logado alcança as RPCs da equipe (financeiro, Health Score, conversas) ou recebe as tabelas do Realtime ao vivo. Motivo: '
              || array_to_string(v_motivos, ', '),
            'alta', 'automatico', v_evid);
  end if;

  return jsonb_build_object('passou', v_passou, 'motivos', to_jsonb(v_motivos), 'evidencia', v_evid);
end;
$$;

revoke execute on function public.fn_porteiro_sonda() from public, anon, authenticated;
grant execute on function public.fn_porteiro_sonda() to service_role;
