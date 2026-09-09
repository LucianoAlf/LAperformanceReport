-- Resumo canonico enxuto para os tres cartoes de professores do Dashboard.
--
-- O Dashboard so precisa de carteira, ocupacoes/turmas elegiveis e renovacoes.
-- A RPC ampla get_kpis_professor_periodo_canonico_v3 tambem recomputa presenca,
-- experimentais, saidas e fator de demanda, o que causava timeout 57014 ao abrir
-- o consolidado. Este leitor preserva os mesmos numeradores canonicos sem abrir
-- esses produtores que nao sao exibidos aqui.
create or replace function public.get_dashboard_professores_resumo_canonico_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null::uuid,
  p_data_inicio date default null::date,
  p_data_fim date default null::date
)
returns table(
  carteira_alunos integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  renovacoes integer,
  nao_renovacoes integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
  v_inicio date := coalesce(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
begin
  if p_mes < 1 or p_mes > 12 then
    raise exception 'Mes invalido: %', p_mes using errcode = '22023';
  end if;

  v_fim := coalesce(p_data_fim, (v_inicio + interval '1 month - 1 day')::date);

  if v_fim < v_inicio then
    raise exception 'Periodo invalido: data final anterior a inicial'
      using errcode = '22023';
  end if;

  -- Mesmo escopo de leitura da RPC ampla de professores. A reducao e somente
  -- de trabalho, nunca de autorizacao.
  if auth.role() = 'service_role' then
    v_unidade_efetiva := p_unidade_id;
  else
    select u.id, u.perfil, u.unidade_id
      into v_usuario_id, v_perfil, v_unidade_usuario
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
    limit 1;

    if v_usuario_id is null then
      raise exception 'Acesso negado: usuario sem cadastro ativo'
        using errcode = '42501';
    end if;

    if v_perfil = 'admin' then
      if not public.usuario_tem_permissao(
        v_usuario_id,
        'professores.ver',
        p_unidade_id
      ) then
        raise exception 'Acesso negado: sem permissao para professores'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := p_unidade_id;
    elsif v_perfil = 'unidade' then
      if v_unidade_usuario is null
         or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := v_unidade_usuario;
    else
      if v_unidade_usuario is null
         or (p_unidade_id is not null and p_unidade_id <> v_unidade_usuario)
         or not public.usuario_tem_permissao(
           v_usuario_id,
           'professores.ver',
           v_unidade_usuario
         ) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
      v_unidade_efetiva := v_unidade_usuario;
    end if;
  end if;

  return query
  with roster_operacional as (
    select distinct
      p.id as professor_id,
      pu.unidade_id
    from public.professores p
    join public.professores_unidades pu
      on pu.professor_id = p.id
    where p.ativo = true
      and pu.emusys_ativo = true
      and pu.validacao_status <> 'ignorado'
      and (v_unidade_efetiva is null or pu.unidade_id = v_unidade_efetiva)
  ), carteira as (
    select
      c.professor_id,
      c.unidade_id,
      c.carteira_alunos,
      c.alunos_via_turmas,
      c.turmas_elegiveis_media
    from public.get_carteira_professor_periodo_canonica(
      p_ano,
      p_mes,
      v_unidade_efetiva,
      v_inicio,
      v_fim
    ) c
    join roster_operacional r
      on r.professor_id = c.professor_id
     and r.unidade_id = c.unidade_id
  ), renovacoes_por_professor as (
    select
      r.professor_id,
      r.unidade_id,
      count(*) filter (where m.tipo = 'renovacao')::integer as renovacoes,
      count(*) filter (where m.tipo = 'nao_renovacao')::integer as nao_renovacoes
    from public.movimentacoes_admin m
    left join public.alunos a on a.id = m.aluno_id
    join roster_operacional r
      on r.professor_id = coalesce(m.professor_id, a.professor_atual_id)
     and r.unidade_id = m.unidade_id
    where m.tipo in ('renovacao', 'nao_renovacao')
      and public.is_movimentacao_admin_retencao_valida(m.id)
      and m.data between v_inicio and v_fim
    group by r.professor_id, r.unidade_id
  )
  select
    coalesce(sum(c.carteira_alunos), 0)::integer as carteira_alunos,
    coalesce(sum(c.alunos_via_turmas), 0)::integer as alunos_via_turmas,
    coalesce(sum(c.turmas_elegiveis_media), 0)::integer as turmas_elegiveis_media,
    coalesce(sum(r.renovacoes), 0)::integer as renovacoes,
    coalesce(sum(r.nao_renovacoes), 0)::integer as nao_renovacoes
  from roster_operacional ro
  left join carteira c
    on c.professor_id = ro.professor_id
   and c.unidade_id = ro.unidade_id
  left join renovacoes_por_professor r
    on r.professor_id = ro.professor_id
   and r.unidade_id = ro.unidade_id;
end;
$function$;

revoke all on function public.get_dashboard_professores_resumo_canonico_v1(
  integer, integer, uuid, date, date
) from public, anon;
grant execute on function public.get_dashboard_professores_resumo_canonico_v1(
  integer, integer, uuid, date, date
) to authenticated, service_role;

comment on function public.get_dashboard_professores_resumo_canonico_v1(
  integer, integer, uuid, date, date
) is
  'Resumo canônico enxuto do Dashboard: carteira, ocupações/turmas elegíveis e retenção, sem recalcular presença ou experimentais.';

-- A conversao por professor descarta a grande maioria das linhas sem professor.
-- O indice parcial atende exatamente esse recorte por unidade e periodo, sem
-- alterar a regra comercial nem a leitura bruta do Emusys.
create index if not exists idx_emusys_experimentais_raw_unidade_data_professor_not_null
  on public.emusys_experimentais_raw (unidade_id, data_aula)
  where professor_id is not null;
