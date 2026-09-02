-- Aviso previo: veredito apurado ao vivo (02/09/2026)
-- Contexto completo: fiscal-mila/daily-notes/2026-09-02.md e a secao
-- "Sol - Lembrete de aviso previo" do CLAUDE.md daquele repo.

-- aviso_previo_vencidos: deduplicar ANTES de filtrar.
--
-- O `where` do SQL roda antes do `distinct on`. Filtrando
-- `situacao <> 'resolvido'` na mesma query da dedup, um aluno cujo aviso
-- escolhido esta resolvido nao sai da lista: a dedup simplesmente CAI para
-- uma duplicata dele que ainda nao foi avaliada, e a aba mostra o mesmo
-- aluno como "nao_verificado" para sempre -- o cron avalia um id, a tela
-- pergunta por outro.
--
-- Medido em 02/09: 5 alunos nesse estado (Victor Henrique tem 3 avisos,
-- os outros 2 cada). Com a dedup isolada em subquery, a escolha passa a
-- ser a MESMA do `aviso_previo_pendencias`, e um aluno resolvido some da
-- aba em vez de reaparecer por uma porta lateral.

create or replace function public.aviso_previo_vencidos(p_unidade_id uuid default null)
returns table (
  id                integer,
  aluno_nome        text,
  unidade_id        uuid,
  unidade_codigo    text,
  data              date,
  mes_saida         date,
  fim               date,
  estimada          boolean,
  motivo            text,
  observacoes       text,
  professor_nome    text,
  valor_parcela     numeric,
  situacao          text,
  aulas_agendadas   integer,
  ultima_agendada   date,
  ultima_presenca   date,
  matricula_status  text,
  verificado_em     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with escolhido as (
    -- Identica a `base` do aviso_previo_pendencias: mesma chave, mesma
    -- ordem, mesmo desempate. Divergir aqui e o bug descrito no topo.
    select distinct on (m.unidade_id,
                        coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))))
      m.*
    from public.movimentacoes_admin m
    where m.tipo = 'aviso_previo'
      and not m.anulado
      and coalesce(m.data_prevista_saida, m.mes_saida - 1) is not null
      and (p_unidade_id is null or m.unidade_id = p_unidade_id)
    order by m.unidade_id,
             coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))),
             coalesce(m.data_prevista_saida, m.mes_saida - 1) desc,
             m.id desc
  )
  select
    e.id,
    e.aluno_nome::text,
    e.unidade_id,
    u.codigo::text,
    e.data,
    e.mes_saida,
    coalesce(e.data_prevista_saida, e.mes_saida - 1)   as fim,
    (e.data_prevista_saida is null)                    as estimada,
    e.motivo,
    e.observacoes,
    p.nome::text                                       as professor_nome,
    coalesce(e.valor_parcela_novo, e.valor_parcela_anterior) as valor_parcela,
    coalesce(v.situacao, 'nao_verificado')             as situacao,
    v.aulas_agendadas,
    v.ultima_agendada,
    v.ultima_presenca,
    v.matricula_status,
    v.verificado_em
  from escolhido e
  left join public.unidades u    on u.id = e.unidade_id
  left join public.professores p on p.id = e.professor_id
  left join public.aviso_previo_veredito v on v.movimentacao_id = e.id
  where coalesce(e.data_prevista_saida, e.mes_saida - 1) < current_date
    and coalesce(v.situacao, 'nao_verificado') <> 'resolvido'
  order by u.codigo, coalesce(e.data_prevista_saida, e.mes_saida - 1), e.aluno_nome;
$$;

comment on function public.aviso_previo_vencidos(uuid) is
  'Avisos previos ja vencidos e ainda nao resolvidos, INDEPENDENTE do mes da tela. Le o veredito apurado pelo cron da Sol; "nao_verificado" = o cron ainda nao passou, nao que esteja resolvido. A dedup e IDENTICA a de aviso_previo_pendencias (unidade+aluno, fim desc, id desc) e roda ANTES do filtro -- divergir faz a tela perguntar por uma linha que o cron nao avaliou.';

revoke all on function public.aviso_previo_vencidos(uuid) from public;
revoke all on function public.aviso_previo_vencidos(uuid) from anon;
grant execute on function public.aviso_previo_vencidos(uuid) to authenticated;
grant execute on function public.aviso_previo_vencidos(uuid) to service_role;
