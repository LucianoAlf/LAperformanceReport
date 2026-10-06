-- SUGESTÃO DE ALUNO PARECIDO — só leitura, só para a Sol PERGUNTAR (06/10/2026).
--
-- 🔴 O CASO. CG, 05/10: comprovante de dois alunos, um nome digitado com uma
--    letra a mais no primeiro nome. `sol_caixa_responsavel_aluno` exige o
--    primeiro nome "da mesma pessoa" (`sol_nome_mesma_pessoa_v1`, trigram
--    >= 0,8) e um "z" a mais derruba para ~0,6 -> `aluno_nao_encontrado`. A Sol
--    respondeu "confere o nome completo" e a equipe, que via o nome certo,
--    travou 3 vezes e descartou o comprovante.
--
-- ⚠️ ESTA FUNÇÃO NÃO RESOLVE NADA. Ela não entra na cascata do resolver e não
--    afrouxa a regra de identidade. Só devolve até 4 nomes PARECIDOS da MESMA
--    unidade para a Sol perguntar "É Fulana?". Quem decide é o humano ("sim"),
--    e depois disso o resolver roda de novo com o nome do CADASTRO — passando
--    pela mesma régua de sempre (fatura, valor, competência, preview, pode).
--
-- ⚠️ REGRA DE CANDIDATO (conservadora de propósito):
--    • precisa de primeiro nome E sobrenome digitados (>= 3 letras cada): só o
--      primeiro nome não aponta pessoa;
--    • primeiro nome parecido (trigram >= 0,5; uma letra dobrada a mais fica ~0,6);
--    • ÚLTIMO nome digitado presente no cadastro (word_similarity >= 0,8) —
--      é a trava contra trocar de família;
--    • mesma elegibilidade do resolver (`sol_caixa_aluno_pode_pagar_v1`):
--      sugerir quem o resolver depois recusa seria beco sem saída;
--    • nunca devolve o próprio nome digitado.
--    Medido em 06/10 (SELECT-only, todas as unidades): 1.290 de 1.375 alunos
--    elegíveis não têm NENHUM vizinho por esta regra; 59 têm 1 e 26 têm 2+
--    (em geral irmãos — por isso a pergunta mostra o nome e exige "sim").
--
-- ⚠️ STABLE + SECURITY DEFINER + execute só para service_role e
--    sol_acesso_restrito (o mesmo ACL do resolver). Não grava nada.

create or replace function public.sol_caixa_sugerir_aluno_parecido_v1(
  p_unidade_id uuid,
  p_nome       text
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_in    text;
  v_tok   text[];
  v_pri   text;
  v_ult   text;
  v_cands jsonb;
begin
  v_in := lower(unaccent(coalesce(p_nome, '')));
  v_in := btrim(regexp_replace(regexp_replace(v_in, '[^a-z ]', ' ', 'g'), '\s+', ' ', 'g'));
  v_tok := array_remove(regexp_split_to_array(v_in, ' '), '');

  if p_unidade_id is null or coalesce(array_length(v_tok, 1), 0) < 2 then
    return jsonb_build_object('ok', true, 'motivo', 'nome_curto_demais', 'candidatos', '[]'::jsonb);
  end if;
  v_pri := v_tok[1];
  v_ult := v_tok[array_length(v_tok, 1)];
  if length(v_pri) < 3 or length(v_ult) < 3 then
    return jsonb_build_object('ok', true, 'motivo', 'nome_curto_demais', 'candidatos', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('aluno_nome', c.nome, 'similaridade', c.sim)
                            order by c.sim desc, c.nome), '[]'::jsonb)
    into v_cands
  from (
    select b.nome, b.sim
    from (
      select distinct on (lower(a.nome_normalizado))
             a.nome::text as nome,
             round(similarity(v_in, lower(a.nome_normalizado))::numeric, 2) as sim
        from public.alunos a
       where a.unidade_id = p_unidade_id
         and a.nome_normalizado is not null
         and public.sol_caixa_aluno_pode_pagar_v1(a.status, a.unidade_id, a.emusys_student_id)
         and similarity(v_pri, split_part(lower(btrim(a.nome_normalizado)), ' ', 1)) >= 0.5
         and word_similarity(v_ult, lower(a.nome_normalizado)) >= 0.8
         and btrim(regexp_replace(lower(a.nome_normalizado), '[^a-z ]', ' ', 'g')) <> v_in
       order by lower(a.nome_normalizado),
                public.sol_caixa_aluno_matriculado_v1(a.status) desc
    ) b
    order by b.sim desc, b.nome
    limit 4
  ) c;

  return jsonb_build_object('ok', true, 'candidatos', v_cands);
end;
$function$;

comment on function public.sol_caixa_sugerir_aluno_parecido_v1(uuid, text) is
  'Sol/Caixa: até 4 alunos da MESMA unidade com nome parecido ao digitado (primeiro nome ~, último nome presente), mesma elegibilidade do resolver. Só leitura; serve para a Sol PERGUNTAR, nunca para resolver.';

revoke all on function public.sol_caixa_sugerir_aluno_parecido_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.sol_caixa_sugerir_aluno_parecido_v1(uuid, text)
  to service_role, sol_acesso_restrito;
