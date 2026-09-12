-- Em producao este mesmo corpo aparece tambem como a migration 20260912201500: a primeira
-- aplicacao (via MCP) foi enviada sem os comentarios internos, e foi reaplicada com eles
-- para que pg_get_functiondef devolva o mesmo texto deste arquivo (md5 conferido).
-- `via_aluno` comparava colunas que podem ser NULL (whatsapp esta vazio em quase todo
-- cadastro): `false or null` = null, e bool_or de tudo nulo devolve null — o campo de log
-- dizia "nao sei" justamente no caso que ele existe para marcar (o responsavel escreveu).
create or replace function public.resolver_aluno_caixa_por_telefone_v1(
  p_telefone text,
  p_unidade_id uuid default null
) returns jsonb
language sql
stable
as $$
with entrada as (
  select public.fn_normalizar_telefone_br_key(p_telefone) as chave
),
cand as (
  select a.id,
         a.nome,
         a.unidade_id,
         a.status,
         coalesce(a.is_segundo_curso, false) as is_segundo_curso,
         pc.pessoa_chave,
         (a.status in ('ativo','aviso_previo','trancado')) as vivo,
         (coalesce(public.fn_normalizar_telefone_br_key(a.telefone) = e.chave, false)
          or coalesce(public.fn_normalizar_telefone_br_key(a.whatsapp) = e.chave, false)) as via_aluno
  from entrada e
  join public.alunos a
    on e.chave is not null
   and (public.fn_normalizar_telefone_br_key(a.telefone) = e.chave
     or public.fn_normalizar_telefone_br_key(a.whatsapp) = e.chave
     or public.fn_normalizar_telefone_br_key(a.responsavel_telefone) = e.chave)
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
),
-- Matricula viva manda sobre encerrada: ex-aluno e irmao ativo dividindo o numero do
-- responsavel nao pode virar ambiguidade. So quando NENHUMA esta viva o encerrado responde.
vivos as (
  select * from cand
  where vivo or not exists (select 1 from cand where vivo)
),
-- A caixa do Sucesso do Aluno e consolidada (p_unidade_id nulo); caixa de unidade fixa
-- prefere a propria unidade, com fallback global — quem escreve pode ser de outra.
escopo as (
  select * from vivos v
  where p_unidade_id is null
     or v.unidade_id = p_unidade_id
     or not exists (select 1 from vivos v2 where v2.unidade_id = p_unidade_id)
),
-- Pessoa = (unidade_id, pessoa_chave): `alunos` e matricula, entao 2 cursos da mesma
-- pessoa sao 1 so dono. emusys_student_id colide entre unidades, por isso a unidade entra
-- na chave — a mesma id em duas unidades conta como duas pessoas (recusa, nao chute).
pessoas as (
  select count(distinct e.unidade_id::text || '|' || e.pessoa_chave) as qtd from escopo e
),
eleito as (
  select * from escopo
  order by is_segundo_curso, id
  limit 1
)
select case
  when (select count(*) from escopo) = 0
    then jsonb_build_object('status', 'nenhum')
  when (select qtd from pessoas) > 1
    then jsonb_build_object(
      'status', 'ambiguo',
      'candidatos', (
        select jsonb_agg(distinct jsonb_build_object(
          'aluno_id', e.id, 'nome', e.nome, 'unidade_id', e.unidade_id))
        from escopo e
      )
    )
  else jsonb_build_object(
    'status', 'unico',
    'aluno_id', (select id from eleito),
    'nome', (select nome from eleito),
    'unidade_id', (select unidade_id from eleito),
    'via_responsavel', (select not bool_or(via_aluno) from escopo)
  )
end;
$$;

revoke all on function public.resolver_aluno_caixa_por_telefone_v1(text, uuid) from public, anon;
grant execute on function public.resolver_aluno_caixa_por_telefone_v1(text, uuid) to authenticated, service_role;
