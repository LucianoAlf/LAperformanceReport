-- sol_caixa_resolver_envelope_v1: janela alcança o mês declarado e fonte indisponível
-- deixa de virar "nenhuma fatura" (28/09/2026).
--
-- 🔴 DUAS RAÍZES, medidas na bateria contra o banco real (28/09):
--   1) A JANELA ERA FIXA NO MÊS CORRENTE (jul–set). "PG parcela 10/26 Aluno:
--      Iolanda … R$ 380,00" respondia `nenhuma_fatura_aberta` SEMPRE, com a fatura
--      de outubro existindo (sol_faturas_alunos_v1 com fim em outubro a devolve).
--      Parcela paga adiantada é rotina; o agent-first nunca a alcançava.
--      Agora a janela termina no mês declarado mais adiante (teto: +2 meses) e,
--      quando passa do corrente, soma a janela corrente — o atrasado de julho não
--      some porque alguém também pagou outubro.
--   2) A FUNÇÃO NUNCA CONFERIA A FONTE. `get_faturas_alunos_financeiro_v1`
--      responde `status` ok|partial|stale; com universo vazio e fonte `stale`, a
--      resposta era "nenhuma fatura" — afirmação falsa sobre o Emusys. Agora é
--      `fonte_indisponivel` (o runtime diz "tenta de novo em instantes").
--      Com fatura encontrada nada muda: o card e o "pode" seguem com as
--      guardas de sempre.
--
-- Custo: 1 chamada extra de sol_faturas_alunos_v1 SÓ quando o texto declara mês
-- posterior ao corrente (medido: 0,2–0,6 s por chamada; volume: poucos/dia).
--
-- Aplicação: lê a definição viva e troca trechos com guarda de contagem — não
-- transcreve o corpo à mão (regra do CLAUDE.md). CREATE OR REPLACE preserva
-- dono, grants e os SET do cabeçalho.

do $mig$
declare
  d text := pg_get_functiondef('public.sol_caixa_resolver_envelope_v1(uuid,jsonb)'::regprocedure);
  n int;
  a1 text := $a$  v_linhas  jsonb;
begin$a$;
  b1 text := $b$  v_linhas  jsonb;
  v_fim     date;
  v_env2    jsonb;
begin$b$;
  a2 text := $a$  v_env := public.sol_faturas_alunos_v1(
    p_unidade_id, extract(year from v_as_of)::int, extract(month from v_as_of)::int,
    'janela_3', 'todas', v_as_of);$a$;
  b2 text := $b$  v_env := public.sol_faturas_alunos_v1(
    p_unidade_id, extract(year from v_as_of)::int, extract(month from v_as_of)::int,
    'janela_3', 'todas', v_as_of);

  -- Mês declarado mais adiante (parcela adiantada), com teto de +2 meses.
  select max(to_date('01/' || c, 'DD/MM/YYYY')) into v_fim
    from jsonb_array_elements(v_filtros) f,
         lateral jsonb_array_elements_text(
           case when jsonb_typeof(f->'competencias') = 'array' then f->'competencias' else '[]'::jsonb end) c
   where c ~ '^(0[1-9]|1[0-2])/[0-9]{4}$';
  v_fim := least(v_fim, (date_trunc('month', v_as_of) + interval '2 month')::date);
  if v_fim is not null and v_fim > date_trunc('month', v_as_of)::date then
    v_env2 := public.sol_faturas_alunos_v1(
      p_unidade_id, extract(year from v_fim)::int, extract(month from v_fim)::int,
      'janela_3', 'todas', v_as_of);
    v_env := jsonb_set(v_env, '{items}',
      coalesce(v_env->'items', '[]'::jsonb) || coalesce((
        select jsonb_agg(i2) from jsonb_array_elements(coalesce(v_env2->'items', '[]'::jsonb)) i2
         where not exists (select 1 from jsonb_array_elements(coalesce(v_env->'items', '[]'::jsonb)) i1
                            where i1->>'canonical_fatura_id' = i2->>'canonical_fatura_id')), '[]'::jsonb));
    if coalesce(v_env2->>'status', '') = 'stale' then
      v_env := jsonb_set(v_env, '{status}', '"stale"');
    end if;
  end if;$b$;
  a3 text := $a$  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma_fatura_aberta',$a$;
  b3 text := $b$  if v_n = 0 and coalesce(v_env->>'status', '') not in ('ok', 'partial') then
    -- Fonte desatualizada/indisponível: "não achei" não é "não existe".
    return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel',
      'fonte_status', v_env->>'status', 'filtros', v_filtros);
  end if;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma_fatura_aberta',$b$;
begin
  if position('v_env2' in d) > 0 then
    raise notice 'ja aplicada';
    return;
  end if;
  n := (length(d) - length(replace(d, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'ancora a1 esperava 1, achou %', n; end if;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'ancora a2 esperava 1, achou %', n; end if;
  n := (length(d) - length(replace(d, a3, ''))) / length(a3);
  if n <> 1 then raise exception 'ancora a3 esperava 1, achou %', n; end if;
  d := replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
  execute d;
end
$mig$;
