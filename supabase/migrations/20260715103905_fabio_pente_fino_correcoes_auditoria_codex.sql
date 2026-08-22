-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CORRECOES da auditoria SELECT-only do Codex (15/07). Veredito dele: NAO APROVADO
-- pra coordenacao. Aplico aqui tudo que e' territorio do banco/RPC. O que NAO resolvo:
-- o sync (supabase/functions/sync-presenca-emusys) materializa qualquer coisa != 'presente'
-- como falta apos 24h, sem distinguir "chamada nao feita" de "falta real" — isso e'
-- territorio do Codex (Edge Function), nao da RPC. Por isso adiciono uma TRAVA DE SANIDADE
-- em vez de tentar consertar o dado na raiz por aqui.
create or replace function public.fabio_pente_fino_unidade(p_usuario_id integer, p_unidade_nome text, p_janela_dias integer default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_perfil text;
  v_unidade_id uuid;
  v_res jsonb;
  v_janela integer := greatest(14, least(p_janela_dias, 180));  -- ponto 3.3: bound min/max
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
    'aviso_geral', 'Faltas recorrentes: sinal de TRIAGEM operacional, nao fato pedagogico confirmado. O sync converte falta de chamada em falta apos 24h — auditoria Codex 15/07.',
    'recorte', jsonb_build_object(
      'unidade', p_unidade_nome,
      'janela_dias', v_janela,
      'fonte_carteira', 'vw_jornada_aluno_com_presenca, deduplicada por pessoa (emusys_aluno_id, fallback aluno_id)',
      'regra_faltas_recorrentes', '>= 3 faltas NAO justificadas na janela, por pessoa (nao por matricula)',
      'cobertura_registro', 'mes de referencia mais recente por professor (ver mes_referencia em cada linha); aulas encerradas; anotacoes_fabio OR legado Emusys',
      'aviso_temporal', 'carteira e atual; faltas sao janela rolante; cobertura de registro usa o ultimo mes disponivel — 3 recortes de tempo diferentes',
      'gerado_em', now()
    ),
    'professores', coalesce((
      select jsonb_agg(t.x order by t.prioridade desc)
      from (
        select jsonb_build_object(
                 'professor_id', p.id,
                 'nome', p.nome,
                 -- login robustecido (ponto 4.3 do Codex): usuario ativo + auth_user_id + perfil correto
                 'tem_login', exists(
                   select 1 from public.usuarios u2
                   where u2.id = p.usuario_id and coalesce(u2.ativo,true)
                     and u2.auth_user_id is not null and u2.perfil = 'professor'
                 ),
                 'total_alunos_carteira_unidade', v.total_pessoas,
                 'cobertura_registro_unidade', case when p.usuario_id is not null
                    then (select jsonb_build_object('mes_referencia', ar.mes, 'pct_cobertura', ar.pct_cobertura,
                                                      'aulas', ar.aulas, 'com_registro', ar.com_registro)
                          from public.vw_aderencia_registro_professor ar
                          where ar.professor_id = p.id and ar.unidade_id = v_unidade_id
                          order by ar.mes desc limit 1)
                    else null end,
                 'alunos_faltas_recorrentes_nao_justificadas', v.faltas_recorrentes,
                 'alunos_faltas_recorrentes_incluindo_justificadas', v.faltas_recorrentes_com_justificada,
                 -- TRAVA DE SANIDADE: compara janela atual com a janela anterior de mesmo tamanho.
                 -- Pega exatamente o padrao do Caio (mai/jun normal, jul despenca).
                 'dado_suspeito', v.presenca_atual is not null and v.presenca_anterior is not null
                    and v.presenca_anterior >= 0.3 and v.presenca_atual < v.presenca_anterior * 0.5,
                 'motivo_suspeita', case when v.presenca_atual is not null and v.presenca_anterior is not null
                    and v.presenca_anterior >= 0.3 and v.presenca_atual < v.presenca_anterior * 0.5
                    then format('presenca registrada caiu de %s%% pra %s%% vs janela anterior — mais provavel sync/chamada nao feita do que mudanca real de comportamento',
                                 round(v.presenca_anterior*100), round(v.presenca_atual*100))
                    else null end,
                 'sinal', case when p.usuario_id is null then 'sem_acesso_ao_app_ainda' else 'com_acesso' end
               ) as x,
               v.faltas_recorrentes as prioridade
        from public.professores p
        join public.professores_unidades pu on pu.professor_id = p.id and pu.unidade_id = v_unidade_id
                                             and coalesce(pu.emusys_ativo,true)
        join lateral (
          -- DEDUP: pessoa = emusys_aluno_id (fallback aluno_id quando ausente) — ponto 5.3
          with pessoas as (
            select distinct coalesce('e:'||j.emusys_aluno_id::text, 'l:'||j.aluno_id::text) as pessoa_key,
                   j.aluno_id
            from public.vw_jornada_aluno_com_presenca j
            where j.professor_id = p.id and j.unidade_id = v_unidade_id
          ),
          faltas_por_pessoa as (
            select ps.pessoa_key,
                   count(*) filter (where ap.status='ausente' and not coalesce(ae.justificada,false)) as faltas_nj,
                   count(*) filter (where ap.status='ausente') as faltas_com_just,
                   count(*) filter (where ap.status='presente') as presentes_atual,
                   count(*) filter (where ap.status='ausente' and not coalesce(ae.justificada,false)) as ausentes_atual
            from pessoas ps
            join public.aluno_presenca ap on ap.aluno_id = ps.aluno_id and ap.professor_id = p.id
                                           and ap.unidade_id = v_unidade_id
                                           and ap.data_aula >= current_date - v_janela
            left join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
            group by ps.pessoa_key
          ),
          janela_anterior as (
            select count(*) filter (where ap.status='presente') as presentes,
                   count(*) filter (where ap.status='ausente' and not coalesce(ae.justificada,false)) as ausentes
            from pessoas ps
            join public.aluno_presenca ap on ap.aluno_id = ps.aluno_id and ap.professor_id = p.id
                                           and ap.unidade_id = v_unidade_id
                                           and ap.data_aula >= current_date - (v_janela*2)
                                           and ap.data_aula < current_date - v_janela
            left join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
          ),
          janela_atual_total as (
            select count(*) filter (where ap.status='presente') as presentes,
                   count(*) filter (where ap.status='ausente' and not coalesce(ae.justificada,false)) as ausentes
            from pessoas ps
            join public.aluno_presenca ap on ap.aluno_id = ps.aluno_id and ap.professor_id = p.id
                                           and ap.unidade_id = v_unidade_id
                                           and ap.data_aula >= current_date - v_janela
            left join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
          )
          select (select count(*) from pessoas) as total_pessoas,
                 (select count(*) from faltas_por_pessoa where faltas_nj >= 3) as faltas_recorrentes,
                 (select count(*) from faltas_por_pessoa where faltas_com_just >= 3) as faltas_recorrentes_com_justificada,
                 (select case when (presentes+ausentes)=0 then null else presentes::numeric/(presentes+ausentes) end from janela_atual_total) as presenca_atual,
                 (select case when (presentes+ausentes)=0 then null else presentes::numeric/(presentes+ausentes) end from janela_anterior) as presenca_anterior
        ) v on true
        where coalesce(p.ativo,true)
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

revoke all on function public.fabio_pente_fino_unidade(integer,text,integer) from public, anon, authenticated;
grant execute on function public.fabio_pente_fino_unidade(integer,text,integer) to service_role, fabio_agent;
