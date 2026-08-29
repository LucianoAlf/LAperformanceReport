-- RAIZ do "responsável/aluno de outra família" no caixa da Sol.
--
-- ⚠️ CONTEXTO IMPORTANTE PARA QUEM LER DEPOIS: entre 28 e 29/08 eu corrigi esse
-- sintoma CINCO vezes pondo guarda no CONSUMIDOR (runtime da Sol: R1, R2, R3, R7,
-- R8). Isso é contenção, não raiz — cada consumidor novo nasce exposto de novo, e
-- a RPC continua mentindo para quem confiar nela. Esta migration ataca a origem.
--
-- MEDIDO na base de produção (alunos ativos, pares dentro da mesma unidade):
--   pares que o corte atual (word_similarity >= 0.45) aceita ......... 2.264
--   destes, com PRIMEIRO NOME diferente (pessoas distintas) .......... 1.646  (72,7%)
--
-- Ou seja: a MAIORIA do que a regra aceitava era gente diferente. O caso real de
-- 29/08 (Mayra/CG) não foi azar:
--   word_similarity('soraia da silveira duarte', 'laura sobreira da silveira') = 0.50
-- Passava do corte, e a responsável financeira da Laura (Rayanne do Nascimento
-- Sobreira) entrou no card, no lançamento e no fechamento da Soraia — que é LEAD
-- e não tem responsável cadastrado.
--
-- POR QUE ACONTECE: `word_similarity` mede PALAVRAS COMPARTILHADAS, não identidade.
-- "da silveira" em comum já leva a 0.50. Nenhum humano confunde Soraia com Laura.
--
-- REGRA NOVA: o PRIMEIRO NOME tem de bater (posição 1 contra posição 1), tolerando
-- erro de digitação (similarity >= 0.8). Efeito medido: bloqueia os 1.646 pares
-- cruzados e mantém 618, com ZERO falso-bloqueio entre pares de mesmo primeiro nome.
--
-- ⚠️ NÃO BASTA "o primeiro nome aparece em algum lugar do candidato": medido, essa
-- variante deixa passar "Rafael Souto Machado" -> "Zion RAFAEL Machado Kuerques",
-- porque o nome vira sobrenome do meio. Tem de ser posição 1 contra posição 1.
--
-- ⚠️ AMBIGUIDADE VIRA RECUSA, NÃO SORTEIO. Sobram 108 pares de pessoas distintas
-- com o mesmo primeiro nome (ex.: "Maria Flor Silva da Conceição" x "Maria Luisa
-- Silva da Conceição"). O `limit 1` escolhia uma no desempate e devolvia ok:true.
-- Agora empate entre pessoas diferentes devolve ok:false + motivo 'ambiguo' com os
-- candidatos — a Sol pergunta em vez de chutar.
--
-- ⚠️ Isto NÃO substitui as guardas do runtime: elas continuam como segunda linha
-- (defesa em profundidade). O que muda é que a primeira linha parou de mentir.

begin;

create or replace function public.sol_nome_mesma_pessoa_v1(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with n as (
    select split_part(btrim(unaccent(lower(coalesce(p_a,'')))), ' ', 1) as a,
           split_part(btrim(unaccent(lower(coalesce(p_b,'')))), ' ', 1) as b
  )
  select case
    when (select a from n) = '' or (select b from n) = '' then false
    when (select a from n) = (select b from n) then true
    -- tolera typo curto no primeiro nome ("Sorai" ~ "Soraia"), nunca troca de pessoa
    else similarity((select a from n), (select b from n)) >= 0.8
  end;
$function$;

comment on function public.sol_nome_mesma_pessoa_v1(text, text) is
  'Primeiro nome bate (posicao 1 x posicao 1, tolerando typo >= 0.8)? word_similarity '
  'sozinho mede palavras compartilhadas, nao identidade: Soraia da Silveira Duarte x '
  'Laura Sobreira da Silveira = 0.50. Medido em producao: 72,7% dos pares aceitos pelo '
  'corte de 0.45 eram pessoas diferentes.';

revoke all on function public.sol_nome_mesma_pessoa_v1(text, text) from public, anon;
grant execute on function public.sol_nome_mesma_pessoa_v1(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) responsável do aluno: exige primeiro nome + declara ambiguidade
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sol_caixa_responsavel_aluno(p_unidade_id uuid, p_aluno text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_in text := unaccent(lower(coalesce(p_aluno,'')));
  v_alu record;
  v_sim numeric;
  v_outros int;
  v_cands text[];
begin
  if length(btrim(v_in)) < 2 then return jsonb_build_object('ok', false, 'motivo','sem_nome'); end if;

  select a.id, a.nome, a.responsavel_nome, a.responsavel_parentesco,
         word_similarity(v_in, unaccent(lower(a.nome_normalizado)))::numeric sim
    into v_alu
  from alunos a
  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike 'ativo%' or a.status is null)
    -- RAIZ: primeiro nome tem de bater. Sem isto o fuzzy entrega outra familia.
    and public.sol_nome_mesma_pessoa_v1(v_in, a.nome_normalizado)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc,
           (a.status ilike 'ativo%') desc
  limit 1;

  if v_alu.id is null then return jsonb_build_object('ok', false, 'motivo','aluno_nao_encontrado'); end if;
  v_sim := coalesce(v_alu.sim, 0);
  if v_sim < 0.45 then
    return jsonb_build_object('ok', false, 'motivo','aluno_baixa_confianca', 'confianca_nome', round(v_sim,2));
  end if;

  -- Empate entre PESSOAS DIFERENTES vira recusa, nunca sorteio do `limit 1`.
  select count(distinct unaccent(lower(a.nome))), array_agg(distinct a.nome)
    into v_outros, v_cands
  from alunos a
  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike 'ativo%' or a.status is null)
    and public.sol_nome_mesma_pessoa_v1(v_in, a.nome_normalizado)
    and word_similarity(v_in, unaccent(lower(a.nome_normalizado))) >= greatest(v_sim - 0.05, 0.45)
    and unaccent(lower(a.nome)) <> unaccent(lower(v_alu.nome));

  if coalesce(v_outros,0) > 0 then
    return jsonb_build_object('ok', false, 'motivo','ambiguo',
      'confianca_nome', round(v_sim,2),
      'candidatos', to_jsonb(array_prepend(v_alu.nome, coalesce(v_cands, array[]::text[]))));
  end if;

  return jsonb_build_object('ok', true, 'aluno_nome', v_alu.nome,
    'responsavel_nome', nullif(btrim(coalesce(v_alu.responsavel_nome,'')),''),
    'responsavel_parentesco', nullif(btrim(coalesce(v_alu.responsavel_parentesco,'')),''),
    'confianca_nome', round(v_sim,2));
end $function$;

revoke execute on function public.sol_caixa_responsavel_aluno(uuid, text) from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) casar_parcela: MESMO corte de 0.45, e foi ela quem nomeou "Laura" para a
--    consulta "Soraia". Injetado por replace COM GUARDA sobre o corpo vivo —
--    nunca transcrito à mão (é função grande, com regra financeira dentro).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.sol_caixa_casar_parcela(uuid,text,numeric,text)'::regprocedure);
  v_ancora text := '  where a.unidade_id = p_unidade_id
    and a.emusys_student_id is not null
    and a.nome_normalizado is not null
    and (a.status ilike ''ativo%'' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc,';
  v_novo text := '  where a.unidade_id = p_unidade_id
    and a.emusys_student_id is not null
    and a.nome_normalizado is not null
    and (a.status ilike ''ativo%'' or a.status is null)
    -- RAIZ (29/08): word_similarity mede palavras compartilhadas, nao identidade.
    -- "soraia da silveira duarte" x "laura sobreira da silveira" = 0.50 e passava.
    -- O primeiro nome tem de bater.
    and public.sol_nome_mesma_pessoa_v1(v_in, a.nome_normalizado)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc,';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_n <> 1 then
    raise exception 'ANCORA casar_parcela: esperava 1 ocorrencia, achei %. Corpo mudou - revisar.', v_n;
  end if;
  execute replace(v_def, v_ancora, v_novo);
end $$;

revoke execute on function public.sol_caixa_casar_parcela(uuid,text,numeric,text) from anon;

commit;
