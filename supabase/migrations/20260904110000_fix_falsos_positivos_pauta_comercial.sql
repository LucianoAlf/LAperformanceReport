-- 🔴 "Mais 163 na fila — os próximos vêm amanhã" era PROMESSA FALSA.
--
-- Feedback da Daiana (Recreio) e da Vitória (CG) em 03/09, 1º dia do bloco
-- "SINAIS DO DIA" no relatório comercial. Apuramento completo em
-- docs/auditorias/2026-09-04-falsos-positivos-pauta-comercial.md
--
-- Medido em 04/09: dos 175 R15 abertos, 123 (70%) estavam parados há MAIS de 30
-- dias (o pior, 120). No R17, 49 de 82 (60%). A "fila" prometida para amanhã
-- era, em dois terços, cemitério — e a consultora que confiasse nela gastaria o
-- dia ligando para gente de quatro meses atrás. É literalmente o que a Daiana
-- relatou já ter feito.
--
-- ⚠️ O sinal NÃO é apagado: ele é real, o desfecho de fato não existe. O que
--    muda é a ENTREGA. Quem passou de 30 dias pertence a campanha de reativação
--    — outro movimento, outro texto, outro dono (`radar_publico_reativacao_v1`
--    dimensiona: 368 fizeram experimental e não matricularam).
--
-- ⚠️ O contador da fila passa a contar SÓ o que está dentro da janela — senão a
--    linha continuaria mentindo, com número menor.

CREATE OR REPLACE FUNCTION public.radar_bloco_comercial_grupo_v1(p_unidade_id uuid, p_limite integer DEFAULT 6, p_janela_dias integer DEFAULT 30)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with s as (
  select s.regra_codigo, s.contexto, s.orientacao,
         coalesce((s.evidencia->>'dias_parado')::int,
                  (s.evidencia->>'horas_sem_resposta')::int / 24, 0) as idade_dias,
         row_number() over (order by
           case s.regra_codigo when 'R2' then 0 when 'R14' then 1 else 2 end,
           coalesce((s.evidencia->>'dias_parado')::int,
                    (s.evidencia->>'horas_sem_resposta')::int / 24, 999),
           s.detectado_em desc) as rn_bruto
  from public.radar_sinais s
  where s.dominio = 'comercial'
    and s.status in ('aberto','triado')
    and s.unidade_id = p_unidade_id
    and (s.expira_em is null or s.expira_em > now())
),
uteis as (
  select *, row_number() over (order by rn_bruto) rn, count(*) over () total
  from s where idade_dias <= p_janela_dias
),
linhas as (
  select rn, total,
         regexp_replace(split_part(u.contexto, ' Escreveu há', 1), '\s+', ' ', 'g')
         || case when u.orientacao is not null
                 then ' → ' || split_part(u.orientacao, '.', 1) || '.'
                 else '' end as linha
  from uteis u where rn <= p_limite
)
select case
  when (select count(*) from linhas) = 0 then array[]::text[]
  else array_agg(linha order by rn)
       || case when (select max(total) from linhas) > p_limite
               then array['Mais ' || ((select max(total) from linhas) - p_limite)::text
                          || ' na fila — os próximos vêm amanhã.']
               else array[]::text[] end
end
from linhas;
$function$;

-- ⚠️ Parametro novo COM DEFAULT cria OVERLOAD: as duas assinaturas passam a
--    aceitar (uuid, integer) e o Postgres recusa com `function is not unique`.
--    E o caso do `upsert_lead` no CLAUDE.md (11/08: webhook de leads do Emusys
--    falhou 100% por 21h, 22 leads perdidos). Dropar no MESMO passo.
drop function if exists public.radar_bloco_comercial_grupo_v1(uuid, integer);

do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc where proname = 'radar_bloco_comercial_grupo_v1';
  if v_n <> 1 then
    raise exception 'esperava 1 assinatura de radar_bloco_comercial_grupo_v1, achei %', v_n;
  end if;
end $$;

revoke all on function public.radar_bloco_comercial_grupo_v1(uuid,integer,integer) from public, anon;
grant execute on function public.radar_bloco_comercial_grupo_v1(uuid,integer,integer) to authenticated, service_role;

comment on function public.radar_bloco_comercial_grupo_v1(uuid,integer,integer) is
  'Bloco comercial do relatorio de grupo. ⚠️ So entrega sinal com ate `p_janela_dias` (30) de idade: em 04/09, 70% dos R15 e 60% dos R17 abertos estavam parados ha MAIS de 30 dias, e o "mais N na fila" prometia trabalho que e cemiterio. O sinal antigo continua no banco — ele e real; o que muda e que a pauta diaria nao o entrega como "ligar HOJE". Reativacao e outro movimento (radar_publico_reativacao_v1).';
