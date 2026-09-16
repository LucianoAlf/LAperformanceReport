-- Busca de anamnese orfa na ficha do aluno: passa a ler telefone e nunca volta vazia.
--
-- Contexto (16/09/2026). A anamnese 229 (Maria Eduarda Souza de Miranda, CG) foi salva
-- 3min18s DEPOIS de a matricula nascer, entao trg_vincular_anamnese_na_matricula
-- (AFTER INSERT on alunos) rodou no vazio e nunca mais voltou. A unica saida manual --
-- este botao -- casava por PRIMEIRO NOME, e o cadastro da anamnese tem "Marua", digitado
-- a mao no caminho "aluno novo" do formulario. Resultado: zero candidatas, e a tela
-- afirmando "nenhuma anamnese pendente para este aluno", que e' diferente de
-- "nenhuma casou com a minha regua". Mesma familia de sem_captura virar "fora".
--
-- Duas mudancas:
--   1. telefone normalizado vira sinal (fn_normalizar_telefone_br_key), lendo os quatro
--      campos do aluno -- telefone, whatsapp, responsavel_telefone e aluno_contatos --
--      como ja faz resolver_aluno_caixa_por_telefone_v1. Nenhuma das quatro implementacoes
--      atuais do casamento anamnese<->aluno olhava telefone, e e' justamente o campo que
--      bate digito a digito no caso que motivou isto.
--   2. sem nenhuma semelhanca, devolve as orfas da unidade do aluno em vez de lista vazia
--      (4 em CG, 6 na rede) -- curto o bastante para o olho humano decidir.
--
-- O telefone ORDENA, nunca conclui: 271 grupos de alunos ativos dividem telefone na mesma
-- unidade (irmaos, responsavel financeiro). Por isso esta funcao so SUGERE; a escrita
-- continua sendo vincular_anamnese_aluno, atras do clique em Vincular.
--
-- Muda o RETURNS TABLE (entra telefone_aluno), entao e' drop + create -- e a ACL e'
-- refeita nominalmente logo abaixo, porque o ALTER DEFAULT PRIVILEGES do schema public
-- devolve EXECUTE a anon em toda funcao recriada.

drop function if exists public.buscar_anamneses_pendentes(integer);

create function public.buscar_anamneses_pendentes(p_aluno_id integer)
returns table(
  anamnese_id integer,
  nome_aluno text,
  telefone_aluno text,
  tipo_formulario text,
  unidade_id uuid,
  unidade_nome text,
  temperamento_codinome text,
  created_at timestamp with time zone,
  match_score integer,
  match_label text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome  text;
  v_unid  uuid;
  v_class text;
  v_first text;
begin
  select lower(btrim(al.nome)), al.unidade_id, al.classificacao
    into v_nome, v_unid, v_class
    from alunos al where al.id = p_aluno_id;

  if v_nome is null then
    return;
  end if;

  v_first := split_part(v_nome, ' ', 1);

  return query
  with chaves_do_aluno as (
    -- os quatro campos onde o telefone de uma pessoa mora neste banco
    select distinct fn_normalizar_telefone_br_key(t) as k
      from (
        select a.telefone from alunos a where a.id = p_aluno_id
        union all
        select a.whatsapp from alunos a where a.id = p_aluno_id
        union all
        select a.responsavel_telefone from alunos a where a.id = p_aluno_id
        union all
        select c.telefone from aluno_contatos c where c.aluno_id = p_aluno_id
      ) f(t)
     where coalesce(btrim(t), '') <> ''
       and coalesce(fn_normalizar_telefone_br_key(t), '') <> ''
  ),
  sinais as (
    select
      an.id,
      an.nome_aluno::text        as s_nome_aluno,
      an.telefone_aluno::text    as s_telefone_aluno,
      an.tipo_formulario::text   as s_tipo_formulario,
      an.unidade_id              as s_unidade_id,
      u.nome::text               as s_unidade_nome,
      an.temperamento_codinome::text as s_temperamento_codinome,
      an.created_at              as s_created_at,
      -- os cinco sinais, crus e independentes
      exists (
        select 1 from chaves_do_aluno c
         where c.k = fn_normalizar_telefone_br_key(an.telefone_aluno)
      )                                              as telefone_confere,
      (lower(btrim(an.nome_aluno)) = v_nome)         as nome_exato,
      (lower(an.nome_aluno) like '%' || v_first || '%'
        or v_nome like '%' || lower(split_part(btrim(an.nome_aluno), ' ', 1)) || '%')
                                                     as primeiro_nome_bate,
      (an.unidade_id = v_unid)                       as mesma_unidade,
      (an.tipo_formulario = v_class)                 as tipo_bate
    from anamneses an
    left join unidades u on u.id = an.unidade_id
    where an.aluno_id is null
      and an.vinculo_status = 'pendente'
      and an.status = 'completa'
      -- candidatas: tudo da unidade do aluno (a lista curta que nunca volta vazia)
      -- mais, de outras unidades, apenas o que tem semelhanca real
      and (
        an.unidade_id = v_unid
        or lower(btrim(an.nome_aluno)) = v_nome
        or lower(an.nome_aluno) like '%' || v_first || '%'
      )
  )
  select
    s.id,
    s.s_nome_aluno,
    s.s_telefone_aluno,
    s.s_tipo_formulario,
    s.s_unidade_id,
    s.s_unidade_nome,
    s.s_temperamento_codinome,
    s.s_created_at,

    -- Pontuacao: define a ORDEM em que a recepcao ve os candidatos.
    -- Telefone (50) pesa mais que nome exato (40) porque nome aqui e' digitado a mao no
    -- caminho "aluno novo" do formulario -- foi o que produziu o "Marua" do caso 229 --
    -- enquanto o telefone vem do cadastro e e' normalizado dos dois lados. Assim
    -- "telefone bate, nome nao" (65) fica acima de "nome bate, telefone nao" (55).
    -- Nenhum dos dois conclui nada: 271 grupos de alunos ativos dividem telefone na mesma
    -- unidade, e homonimo existe -- por isso os dois juntos (105) e' que sao o caso limpo.
    (
      (case when s.telefone_confere then 50 else 0 end) +
      (case when s.nome_exato then 40 else 0 end) +
      -- so soma quando NAO e' exato: a condicao de primeiro nome tambem casa o nome inteiro
      (case when s.primeiro_nome_bate and not s.nome_exato then 15 else 0 end) +
      (case when s.mesma_unidade then 10 else 0 end) +
      (case when s.tipo_bate then 5 else 0 end)
    )::integer as s_match_score,

    (case
       when s.telefone_confere and s.nome_exato     then 'Telefone e nome conferem'
       when s.telefone_confere                      then 'Telefone confere'
       when s.nome_exato and s.mesma_unidade        then 'Nome e unidade conferem'
       when s.nome_exato                            then 'Mesmo nome (outra unidade)'
       when s.primeiro_nome_bate                    then 'Nome parecido'
       else 'Sem semelhanca - confira manualmente'
     end)::text as s_match_label
  from sinais s
  -- posicional: dentro de RETURNS TABLE os nomes de saida viram variaveis, e referencia
  -- nao qualificada a match_score ficaria ambigua
  order by 9 desc, 8 desc
  limit 20;
end;
$function$;

revoke all on function public.buscar_anamneses_pendentes(integer) from public, anon;
grant execute on function public.buscar_anamneses_pendentes(integer) to authenticated, service_role;
