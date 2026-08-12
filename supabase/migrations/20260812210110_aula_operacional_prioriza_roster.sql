-- O Emusys pode devolver, no mesmo slot, um evento antigo sem roster e outro
-- evento atual com alunos. O raw permanece intacto; consumidores operacionais
-- passam por um resolvedor único e determinístico.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists idx_aulas_emusys_slot_operacional
  on public.aulas_emusys (
    unidade_id,
    professor_id,
    data_hora_inicio,
    data_hora_fim,
    curso_nome
  )
  where coalesce(cancelada, false) = false;

create or replace function public.fn_aula_operacional_id(p_aula_id integer)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select candidata.id
    from public.aulas_emusys base
    join lateral (
      select atual.id
        from public.aulas_emusys atual
        left join lateral (
          select count(*)::integer as n_alunos
            from public.aula_alunos_emusys roster
           where roster.aula_emusys_id = atual.id
        ) quantidade on true
       where atual.unidade_id is not distinct from base.unidade_id
         and atual.professor_id is not distinct from base.professor_id
         and atual.data_hora_inicio = base.data_hora_inicio
         and atual.data_hora_fim is not distinct from base.data_hora_fim
         and atual.curso_nome is not distinct from base.curso_nome
         and coalesce(atual.cancelada, false) = false
       order by coalesce(quantidade.n_alunos, 0) desc,
                case when atual.tipo = 'turma' then 0 else 1 end,
                atual.id desc
       limit 1
    ) candidata on true
   where base.id = p_aula_id
$function$;

comment on function public.fn_aula_operacional_id(integer) is
  'Resolve o evento operacional de um slot Emusys sem apagar o espelho bruto: maior roster, turma no empate e ID local mais recente.';

revoke all on function public.fn_aula_operacional_id(integer)
  from public, anon, authenticated;
grant execute on function public.fn_aula_operacional_id(integer) to service_role;

-- Preserva o corpo vivo da RPC e troca apenas o resolvedor de slots. A guarda
-- aborta a migration se outra frente tiver alterado esse trecho em paralelo.
do $migration$
declare
  v_sql text;
  v_antigo text := $trecho$
    ), slots as (
      select data_hora_inicio, data_hora_fim,
             (array_agg(id order by case when tipo = 'turma' then 0 else 1 end, id))[1] as aula_id_ancora
        from aulas_dia
       group by data_hora_inicio, data_hora_fim
    ), ancoras as (
$trecho$;
  v_novo text := $trecho$
    ), slots as (
      select data_hora_inicio, data_hora_fim, curso_nome,
             min(public.fn_aula_operacional_id(id)) as aula_id_ancora
        from aulas_dia
       group by data_hora_inicio, data_hora_fim, curso_nome
    ), ancoras as (
$trecho$;
begin
  select pg_get_functiondef('public.app_minha_agenda_sessao(date)'::regprocedure)
    into v_sql;
  if position(v_antigo in v_sql) = 0 then
    raise exception 'AULA_OPERACIONAL_APP_AGENDA_TRECHO_DIVERGIU';
  end if;
  execute replace(v_sql, v_antigo, v_novo);
end
$migration$;

-- A cobrança pedagógica passa a considerar somente a âncora operacional. Uma
-- individual reagendada não some só porque existe uma turma vazia no espelho.
create or replace view public.vw_registro_pendencia as
select
  ae.professor_id,
  ae.professor_nome,
  ae.unidade_id,
  ae.id as aula_ancora_id,
  alvo.id as aula_alvo_id,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  ae.curso_nome,
  public.fn_curso_base(ae.curso_nome::text) as curso_base,
  ae.turma_nome,
  ae.tipo,
  r.aluno_id,
  al.nome as aluno_nome,
  split_part(btrim(al.nome::text), ' '::text, 1) as aluno_primeiro_nome,
  pres.status_presenca,
  pres.chamada_feita,
  floor(extract(epoch from now() - ae.data_hora_fim) / 86400::numeric)::integer as dias_em_atraso,
  ae.data_aula >= public.fn_data_corte_cobranca() as cobravel,
  nullif(btrim(coalesce(alvo.anotacoes, ''::text)), ''::text) is not null as tem_plano_emusys
from public.aulas_emusys ae
join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
join public.alunos al on al.id = r.aluno_id
join lateral (
  select coalesce((
    select i.id
      from public.aulas_emusys i
      join public.aula_alunos_emusys ri
        on ri.aula_emusys_id = i.id and ri.aluno_id = r.aluno_id
     where i.tipo::text = 'individual'::text
       and i.unidade_id = ae.unidade_id
       and i.data_hora_inicio = ae.data_hora_inicio
       and i.data_hora_fim is not distinct from ae.data_hora_fim
       and i.curso_nome is not distinct from ae.curso_nome
       and i.professor_id is not distinct from ae.professor_id
       and coalesce(i.cancelada, false) = false
     order by i.id desc
     limit 1
  ), ae.id) as id
) alvo_id on true
join public.aulas_emusys alvo on alvo.id = alvo_id.id
join lateral (
  select count(*) > 0 as chamada_feita,
         case when bool_or(g.st = 'presente'::text) then 'presente'::text
              when count(*) > 0 then 'falta'::text
              else null::text end as status_presenca
    from (
      select ap2.status_presenca as st
        from public.aulas_emusys gem
        join public.aluno_presenca ap2
          on ap2.aula_emusys_id = gem.id and ap2.aluno_id = r.aluno_id
       where gem.unidade_id = ae.unidade_id
         and gem.data_hora_inicio = ae.data_hora_inicio
         and gem.data_hora_fim is not distinct from ae.data_hora_fim
         and gem.curso_nome is not distinct from ae.curso_nome
         and gem.professor_id is not distinct from ae.professor_id
         and coalesce(gem.cancelada, false) = false
    ) g
) pres on true
where ae.id = public.fn_aula_operacional_id(ae.id)
  and ae.professor_id is not null
  and coalesce(ae.cancelada, false) = false
  and ae.data_hora_fim < now()
  and coalesce(pres.status_presenca, 'presente'::text) <> 'falta'::text
  and nullif(btrim(coalesce(alvo.anotacoes_fabio, ''::text)), ''::text) is null;

comment on view public.vw_registro_pendencia is
  'Aulas operacionais que aconteceram e ainda não têm relato. O evento do slot é resolvido por fn_aula_operacional_id; o raw Emusys permanece intacto.';

create or replace view public.vw_presenca_pendencia as
select
  ae.unidade_id,
  u.nome as unidade_nome,
  ae.professor_id,
  p.nome as professor_nome,
  ae.id as aula_id,
  ae.tipo,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
  ae.curso_nome,
  ae.turma_nome,
  r.aluno_id,
  al.nome as aluno_nome,
  split_part(btrim(al.nome), ' ', 1) as aluno_primeiro_nome,
  coalesce(adm.justificada, false) as justificada,
  floor(extract(epoch from (now() - ae.data_hora_fim)) / 86400)::integer as dias_em_atraso
from public.aulas_emusys ae
join public.aula_alunos_emusys r
  on r.aula_emusys_id = ae.id and r.aluno_id is not null
join public.alunos al on al.id = r.aluno_id
join public.unidades u on u.id = ae.unidade_id
left join public.professores p on p.id = ae.professor_id
left join public.aluno_presenca_administrativo adm
  on adm.aula_emusys_id = ae.id and adm.aluno_id = r.aluno_id
where ae.id = public.fn_aula_operacional_id(ae.id)
  and coalesce(ae.cancelada, false) = false
  and ae.professor_id is not null
  and ae.data_hora_fim < now()
  and ae.data_aula >= current_date - 45
  and not exists (
    select 1 from public.aluno_presenca ap
     where ap.aula_emusys_id = ae.id
       and ap.aluno_id = r.aluno_id
       and public.fn_presenca_fecha_chamada(
         coalesce(ap.status_presenca,
           case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
         ap.respondido_por
       )
  );

-- Os dois ramos (registro e chamada) do Fábio recebem a mesma cláusula. A
-- contagem de ocorrências protege contra troca parcial do corpo vivo.
do $migration$
declare
  v_sql text;
  v_antigo text := $trecho$      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false$trecho$;
  v_novo text := $trecho$      where ae.professor_id = p_professor_id
        and ae.id = public.fn_aula_operacional_id(ae.id)
        and coalesce(ae.cancelada, false) = false$trecho$;
  v_ocorrencias integer;
begin
  select pg_get_functiondef('public.fabio_aulas_candidatas(integer,text,timestamp with time zone)'::regprocedure)
    into v_sql;
  v_ocorrencias := (length(v_sql) - length(replace(v_sql, v_antigo, ''))) / length(v_antigo);
  if v_ocorrencias <> 2 then
    raise exception 'AULA_OPERACIONAL_FABIO_OCORRENCIAS_DIVERGIRAM: %', v_ocorrencias;
  end if;
  execute replace(v_sql, v_antigo, v_novo);
end
$migration$;

-- Cliente antigo pode ainda mandar o ID vazio. A porta canônica corrige antes
-- de validar, deduplicar e inserir a fila.
do $migration$
declare
  v_sql text;
  v_antigo text := $trecho$  select * into v_aula from public.aulas_emusys where id = p_aula_id;
  if not found then raise exception 'Aula % nao encontrada', p_aula_id; end if;$trecho$;
  v_novo text := $trecho$  select * into v_aula
    from public.aulas_emusys
   where id = public.fn_aula_operacional_id(p_aula_id);
  if not found then raise exception 'Aula % nao encontrada', p_aula_id; end if;
  p_aula_id := v_aula.id;$trecho$;
begin
  select pg_get_functiondef('public.fn_enfileirar_audio_core(integer,text,integer,uuid,text,integer)'::regprocedure)
    into v_sql;
  if position(v_antigo in v_sql) = 0 then
    raise exception 'AULA_OPERACIONAL_ENFILEIRAR_TRECHO_DIVERGIU';
  end if;
  execute replace(v_sql, v_antigo, v_novo);
end
$migration$;

-- Recupera somente erros transitórios já ligados a uma âncora vazia quando a
-- nova âncora possui roster. Usa o audit_log existente, sem ledger paralelo.
do $migration$
declare
  v_item record;
begin
  for v_item in
    select fila.id as fila_id,
           fila.aula_id as aula_id_anterior,
           public.fn_aula_operacional_id(fila.aula_id) as aula_id_nova,
           fila.status as status_anterior,
           fila.erro as erro_anterior,
           fila.tentativas as tentativas_anteriores
      from public.fabio_fila_audios fila
     where fila.status = 'erro'
       and fila.erro_tipo = 'transitorio'
       and fila.erro ilike '%aula%roster%'
       and public.fn_aula_operacional_id(fila.aula_id) is distinct from fila.aula_id
       and exists (
         select 1 from public.aula_alunos_emusys roster
          where roster.aula_emusys_id = public.fn_aula_operacional_id(fila.aula_id)
       )
     for update of fila
  loop
    insert into public.audit_log(
      tabela, registro_id, registro_id_text, acao,
      dados_antigos, dados_novos, usuario, origem, created_at
    ) values (
      'fabio_fila_audios', v_item.fila_id, v_item.fila_id::text,
      'relink_aula_roster',
      jsonb_build_object(
        'aula_id', v_item.aula_id_anterior,
        'status', v_item.status_anterior,
        'erro', v_item.erro_anterior,
        'tentativas', v_item.tentativas_anteriores
      ),
      jsonb_build_object(
        'aula_id', v_item.aula_id_nova,
        'status', 'pendente',
        'motivo', 'evento_emusys_vazio_concorria_com_evento_com_roster'
      ),
      'migration', 'aula_operacional_prioriza_roster', now()
    );

    update public.fabio_fila_audios
       set aula_id = v_item.aula_id_nova,
           status = 'pendente',
           erro = null,
           tentativas = 0,
           atualizado_em = now()
     where id = v_item.fila_id;
  end loop;
end
$migration$;

-- CREATE OR REPLACE preserva ACLs das funções existentes; o helper novo fica
-- privado e os contratos públicos continuam exatamente como estavam.

commit;
