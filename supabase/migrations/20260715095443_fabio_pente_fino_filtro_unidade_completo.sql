-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- PATCH (Alfredo pegou): a RPC recebia unidade_nome mas vazava alunos de OUTRAS unidades,
-- porque vw_jornada_aluno_com_presenca filtrava so por professor_id (e o professor da aula
-- em mais de uma unidade). Caio: 49 (44 CG + 5 Recreio) virava "42 de 49 em Campo Grande",
-- quando o certo e "41 de 44 em Campo Grande". Nao muda o alerta, muda a precisao.
-- Agora filtra unidade em TUDO (carteira, presenca, aderencia) e declara o recorte no JSON.
create or replace function public.fabio_pente_fino_unidade(p_usuario_id integer, p_unidade_nome text, p_janela_dias integer default 60)
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
    'recorte', jsonb_build_object(
      'unidade', p_unidade_nome,
      'janela_dias', p_janela_dias,
      'fonte_carteira', 'vw_jornada_aluno_com_presenca (matricula ativa, filtrada por unidade)',
      'regra_faltas_recorrentes', '>= 3 faltas na janela, nesta unidade',
      'cobertura_registro', 'julho corrente, aulas encerradas, anotacoes_fabio OR legado Emusys',
      'gerado_em', now()
    ),
    'professores', coalesce((
      select jsonb_agg(t.x order by t.prioridade desc)
      from (
        select jsonb_build_object(
                 'professor_id', p.id,
                 'nome', p.nome,
                 'tem_login', p.usuario_id is not null,
                 'total_alunos_carteira_unidade', v.total_alunos,
                 -- cobertura SO se tiver login, e filtrada pela MESMA unidade
                 'cobertura_registro_unidade', case when p.usuario_id is not null
                    then (select jsonb_build_object('pct_cobertura', ar.pct_cobertura, 'aulas', ar.aulas, 'com_registro', ar.com_registro)
                          from public.vw_aderencia_registro_professor ar
                          where ar.professor_id = p.id and ar.unidade_id = v_unidade_id
                          order by ar.mes desc limit 1)
                    else null end,
                 'alunos_faltas_recorrentes_janela', v.faltas_recorrentes,
                 'sinal', case when p.usuario_id is null then 'sem_acesso_ao_app_ainda' else 'com_acesso' end
               ) as x,
               v.faltas_recorrentes as prioridade
        from public.professores p
        join public.professores_unidades pu on pu.professor_id = p.id and pu.unidade_id = v_unidade_id
                                             and coalesce(pu.emusys_ativo,true)
        join lateral (
          select count(distinct j.aluno_id) as total_alunos,
                 count(distinct j.aluno_id) filter (where coalesce(ap_rec.faltas_janela,0) >= 3) as faltas_recorrentes
          from public.vw_jornada_aluno_com_presenca j
          left join lateral (
            select count(*) filter (where ap.status='ausente') as faltas_janela
            from public.aluno_presenca ap
            where ap.aluno_id = j.aluno_id and ap.professor_id = p.id
              and ap.unidade_id = v_unidade_id                       -- FILTRO NOVO
              and ap.data_aula >= current_date - p_janela_dias
          ) ap_rec on true
          where j.professor_id = p.id
            and j.unidade_id = v_unidade_id                          -- FILTRO NOVO
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
