begin;

-- Subprojeto C: a fila passa a sinalizar D+1 para novas tentativas de envio.
-- Esta migration nao altera pesquisas ja criadas nem agenda disparos. As
-- pesquisas produtivas existentes continuam preservadas exatamente como estao.

create or replace function public.pesquisa_evasao_elegivel_a_partir_v1(
  p_data_evasao date
)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when p_data_evasao is null then null
    else ((p_data_evasao + interval '1 day')::date + time '10:00')
      at time zone 'America/Sao_Paulo'
  end;
$function$;

comment on function public.pesquisa_evasao_elegivel_a_partir_v1(date) is
  'Calcula D+1 as 10h BRT. Sinaliza elegibilidade manual; nao dispara pesquisa.';

create or replace function public.pode_enviar_pesquisa_evasao(
  p_evasao_id integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_data_evasao date;
begin
  if not (
    auth.role() = 'service_role'
    or public.fn_pesquisa_evasao_usuario_interno_ativo()
  ) then
    return false;
  end if;

  select m.data
  into v_data_evasao
  from public.movimentacoes_admin as m
  where m.id = p_evasao_id
    and m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id);

  return v_data_evasao is not null
    and now() >= public.pesquisa_evasao_elegivel_a_partir_v1(v_data_evasao);
end;
$function$;

create or replace function public.listar_evadidos_para_pesquisa_v3(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer,
  p_busca text
)
returns table (
  total_count bigint,
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_catalogado text,
  motivo_legado text,
  pesquisa_producao_status text,
  pesquisa_producao_id uuid,
  resposta_producao_texto text,
  resposta_producao_audio_url text,
  resposta_producao_tipo text,
  respondido_producao_em timestamptz,
  is_menor boolean,
  responsavel_nome text,
  publico_tipo text,
  bloqueio_codigo text,
  elegivel_envio boolean,
  elegibilidade_regra text,
  elegivel_a_partir_em timestamptz,
  possui_historico_teste boolean,
  quantidade_testes bigint,
  ultimo_teste_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    l.total_count,
    l.evasao_id,
    l.aluno_id,
    l.nome,
    l.telefone,
    l.curso,
    l.professor,
    l.tempo_meses,
    l.data_evasao,
    l.motivo_catalogado,
    l.motivo_legado,
    l.pesquisa_producao_status,
    l.pesquisa_producao_id,
    l.resposta_producao_texto,
    l.resposta_producao_audio_url,
    l.resposta_producao_tipo,
    l.respondido_producao_em,
    l.is_menor,
    l.responsavel_nome,
    l.publico_tipo,
    l.bloqueio_codigo,
    case
      when l.elegivel_envio
       and now() < public.pesquisa_evasao_elegivel_a_partir_v1(l.data_evasao)
        then false
      else l.elegivel_envio
    end as elegivel_envio,
    case
      when l.elegivel_envio
       and now() < public.pesquisa_evasao_elegivel_a_partir_v1(l.data_evasao)
        then 'aguardando_d1'
      else l.elegibilidade_regra
    end::text as elegibilidade_regra,
    public.pesquisa_evasao_elegivel_a_partir_v1(l.data_evasao)
      as elegivel_a_partir_em,
    l.possui_historico_teste,
    l.quantidade_testes,
    l.ultimo_teste_em
  from public.listar_evadidos_para_pesquisa_v2(
    p_unidade_id,
    p_limite,
    p_offset,
    p_status,
    p_ano,
    p_mes,
    p_busca
  ) as l;
$function$;

comment on function public.listar_evadidos_para_pesquisa_v3(
  uuid, integer, integer, varchar, integer, integer, text
) is
  'Read model manual da evasao com elegibilidade D+1; nao altera historico.';

revoke all on function public.pesquisa_evasao_elegivel_a_partir_v1(date)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant execute on function public.pesquisa_evasao_elegivel_a_partir_v1(date)
  to authenticated, service_role;

revoke all on function public.pode_enviar_pesquisa_evasao(integer)
  from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.pode_enviar_pesquisa_evasao(integer)
  to authenticated, service_role;

revoke all on function public.listar_evadidos_para_pesquisa_v3(
  uuid, integer, integer, varchar, integer, integer, text
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_evadidos_para_pesquisa_v3(
  uuid, integer, integer, varchar, integer, integer, text
) to authenticated, service_role;

commit;
