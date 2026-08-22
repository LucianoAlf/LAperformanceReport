-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CORRIGE O BUG DE ONTEM (14/07): o "pente-fino" comparando professores estava sendo
-- computado ad-hoc pelo Hermes/skill, sem estrutura — e errou grosseiramente: contou so
-- anotacoes_fabio (sem cair pro legado), com uma janela que nao bate com nada real,
-- e tratou "sem login ainda" como se fosse "mau desempenho" (nenhum dos 5 apontados tem
-- acesso ao LA Teacher — nao podiam registrar nada mesmo se quisessem).
--
-- Decisao do Alf (14-15/07): esse tipo de pergunta (comparar VARIOS professores) e' so
-- pra admin/coordenacao — nunca pro professor comum, que so ve a propria carteira.
-- Mesma trava estrutural que fabio_contexto_admin ja usa: perfil verificado DENTRO do SQL.
create or replace function public.fabio_pente_fino_unidade(p_usuario_id integer, p_unidade_nome text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_perfil text;
  v_unidade_id uuid;
  v_res jsonb;
begin
  select perfil into v_perfil from public.usuarios where id = p_usuario_id and coalesce(ativo,true);
  if v_perfil is null or v_perfil <> 'admin' then
    raise exception 'nao_e_admin' using errcode = '42501';
  end if;

  select id into v_unidade_id from public.unidades where nome ilike p_unidade_nome limit 1;
  if v_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_nao_encontrada');
  end if;

  select jsonb_build_object(
    'ok', true,
    'unidade', p_unidade_nome,
    'gerado_em', now(),
    'professores', coalesce((
      select jsonb_agg(t.x order by t.prioridade desc)
      from (
        select jsonb_build_object(
                 'professor_id', p.id,
                 'nome', p.nome,
                 'tem_login', p.usuario_id is not null,
                 'total_alunos_carteira', v.total_alunos,
                 -- SO reporta cobertura de registro se tiver login. Sem login, o campo
                 -- nem aparece — nao vira "0%" mentiroso.
                 'cobertura_registro_pos_piloto', case when p.usuario_id is not null
                    then (select jsonb_build_object(
                            'pct_north_star', ar.pct_north_star,
                            'aulas_cobraveis', ar.aulas_cobraveis)
                          from public.vw_aderencia_registro_professor ar
                          where ar.professor_id = p.id
                          order by ar.mes desc limit 1)
                    else null end,
                 -- frequencia SEMPRE disponivel (nao depende de login/app)
                 'alunos_baixa_presenca_pct', v.baixa_presenca,
                 'alunos_faltas_recorrentes', v.faltas_recorrentes,
                 'sinal', case
                    when p.usuario_id is null then 'sem_acesso_ao_app_ainda'
                    else 'com_acesso'
                 end
               ) as x,
               -- prioridade de exibicao: quem tem MAIS alunos com faltas recorrentes primeiro
               v.faltas_recorrentes as prioridade
        from public.professores p
        join public.professores_unidades pu on pu.professor_id = p.id and pu.unidade_id = v_unidade_id
                                             and coalesce(pu.emusys_ativo,true)
        join lateral (
          select count(distinct j.aluno_id) as total_alunos,
                 count(distinct j.aluno_id) filter (where j.percentual_presenca_contrato < 80) as baixa_presenca,
                 count(distinct j.aluno_id) filter (where j.faltas >= 3) as faltas_recorrentes
          from public.vw_jornada_aluno_com_presenca j
          where j.professor_id = p.id
        ) v on true
        where coalesce(p.ativo,true)
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

revoke all on function public.fabio_pente_fino_unidade(integer,text) from public, anon, authenticated;
grant execute on function public.fabio_pente_fino_unidade(integer,text) to service_role, fabio_agent;
