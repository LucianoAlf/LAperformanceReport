-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- PENDENCIA DE REGISTRO — a entidade que faltava.
-- Hoje "aula sem relatorio" nao existe no banco: e a AUSENCIA de um texto. Nao se cobra o que
-- nao e uma linha. Grao = AULA x ALUNO (a verdade do prontuario). A entrega agrupa por aula.
--
-- NASCE:  aula terminou + nao cancelada + aluno no roster + aluno NAO faltou + sem registro
--         no alvo individual dele (anotacoes_fabio OU anotacoes do Emusys vazios).
-- MORRE:  sozinha, quando chega o texto (do Fabio ou do Emusys). Ninguem precisa "resolver".

-- Linha de corte da ANISTIA (D-G1, decidido pelo Alf): o bot nao cobra o passivo.
create or replace function public.fn_data_corte_cobranca()
returns date language sql immutable parallel safe
as $$ select date '2026-07-21' $$;

comment on function public.fn_data_corte_cobranca() is
  'Anistia D-G1: o Fabio so cobra registro de aulas a partir desta data. O passivo (ex: Ramon, 621 aulas) fica no banco como municao da coordenacao, mas o bot nao cobra.';

drop view if exists public.vw_registro_pendencia;
create view public.vw_registro_pendencia
with (security_invoker = true)
as
select
  ae.professor_id,
  ae.professor_nome,
  ae.unidade_id,
  ae.id            as aula_ancora_id,
  alvo.id          as aula_alvo_id,          -- onde o texto DESTE aluno deve ser gravado
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  ae.curso_nome,
  public.fn_curso_base(ae.curso_nome) as curso_base,
  ae.turma_nome,
  ae.tipo,
  r.aluno_id,
  al.nome          as aluno_nome,
  split_part(btrim(al.nome),' ',1) as aluno_primeiro_nome,
  ap.status_presenca,
  (ap.id is not null) as chamada_feita,
  floor(extract(epoch from (now() - ae.data_hora_fim)) / 86400)::int as dias_em_atraso,
  (ae.data_aula >= public.fn_data_corte_cobranca()) as cobravel   -- anistia
from public.aulas_emusys ae
join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
join public.alunos al on al.id = r.aluno_id
left join public.aluno_presenca ap on ap.aula_emusys_id = ae.id and ap.aluno_id = r.aluno_id
join lateral (
  -- a aula individual do aluno no mesmo slot; se nao houver, a propria (turma de 1)
  select coalesce(
    (select i.id from public.aulas_emusys i
      join public.aula_alunos_emusys ri on ri.aula_emusys_id = i.id and ri.aluno_id = r.aluno_id
     where i.tipo = 'individual'
       and i.unidade_id = ae.unidade_id
       and i.data_hora_inicio = ae.data_hora_inicio
       and i.professor_id is not distinct from ae.professor_id
       and coalesce(i.cancelada,false) = false
     order by i.id limit 1),
    ae.id) as id
) alvo_id on true
join public.aulas_emusys alvo on alvo.id = alvo_id.id
where ae.tipo = 'turma' or not exists (          -- 1 linha por aluno: usa a ancora quando ha turma
        select 1 from public.aulas_emusys t
         where t.tipo='turma' and t.unidade_id=ae.unidade_id
           and t.data_hora_inicio=ae.data_hora_inicio
           and t.professor_id is not distinct from ae.professor_id
           and coalesce(t.cancelada,false)=false)
  and ae.professor_id is not null
  and coalesce(ae.cancelada,false) = false
  and ae.data_hora_fim < now()                                   -- a aula ja acabou
  and coalesce(ap.status_presenca, 'presente') <> 'falta'        -- quem faltou nao gera pendencia
  and coalesce(ap.status, 'presente') <> 'ausente'
  and nullif(btrim(coalesce(alvo.anotacoes_fabio, alvo.anotacoes, '')), '') is null;  -- SEM registro

revoke all on public.vw_registro_pendencia from public, anon;
grant select on public.vw_registro_pendencia to authenticated, service_role;

comment on view public.vw_registro_pendencia is
  'Aula x aluno sem registro pedagogico. Grao = aluno (verdade do prontuario). Use cobravel=true para o que o Fabio pode cobrar (anistia D-G1).';
