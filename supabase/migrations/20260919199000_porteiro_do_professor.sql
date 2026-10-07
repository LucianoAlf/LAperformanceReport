-- 19/09/2026: PORTEIRO CENTRAL do professor no PostgREST.
--
-- Por que: professor do LA Teacher e equipe do LA Report logam como o MESMO
-- papel (authenticated) no mesmo projeto. Fechar função por função (195000,
-- 196000, 198000) não fecha as ~100 RPCs que o site da equipe usa e que não
-- conferem quem chama (financeiro, Health Score de todos, conversas, 360...).
-- O porteiro inverte a lógica PARA O PROFESSOR: ele só passa nas rotas que o
-- app dele usa. Equipe (admin/unidade), service_role, anon e agentes: intocados.
--
-- Como: PostgREST chama public.fn_porteiro_requisicao() antes de CADA requisição
-- (pgrst.db_pre_request), com request.path ('/rpc/<nome>' ou '/<tabela>'),
-- request.method e o JWT em request.jwt.claims.
--   · role do JWT <> authenticated  → passa (sem consulta nenhuma)
--   · usuarios.perfil <> 'professor' → passa (uma busca pelo índice único auth_user_id)
--   · rota em porteiro_rota_professor com o método → passa (busca pela PK)
--   · senão: modo 'observar' grava em porteiro_recusa e deixa passar;
--            modo 'bloquear' faz RAISE LOG e recusa com 42501 ACESSO_NEGADO_PROFESSOR.
-- Por que dois modos: um RAISE desfaz o INSERT do registro (a transação da
-- requisição aborta; sem dblink/pg_background não há transação autônoma). Então
-- sobe OBSERVANDO (a recusa fica na tabela), confere-se o app real, e só aí vira
-- 'bloquear' — onde o registro passa a ser o RAISE LOG no log do Postgres.
-- Erro inesperado dentro do porteiro = deixa passar (não derruba o site da equipe
-- nem os agentes por um defeito aqui); só a recusa deliberada sai.
--
-- A lista veio do CÓDIGO: todo supabase.rpc('…') / rpcSolta('…') / from('…') de
-- la-teacher/src (as edge functions do app só levam o JWT do usuário ao /auth/v1,
-- nunca ao PostgREST). RPC NOVA voltada ao professor = INSERT nesta tabela.

create table if not exists public.porteiro_rota_professor (
  rota     text primary key,           -- sem a barra inicial: 'rpc/app_minha_home', 'fabio_chat_mensagens'
  metodos  text[] not null,
  origem   text not null,
  criado_em timestamptz not null default now()
);
create table if not exists public.porteiro_recusa (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  usuario_id   integer,
  auth_user_id uuid,
  caminho      text,
  metodo       text,
  modo         text
);
create index if not exists porteiro_recusa_quando_idx on public.porteiro_recusa (quando desc);
create table if not exists public.porteiro_config (
  id   boolean primary key default true check (id),
  modo text not null check (modo in ('observar', 'bloquear'))
);
insert into public.porteiro_config (id, modo) values (true, 'observar') on conflict (id) do nothing;

alter table public.porteiro_rota_professor enable row level security;
alter table public.porteiro_recusa enable row level security;
alter table public.porteiro_config enable row level security;
revoke all on public.porteiro_rota_professor, public.porteiro_recusa, public.porteiro_config from public, anon, authenticated;
grant all on public.porteiro_rota_professor, public.porteiro_recusa, public.porteiro_config to service_role;

insert into public.porteiro_rota_professor (rota, metodos, origem) values
  ('rpc/app_abrir_rascunho_manual', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_aluno_ficha', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_atualizar_devolutiva_rascunho', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_atualizar_fatia', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_atualizar_perfil', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_atualizar_preferencia_fabio', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_concluir_onboarding', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_confirmar_meu_whatsapp', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_confirmar_registro', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_confirmar_registro_experimental', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_coordenacao_em_aberto', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_coordenacao_feedback_mes', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_coordenacao_professor_detalhe', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_coordenacao_radar', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_corrigir_presenca_do_aluno', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_declarar_falta_experimental', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_devolutiva_definir_destinatario', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_devolutiva_marcar', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_devolutiva_salvar_texto', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_devolutivas_aguardando', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_devolutivas_pendentes', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_editar_registro_confirmado', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_enfileirar_audio', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_enfileirar_audio_experimental', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_experimental_do_professor', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_fabio_do_dia', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_historico_turma', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_marcar_notificacoes_lidas', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_meu_acesso', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_meu_onboarding', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_meu_perfil', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_meu_perfil_coordenacao', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_meu_ponto', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_meus_registros', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minha_agenda_mes', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minha_agenda_semana_v1', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minha_agenda_sessao', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minha_carteira', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minha_home', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minhas_notificacoes_v1', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_minhas_preferencias_fabio', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_notificacoes_nao_lidas', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_onde_parou', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_onde_parou_da_agenda', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_preparar_rascunho_manual', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_professor_feedback_mesa', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_professor_feedback_progresso', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_professor_feedback_salvar', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_professores_para_liberar', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_radar_config', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_radar_config_salvar', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_registrar_experimental', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_registrar_presencas_aula', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_registro_completo', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_registro_para_editar', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_registros_pendentes', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_reportar_audio_preso', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_responder_presenca', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_salvar_rascunho_manual', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_status_audio_fila', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_status_emusys_do_registro', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_texto_emusys_do_registro', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/app_textos_emusys_da_aula', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('rpc/fn_fabio_relatar_confirmacao_falsa', array['GET','POST','HEAD'], 'la-teacher/src'),
  ('fabio_chat_mensagens', array['GET','POST','HEAD'], 'la-teacher/src/features/fabio/chat.ts')
on conflict (rota) do update set metodos = excluded.metodos, origem = excluded.origem;

create or replace function public.fn_porteiro_requisicao()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
declare
  v_claims  jsonb;
  v_uid     uuid;
  v_usuario integer;
  v_perfil  text;
  v_rota    text;
  v_metodo  text;
  v_modo    text;
  v_recusar boolean := false;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if coalesce(v_claims ->> 'role', '') <> 'authenticated' then
      return;
    end if;
    v_uid := nullif(v_claims ->> 'sub', '')::uuid;
    if v_uid is null then return; end if;

    select u.id, u.perfil into v_usuario, v_perfil
      from public.usuarios u where u.auth_user_id = v_uid;
    if v_perfil is distinct from 'professor' then
      return;
    end if;

    v_rota := trim(both '/' from coalesce(current_setting('request.path', true), ''));
    v_metodo := upper(coalesce(nullif(current_setting('request.method', true), ''), 'GET'));
    if exists (select 1 from public.porteiro_rota_professor r
                where r.rota = v_rota and v_metodo = any (r.metodos)) then
      return;
    end if;

    select c.modo into v_modo from public.porteiro_config c where c.id;
    if coalesce(v_modo, 'observar') = 'bloquear' then
      v_recusar := true;
    else
      insert into public.porteiro_recusa (usuario_id, auth_user_id, caminho, metodo, modo)
      values (v_usuario, v_uid, v_rota, v_metodo, 'observar');
    end if;
  exception when others then
    return;  -- defeito aqui não derruba ninguém
  end;

  if v_recusar then
    raise log 'porteiro: professor usuario_id=% recusado em % %', v_usuario, v_metodo, v_rota;
    raise exception 'ACESSO_NEGADO_PROFESSOR'
      using errcode = '42501', detail = v_metodo || ' /' || v_rota;
  end if;
end
$f$;

-- 'stable' + insert: o INSERT do modo observar precisa de volatile.
alter function public.fn_porteiro_requisicao() volatile;

-- Todo papel que o PostgREST assume precisa poder executar (inclusive papéis
-- de agente via JWT) — a função não devolve dado nenhum.
grant execute on function public.fn_porteiro_requisicao() to public, anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request to 'public.fn_porteiro_requisicao';
notify pgrst, 'reload config';
