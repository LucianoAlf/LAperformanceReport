-- Vínculo estruturado (aluno_id + fatura_id) também no lançamento SIMPLES.
--
-- O QUE FALTAVA: desde o PR #193 `caixa_movimentacoes` tem `aluno_id`/`fatura_id`, e
-- `sol_caixa_lancar_recebimento` já lê os dois do payload, valida contra a unidade e grava.
-- Só que o runtime nunca os enviava no caminho simples — só o LOTE (irmãos) preenchia.
-- Medido em 24/08 no caixa da Barra: o lote Thiago+Matheus gravou aluno_id 2351/2352 com
-- fatura, enquanto os lançamentos avulsos do MESMO dia (Pedro Morais 17:56, Olivia 12:19)
-- ficaram com aluno_id null.
--
-- 🔴 A ARMADILHA QUE ESTA MIGRATION EXISTE PARA EVITAR: `alunos` é MATRÍCULA, não pessoa.
-- O caminho óbvio seria pegar o `aluno_id` que `sol_caixa_casar_parcela` já devolve — e ele
-- está ERRADO para quem tem mais de um curso. Prova medida (Recreio, 24/08):
--   Valentina Mendes Rodrigues Aleixo tem 3 matrículas — 697 Canto, 1099 Teclado,
--   1542 Power Kids. `sol_caixa_casar_parcela` devolveu `aluno_id: 1542` (Power Kids,
--   curso que não tem UMA fatura na janela) junto com a fatura de **Canto**.
-- Motivo: a função acha a matrícula por `word_similarity` do NOME com `limit 1` (as 3
-- linhas têm nome idêntico, o desempate é arbitrário), mas acha a fatura por
-- `emusys_student_id`, que é a PESSOA. Os dois lados discordam de curso, em silêncio.
--
-- A REGRA: **aluno_id vem da FATURA escolhida, nunca do match por nome.** O elo autoritativo
-- é `emusys_faturas.emusys_matricula_id` -> `alunos.emusys_matricula_id`, que carrega o curso
-- junto. Conferido na Valentina: fatura de Canto -> matrícula 958 -> aluno 697 (Canto);
-- fatura de Teclado -> matrícula 1232 -> aluno 1099 (Teclado). Cobertura na base: 3.095 de
-- 3.225 faturas desde jul/2026 (96%) têm o elo limpo.
--
-- ⚠️ As 116 faturas sem `emusys_matricula_id` NÃO são defeito — são ingresso, passaporte
-- avulso, locação e rateio, que o Emusys manda com `matricula_id: 0` (ver CLAUDE.md). Nesses
-- o vínculo fica NULL de propósito: melhor sem link do que com link errado.
--
-- ⚠️ Nada aqui muda valor, categoria, forma ou saldo de caixa. É só granularidade de
-- reconciliação. Campos ADITIVOS: o `aluno_id` de topo (match por nome) continua existindo
-- e intocado para quem já lia — o novo mora DENTRO do objeto da fatura/parcela, onde a
-- semântica é inequívoca ("a matrícula dona desta fatura").
--
-- Consumidores conferidos antes de mexer: só o runtime da Sol (`caixa-financeiro.cjs`).
-- Nenhuma edge function e nenhum arquivo do `src/` chama estas duas RPCs.

-- == Helper único (DRY): a matrícula dona de uma fatura =============================
create or replace function public.sol_caixa_aluno_da_fatura_v1(p_unidade_id uuid, p_fatura_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  -- order by a.id: existe UM caso na base inteira de duas linhas de `alunos` com o mesmo
  -- emusys_matricula_id (Leonardo Imperial / "Leonardo imperial", Violão, mesma matrícula
  -- 784) — é duplicata de cadastro, não segundo curso, então qualquer das duas aponta para
  -- a mesma coisa real. Desempate determinístico em vez de devolver linha ao acaso.
  select a.id
  from public.emusys_faturas f
  join public.alunos a
    on a.emusys_matricula_id = f.emusys_matricula_id::text
   and a.unidade_id = f.unidade_id
  where f.id = p_fatura_id
    and f.unidade_id = p_unidade_id
    and f.emusys_matricula_id is not null
  order by a.id
  limit 1;
$function$;

revoke all on function public.sol_caixa_aluno_da_fatura_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sol_caixa_aluno_da_fatura_v1(uuid, uuid) to service_role, sol_acesso_restrito;

-- == `sol_caixa_parcela_canonica`: expõe a matrícula dona da fatura escolhida =======
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_parcela_canonica';

  if position('sol_caixa_aluno_da_fatura_v1' in v_def) > 0 then
    raise notice 'canonica ja expoe aluno_id'; return;
  end if;

  v_new := replace(v_def,
    $a$    'fatura', jsonb_build_object(
      'canonical_fatura_id', v_esc->>'canonical_fatura_id',$a$,
    $a$    'fatura', jsonb_build_object(
      'aluno_id', public.sol_caixa_aluno_da_fatura_v1(p_unidade_id, nullif(v_esc->>'canonical_fatura_id','')::uuid),
      'canonical_fatura_id', v_esc->>'canonical_fatura_id',$a$);

  if v_new = v_def then raise exception 'ancora do objeto fatura da canonica nao encontrada'; end if;
  execute v_new;
end $mig$;

-- == `sol_caixa_casar_parcela`: idem, dentro do objeto `parcela` ====================
do $mig2$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_casar_parcela';

  if position('sol_caixa_aluno_da_fatura_v1' in v_def) > 0 then
    raise notice 'casar ja expoe aluno_id da fatura'; return;
  end if;

  v_new := replace(v_def,
    $b$    'parcela', jsonb_build_object(
      'fatura_id', v_fat.id,$b$,
    $b$    'parcela', jsonb_build_object(
      'aluno_id', public.sol_caixa_aluno_da_fatura_v1(p_unidade_id, v_fat.id),
      'fatura_id', v_fat.id,$b$);

  if v_new = v_def then raise exception 'ancora do objeto parcela nao encontrada'; end if;
  execute v_new;
end $mig2$;

-- == `sol_caixa_identificar_aluno_novo_v1`: só vincula quando NÃO há ambiguidade ====
-- Aqui não existe fatura para ancorar (é passaporte de quem está entrando). O `limit 1`
-- por nome tem exatamente o mesmo defeito da Valentina, então o id só sai quando a pessoa
-- tem UMA matrícula ativa na unidade. Com duas ou mais, o card continua identificando pelo
-- nome (que é o que a secretaria lê) e o vínculo estruturado fica NULL — sem chute.
create or replace function public.sol_caixa_identificar_aluno_novo_v1(p_unidade_id uuid, p_nome text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_in text := unaccent(lower(btrim(coalesce(p_nome, ''))));
  v_r record;
  v_matriculas int;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif length(v_in) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'nome_curto');
  end if;

  select a.id, a.nome, a.responsavel_nome, a.emusys_student_id,
         word_similarity(v_in, unaccent(lower(a.nome_normalizado)))::numeric as sim
    into v_r
  from public.alunos a
  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike 'ativo%' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc
  limit 1;
  if v_r.id is not null and coalesce(v_r.sim, 0) >= 0.62 then
    -- quantas matriculas ativas a MESMA pessoa tem nesta unidade
    select count(*) into v_matriculas
    from public.alunos a
    where a.unidade_id = p_unidade_id
      and (a.status ilike 'ativo%' or a.status is null)
      and (
        (v_r.emusys_student_id is not null and a.emusys_student_id = v_r.emusys_student_id)
        or (v_r.emusys_student_id is null and a.id = v_r.id)
      );

    return jsonb_build_object('ok', true, 'origem', 'aluno_matriculado',
      'aluno_id', case when coalesce(v_matriculas, 1) = 1 then v_r.id else null end,
      'matriculas_ativas', coalesce(v_matriculas, 1),
      'motivo_sem_vinculo', case when coalesce(v_matriculas, 1) > 1 then 'multiplas_matriculas' end,
      'nome', v_r.nome,
      'responsavel_nome', nullif(btrim(coalesce(v_r.responsavel_nome, '')), ''),
      'confianca', round(v_r.sim, 2),
      'rotulo', 'aluno matriculado');
  end if;

  select le.id, le.nome_aluno as nome, le.status, le.data_experimental,
         word_similarity(v_in, unaccent(lower(le.nome_aluno)))::numeric as sim
    into v_r
  from public.lead_experimentais le
  where le.unidade_id = p_unidade_id
    and le.nome_aluno is not null
  order by word_similarity(v_in, unaccent(lower(le.nome_aluno))) desc
  limit 1;
  if v_r.id is not null and coalesce(v_r.sim, 0) >= 0.62 then
    return jsonb_build_object('ok', true, 'origem', 'experimental',
      'lead_experimental_id', v_r.id, 'nome', v_r.nome,
      'status_experimental', v_r.status, 'data_experimental', v_r.data_experimental,
      'confianca', round(v_r.sim, 2),
      'rotulo', 'aluno novo (fez experimental)');
  end if;

  select l.id, l.nome, l.status,
         word_similarity(v_in, unaccent(lower(l.nome)))::numeric as sim
    into v_r
  from public.leads l
  where l.unidade_id = p_unidade_id
    and l.nome is not null
  order by word_similarity(v_in, unaccent(lower(l.nome))) desc
  limit 1;
  if v_r.id is not null and coalesce(v_r.sim, 0) >= 0.72 then
    return jsonb_build_object('ok', true, 'origem', 'lead',
      'lead_id', v_r.id, 'nome', v_r.nome, 'status_lead', v_r.status,
      'confianca', round(v_r.sim, 2),
      'rotulo', 'aluno novo (lead do funil)');
  end if;

  return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado_em_nenhuma_fonte');
end;
$function$;

revoke all on function public.sol_caixa_identificar_aluno_novo_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.sol_caixa_identificar_aluno_novo_v1(uuid, text) to service_role, sol_acesso_restrito;
