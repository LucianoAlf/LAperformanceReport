-- Sol · caixa: sem mês declarado, quando o mês corrente não fecha, tenta o MÊS SEGUINTE
-- (29/09/2026, CG 10:35, Mayra — "PG pix passaportes de <irmão A> e <irmã B> - LA CG R$400,00").
--
-- 🔴 O que aconteceu: as duas 2ªs parcelas do passaporte (R$ 200 cada, "Taxa de Matrícula do
--    curso de …") vencem em 05/10 e foram pagas adiantadas em 29/09. Sem mês escrito na
--    legenda, `sol_caixa_resolver_envelope_v1` só olhava a janela até o mês corrente e
--    respondia `nenhuma_fatura_aberta`; com "10/2026" escrito, a mesma busca achava as duas.
--    Pagar a parcela seguinte adiantada é rotina (a canônica já consulta o mês seguinte desde 17/09).
-- ⚠️ É FALLBACK, não universo maior: só roda quando a busca normal FALHOU (nenhuma fatura ou
--    nenhuma combinação fecha) e ninguém declarou mês. Caso que já dava certo não muda — se o
--    mês seguinte entrasse sempre no universo, parcela 09 de R$ 447 e parcela 10 de R$ 447 do
--    mesmo aluno virariam `combinacao_ambigua` no caso mais comum do caixa.
-- ⚠️ O resultado leva `mes_seguinte_adiantado: true`, e o card mostra a competência da fatura.
-- ⚠️ Recursão de UM nível só: a chamada interna leva `_fallback_mes_seguinte` e mês declarado.
-- Mudança mínima por replace() com guarda de contagem sobre a definição VIVA.
-- Custo: nenhum no caminho que já acha; uma chamada a mais só no que antes falhava.

do $mig$
declare
  v_def   text := pg_get_functiondef('public.sol_caixa_resolver_envelope_v1(uuid,jsonb)'::regprocedure);
  v_bloco text := $f$
  if v_fim is null and coalesce(p_envelope->>'_fallback_mes_seguinte', '') = '' then
    v_r := public.sol_caixa_resolver_envelope_v1(p_unidade_id, jsonb_set(
      case when jsonb_array_length(v_itens) > 0
           then jsonb_set(p_envelope, '{itens}', (
                  select jsonb_agg(x || jsonb_build_object('competencias', jsonb_build_array(
                           to_char(date_trunc('month', v_as_of) + interval '1 month', 'MM/YYYY'))))
                    from jsonb_array_elements(v_itens) x))
           else p_envelope || jsonb_build_object('competencias', jsonb_build_array(
                  to_char(date_trunc('month', v_as_of) + interval '1 month', 'MM/YYYY'))) end,
      '{_fallback_mes_seguinte}', 'true'::jsonb));
    if coalesce((v_r->>'ok')::boolean, false) then
      return v_r || jsonb_build_object('mes_seguinte_adiantado', true);
    end if;
  end if;
$f$;
  v_a text := $a$  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma_fatura_aberta',$a$;
  v_b text := $b$  if coalesce(v_combos, 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma_combinacao_fecha',$b$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  if v_n <> 1 then raise exception 'ancora nenhuma_fatura_aberta: esperava 1, achou %', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b);
  if v_n <> 1 then raise exception 'ancora nenhuma_combinacao_fecha: esperava 1, achou %', v_n; end if;
  v_def := replace(v_def, v_a, v_bloco || v_a);
  v_def := replace(v_def, v_b, v_bloco || v_b);
  execute v_def;
end
$mig$;
