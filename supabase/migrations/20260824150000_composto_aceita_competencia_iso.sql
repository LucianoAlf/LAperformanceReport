-- Composto: o parâmetro `competencia` passa a aceitar ISO além de MM/AAAA.
--
-- 2º bug de CONTRATO entre runtime e RPC no mesmo fluxo (24/08/2026). O runtime envia a
-- competência normalizada em ISO (`competenciaIso()` → '2026-08-01'), e a RPC comparava
-- com `to_char(competencia,'MM/YYYY')` — nenhuma candidata passava e o retorno era
-- `composicao_exige_duas_faturas`. Medido: com '08/2026' resolve; com '2026-08-01' não.
--
-- Corrigido AQUI, na RPC canônica, e não no runtime: entrada tolerante é
-- responsabilidade de quem publica o contrato — qualquer consumidor (runtime, edge,
-- teste, a própria Sol) pode mandar o formato que tiver na mão. Aceita:
--   'MM/AAAA' · 'AAAA-MM-DD' · 'AAAA-MM' · vazio/nulo (sem filtro de competência).
--
-- ⚠️ Este é o par do bug `partes[]` × `itens[]` corrigido no runtime na mesma hora: a
-- RPC devolve `itens[]` (spec de 22/08) e o wrapper esperava `partes[]`, devolvendo null
-- em silêncio. Juntos, os dois faziam TODO pagamento composto cair no casamento simples
-- desde o deploy de 22/08 — o card dizia "o comprovante difere do valor da parcela"
-- (caso Valentina/Recreio: Canto 418,91 + Teclado 395,90 = 814,81).
-- Lição: contrato entre camadas precisa de teste que ATRAVESSE as duas — os testes de
-- cada lado passavam isolados.

create or replace function public.sol_caixa_normalizar_competencia_v1(p_competencia text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select case
    when nullif(btrim(coalesce(p_competencia, '')), '') is null then null
    -- MM/AAAA (formato canonico de saida)
    when btrim(p_competencia) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then btrim(p_competencia)
    -- AAAA-MM-DD ou AAAA-MM (ISO, como o runtime envia)
    when btrim(p_competencia) ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$'
      then substring(btrim(p_competencia) from 6 for 2) || '/' || substring(btrim(p_competencia) from 1 for 4)
    else null  -- formato desconhecido: trata como "sem filtro", nunca como filtro impossivel
  end;
$function$;

revoke all on function public.sol_caixa_normalizar_competencia_v1(text) from public, anon, authenticated;
grant execute on function public.sol_caixa_normalizar_competencia_v1(text) to service_role, sol_acesso_restrito;

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_resolver_composto_aluno_v1';

  if position('sol_caixa_normalizar_competencia_v1' in v_def) > 0 then
    raise notice 'normalizacao ja aplicada';
    return;
  end if;

  v_new := replace(v_def,
    $$  v_competencia text := nullif(btrim(p_payload->>'competencia'),'');$$,
    $$  v_competencia text := public.sol_caixa_normalizar_competencia_v1(p_payload->>'competencia');$$);

  if v_new = v_def then
    raise exception 'ancora da competencia nao encontrada';
  end if;

  execute v_new;
end $mig$;

-- Mesma tolerância no multi-aluno (irmãos), que compara competencia do item do mesmo jeito.
do $mig2$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_resolver_multi_aluno_v1';

  if position('sol_caixa_normalizar_competencia_v1' in v_def) > 0 then
    raise notice 'normalizacao ja aplicada no multi';
    return;
  end if;

  v_new := replace(v_def,
    $$    v_competencia := nullif(trim(coalesce(v_item->>'competencia', '')), '');$$,
    $$    v_competencia := public.sol_caixa_normalizar_competencia_v1(v_item->>'competencia');$$);

  if v_new = v_def then
    raise exception 'ancora da competencia do multi nao encontrada';
  end if;

  execute v_new;
end $mig2$;
