-- Aviso previo: fonte confiavel e falha fechada (05/09/2026)
--
-- Causas comprovadas:
-- 1. Os tres crons de sabado disputavam o mesmo rate limit. HTTP 429 era
--    convertido pelo script em `cobrar`, incluindo alunos ja finalizados.
-- 2. Aula futura + presenca recente nao distingue aviso cancelado de aviso
--    vigente: ambos ocorrem durante o mes de aviso.
-- 3. Registros legados sem emusys_aviso_previo_id nao podem receber o webhook
--    de remocao e nao sustentam cobranca automatica.
-- 4. O payload do Davi trouxe data prevista anterior ao proprio aviso.

begin;

-- Reparos pontuais confirmados nominalmente pelas equipes. Aviso cancelado e
-- anulado (nao apagado) para preservar a trilha administrativa.
update public.movimentacoes_admin
set anulado = true,
    anulado_motivo = 'Aviso removido no Emusys; confirmado por Fernanda em 05/09/2026',
    anulado_em = now(),
    anulado_por = 'auditoria_aviso_previo_20260905',
    updated_at = now()
where id = 3116
  and aluno_nome = 'Arthur Monteiro de Castro Landim'
  and tipo = 'aviso_previo'
  and not anulado;

update public.movimentacoes_admin
set anulado = true,
    anulado_motivo = 'Aviso removido no Emusys; confirmado por Arthur em 05/09/2026',
    anulado_em = now(),
    anulado_por = 'auditoria_aviso_previo_20260905',
    updated_at = now()
where id = 3187
  and aluno_nome = 'Alana Vasconcelos de Araujo'
  and tipo = 'aviso_previo'
  and not anulado;

update public.movimentacoes_admin
set anulado = true,
    anulado_motivo = 'Aviso removido no Emusys; confirmado por Arthur em 05/09/2026',
    anulado_em = now(),
    anulado_por = 'auditoria_aviso_previo_20260905',
    updated_at = now()
where id = 3489
  and aluno_nome = 'Tito Lapa Cazarim'
  and tipo = 'aviso_previo'
  and not anulado;

-- Davi: payload bruto id=96786 dizia data_aviso=01/09 e data prevista=11/08,
-- cronologicamente impossivel. A equipe confirmou 01/10.
update public.movimentacoes_admin
set data_prevista_saida = date '2026-10-01',
    mes_saida = date '2026-10-01',
    updated_at = now()
where id = 3786
  and aluno_nome = 'Davi Branco Rodrigues'
  and emusys_aviso_previo_id = 589
  and data = date '2026-09-01'
  and data_prevista_saida = date '2026-08-11';

-- Luiz: Mayra confirmou que ainda ha uma aula antes da saida; a consulta ao
-- vivo mostrou essa aula em 14/09. O reparo nao altera o payload bruto.
update public.movimentacoes_admin
set data_prevista_saida = date '2026-09-14',
    mes_saida = date '2026-09-01',
    updated_at = now()
where id = 3717
  and aluno_nome = 'Luiz Eduardo Philippsen'
  and emusys_aviso_previo_id = 581
  and data_prevista_saida = date '2026-09-01';

create or replace function public.aviso_previo_pendencias(
  p_unidade_id uuid,
  p_ref        date default null
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with hoje as (
  select coalesce(p_ref, (now() at time zone 'America/Sao_Paulo')::date) as d
),
base as (
  select distinct on (coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))))
    m.id, m.aluno_id, m.aluno_nome,
    m.data                                             as pedido,
    m.emusys_aviso_previo_id,
    coalesce(m.data_prevista_saida, m.mes_saida - 1)   as fim,
    (m.data_prevista_saida is null)                    as estimada,
    a.status                                           as status_lareport
  from public.movimentacoes_admin m
  join public.alunos a on a.id = m.aluno_id
  where m.tipo = 'aviso_previo'
    and not m.anulado
    and m.unidade_id = p_unidade_id
    and a.unidade_id = p_unidade_id
    and a.status in ('ativo', 'aviso_previo')
    and coalesce(m.data_prevista_saida, m.mes_saida - 1) is not null
  order by coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))),
           coalesce(m.data_prevista_saida, m.mes_saida - 1) desc,
           m.id desc
),
sel as (
  select b.*, h.d as ref,
         case when b.fim >= h.d - 2 then 'janela' else 'vencido' end as grupo
  from base b, hoje h
  where b.fim <= h.d + 1
),
enriq as (
  select s.*,
    (select c.nome from public.alunos aa
       left join public.cursos c on c.id = aa.curso_id
      where aa.id = s.aluno_id) as curso,
    (select min(em.emusys_aluno_id) from public.emusys_matriculas_estado_atual em
      where em.aluno_id = s.aluno_id and em.unidade_id = p_unidade_id) as emusys_aluno_id
  from sel s
)
select jsonb_build_object(
  'unidade_id', p_unidade_id,
  'unidade',    (select nome from public.unidades where id = p_unidade_id),
  'hoje',       (select d from hoje),
  'janela', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim,
             'estimada', e.estimada, 'status_lareport', e.status_lareport,
             'emusys_aviso_previo_id', e.emusys_aviso_previo_id,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'janela'
  ), '[]'::jsonb),
  'vencidos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'movimentacao_id', e.id, 'aluno_id', e.aluno_id, 'nome', e.aluno_nome,
             'curso', e.curso, 'pedido', e.pedido, 'fim', e.fim,
             'estimada', e.estimada, 'status_lareport', e.status_lareport,
             'emusys_aviso_previo_id', e.emusys_aviso_previo_id,
             'emusys_aluno_id', e.emusys_aluno_id)
           order by e.fim, e.aluno_nome)
      from enriq e where e.grupo = 'vencido'
  ), '[]'::jsonb)
);
$$;

comment on function public.aviso_previo_pendencias(uuid, date) is
  'Candidatos ativos para o lembrete da Sol. Matricula local ja encerrada e excluida antes da API. Inclui emusys_aviso_previo_id para o consumidor distinguir fonte rastreavel de legado sem remocao observavel.';

revoke all on function public.aviso_previo_pendencias(uuid, date) from public;
revoke all on function public.aviso_previo_pendencias(uuid, date) from anon;
revoke all on function public.aviso_previo_pendencias(uuid, date) from authenticated;
grant execute on function public.aviso_previo_pendencias(uuid, date) to service_role;

create or replace function public.aviso_previo_vencidos(p_unidade_id uuid default null)
returns table (
  id integer, aluno_nome text, unidade_id uuid, unidade_codigo text,
  data date, mes_saida date, fim date, estimada boolean, motivo text,
  observacoes text, professor_nome text, valor_parcela numeric,
  situacao text, aulas_agendadas integer, ultima_agendada date,
  ultima_presenca date, matricula_status text, verificado_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with escolhido as (
    select distinct on (m.unidade_id,
                        coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))))
      m.*, a.status as status_lareport
    from public.movimentacoes_admin m
    join public.alunos a on a.id = m.aluno_id
    where m.tipo = 'aviso_previo'
      and not m.anulado
      and a.unidade_id = m.unidade_id
      and a.status in ('ativo', 'aviso_previo')
      and coalesce(m.data_prevista_saida, m.mes_saida - 1) is not null
      and (p_unidade_id is null or m.unidade_id = p_unidade_id)
    order by m.unidade_id,
             coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))),
             coalesce(m.data_prevista_saida, m.mes_saida - 1) desc,
             m.id desc
  )
  select
    e.id, e.aluno_nome::text, e.unidade_id, u.codigo::text, e.data,
    e.mes_saida, coalesce(e.data_prevista_saida, e.mes_saida - 1) as fim,
    (e.data_prevista_saida is null) as estimada, e.motivo, e.observacoes,
    p.nome::text, coalesce(e.valor_parcela_novo, e.valor_parcela_anterior),
    coalesce(v.situacao, 'nao_verificado'), v.aulas_agendadas,
    v.ultima_agendada, v.ultima_presenca, v.matricula_status, v.verificado_em
  from escolhido e
  left join public.unidades u on u.id = e.unidade_id
  left join public.professores p on p.id = e.professor_id
  left join public.aviso_previo_veredito v on v.movimentacao_id = e.id
  where coalesce(e.data_prevista_saida, e.mes_saida - 1) < current_date
    and coalesce(v.situacao, 'nao_verificado') in ('cobrar', 'divergente', 'nao_verificado')
  order by u.codigo, coalesce(e.data_prevista_saida, e.mes_saida - 1), e.aluno_nome;
$$;

comment on function public.aviso_previo_vencidos(uuid) is
  'Avisos vencidos de alunos ainda operacionais. Nao reapresenta aluno encerrado nem o antigo veredito inferido cancelado; dado nao verificado continua explicito.';

revoke all on function public.aviso_previo_vencidos(uuid) from public;
revoke all on function public.aviso_previo_vencidos(uuid) from anon;
grant execute on function public.aviso_previo_vencidos(uuid) to authenticated;
grant execute on function public.aviso_previo_vencidos(uuid) to service_role;

commit;
