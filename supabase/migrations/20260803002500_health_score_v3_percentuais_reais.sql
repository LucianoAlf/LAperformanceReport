begin;

-- Corrige a escala da projecao viva sem reescrever snapshots fechados.
-- Retencao, conversao e presenca ja sao percentuais de desempenho: a meta e
-- referencia pedagogica, nao um multiplicador da nota. Permanencia continua
-- sendo uma medida de atingimento porque seu valor bruto e expresso em meses.
create or replace function public.normalizar_health_score_professor_v3_meta_viva(
  p_metrica text,
  p_valor_bruto numeric,
  p_meta numeric,
  p_nota_segmentada numeric default null
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when p_metrica = 'numero_alunos' then null::numeric
    when p_metrica = 'media_turma' then
      case
        when p_nota_segmentada is null then null::numeric
        else round(least(100::numeric, greatest(0::numeric, p_nota_segmentada)), 2)
      end
    when p_metrica in ('retencao', 'conversao', 'presenca') then
      case
        when p_valor_bruto is null then null::numeric
        else round(least(100::numeric, greatest(0::numeric, p_valor_bruto)), 2)
      end
    when p_metrica = 'permanencia' then
      case
        when p_valor_bruto is null or coalesce(p_meta, 0) <= 0 then null::numeric
        else round(least(100::numeric, greatest(
          0::numeric,
          p_valor_bruto / nullif(p_meta, 0) * 100
        )), 2)
      end
    else null::numeric
  end;
$function$;

comment on function public.normalizar_health_score_professor_v3_meta_viva(
  text, numeric, numeric, numeric
) is
  'Preserva percentuais reais em retencao, conversao e presenca; normaliza permanencia pela meta, mantem media de turma segmentada e carteira diagnostica.';

commit;
