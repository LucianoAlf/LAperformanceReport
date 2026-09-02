-- Aviso previo: veredito apurado ao vivo (02/09/2026)
-- Contexto completo: fiscal-mila/daily-notes/2026-09-02.md e a secao
-- "Sol - Lembrete de aviso previo" do CLAUDE.md daquele repo.

-- ⚠️ SUPERSEDIDA por 20260902144053 (dedup precisa rodar ANTES do filtro).
-- Mantida porque foi aplicada em producao com esta version.
--
-- As 3 sub-abas atuais (Todos / Registrados no mes / Saida no mes) apenas
-- refiltram o array que a pagina ja carregou do MES. Os avisos que
-- incomodam sao de meses anteriores -- o do Tito e de 01/08 com saida em
-- setembro, os do Arthur e da Alana sao de maio -- e nenhum deles esta
-- naquele array. Por isso esta funcao faz consulta PROPRIA, ignorando o
-- periodo da tela.

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
  select distinct on (coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))))
    m.id, m.aluno_nome::text, m.unidade_id, u.codigo::text, m.data, m.mes_saida,
    coalesce(m.data_prevista_saida, m.mes_saida - 1)   as fim,
    (m.data_prevista_saida is null)                    as estimada,
    m.motivo, m.observacoes, p.nome::text              as professor_nome,
    coalesce(m.valor_parcela_novo, m.valor_parcela_anterior) as valor_parcela,
    coalesce(v.situacao, 'nao_verificado')             as situacao,
    v.aulas_agendadas, v.ultima_agendada, v.ultima_presenca,
    v.matricula_status, v.verificado_em
  from public.movimentacoes_admin m
  left join public.unidades u   on u.id = m.unidade_id
  left join public.professores p on p.id = m.professor_id
  left join public.aviso_previo_veredito v on v.movimentacao_id = m.id
  where m.tipo = 'aviso_previo'
    and not m.anulado
    and coalesce(m.data_prevista_saida, m.mes_saida - 1) is not null
    and coalesce(m.data_prevista_saida, m.mes_saida - 1) < current_date
    and coalesce(v.situacao, 'nao_verificado') <> 'resolvido'
    and (p_unidade_id is null or m.unidade_id = p_unidade_id)
  order by coalesce(m.aluno_id::text, unaccent(lower(trim(m.aluno_nome)))),
           coalesce(m.data_prevista_saida, m.mes_saida - 1) desc;
$$;

revoke all on function public.aviso_previo_vencidos(uuid) from public;
revoke all on function public.aviso_previo_vencidos(uuid) from anon;
grant execute on function public.aviso_previo_vencidos(uuid) to authenticated;
grant execute on function public.aviso_previo_vencidos(uuid) to service_role;
