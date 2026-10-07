-- Sol · caixa: o "pode" do lote multi-aluno revalida na MESMA janela que montou o card
-- (29/09/2026, CG 11:55, "PG pix diferença de passaportes de <irmão A> e <irmã B> - LA CG R$400,00").
--
-- 🔴 O que aconteceu: o card saiu certo — duas faturas de passaporte de R$ 200, pagas em 28/09,
--    competência 10/2026 (achadas pelo fallback "mês seguinte" da 20260929140000 / #534). No "pode",
--    `sol_caixa_validar_multi_aluno_snapshot_v1` buscou a fatura só em `sol_faturas_alunos_v1`
--    do MÊS CORRENTE (janela_3 = 07..09) e respondeu `snapshot_fatura_nao_encontrada`. Nada gravado.
--    O preview foi ampliado em 28–29/09 (20260928180000, 20260929140000); o revalidador, não.
--    Duas janelas para a mesma fatura = card que promete e "pode" que recusa.
-- ✅ Agora: se algum item COM fatura declara competência além do mês corrente, o revalidador soma
--    ao universo a janela desse mês, com o MESMO teto do resolver (+2 meses). Sem item futuro,
--    nada muda (mesma chamada, mesmo custo).
-- ⚠️ Fail-closed: a janela estendida precisa estar `ok`/`partial`; senão `fonte_indisponivel`.
--    Casamento continua EXATO (canonical_fatura_id + emusys_student_id); universo maior não cria
--    vínculo novo, só deixa o revalidador enxergar a fatura que o card já escolheu.
-- ⚠️ Cobre também `sol_caixa_lancar_recebimento_lote_v1`, que chama este validador por dentro.
-- Mudança mínima por replace() com guarda de contagem sobre a definição VIVA.

do $mig$
declare
  v_def   text := pg_get_functiondef('public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date)'::regprocedure);
  v_a     text := $a$  if v_status_env is null or v_status_env not in ('ok','partial') then
    return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel', 'status_fonte', v_status_env);
  end if;
$a$;
  v_bloco text := $f$
  -- Janela do preview (29/09/2026): item com fatura em competência futura (teto +2 meses).
  declare
    v_fim_item date;
    v_env_ext  jsonb;
  begin
    select max(to_date('01/' || y.c, 'DD/MM/YYYY')) into v_fim_item
      from jsonb_array_elements(p_itens) x,
           lateral (select nullif(trim(coalesce(x->>'competencia','')), '') as c) y
     where y.c ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
       and nullif(trim(coalesce(x->>'canonical_fatura_id','')), '') is not null;
    if v_fim_item is not null then
      v_fim_item := least(v_fim_item, (date_trunc('month', v_as_of) + interval '2 month')::date);
    end if;
    if v_fim_item is not null and v_fim_item > date_trunc('month', v_as_of)::date then
      v_env_ext := public.sol_faturas_alunos_v1(
        p_unidade_id, extract(year from v_fim_item)::int, extract(month from v_fim_item)::int,
        'janela_3', 'todas', v_as_of);
      if coalesce(v_env_ext->>'status', '') not in ('ok', 'partial') then
        return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel',
          'status_fonte', v_env_ext->>'status', 'competencia_estendida', to_char(v_fim_item, 'MM/YYYY'));
      end if;
      v_env := jsonb_set(v_env, '{items}',
        coalesce(v_env->'items', '[]'::jsonb) || coalesce((
          select jsonb_agg(i2) from jsonb_array_elements(coalesce(v_env_ext->'items', '[]'::jsonb)) i2
           where not exists (select 1 from jsonb_array_elements(coalesce(v_env->'items', '[]'::jsonb)) i1
                              where i1->>'canonical_fatura_id' = i2->>'canonical_fatura_id')), '[]'::jsonb));
    end if;
  end;
$f$;
  v_n int;
begin
  if position('Janela do preview (29/09/2026)' in v_def) > 0 then
    raise notice 'ja aplicada';
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'ancora fonte_indisponivel: esperava 1, achou %', v_n; end if;
  v_def := replace(v_def, v_a, v_a || v_bloco);
  execute v_def;
end
$mig$;
