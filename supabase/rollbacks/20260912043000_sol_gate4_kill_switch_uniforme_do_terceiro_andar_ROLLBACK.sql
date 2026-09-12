-- Rollback preparado: religa o bloco e restaura o comportamento anterior.
-- Nao executar sem gate, pois volta a inserir sinais no relatorio das 20h05.

update public.automacoes_config
   set ativo = true
 where slug = 'radar_bloco_sinais_comercial';

create or replace function public.radar_bloco_comercial_grupo_v1(
  p_unidade_id uuid,
  p_limite integer default 6,
  p_janela_dias integer default 30
) returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
with vivos as (
  select distinct on (coalesce(v.evidencia->>'conversa_id', v.situacao, v.id::text))
         v.id, v.regra_codigo, v.contexto, v.orientacao, v.detectado_em, v.evidencia
    from public.vw_radar_sinal_vigencia_v1 v
   where v.dominio = 'comercial'
     and v.status in ('aberto','triado')
     and v.unidade_id = p_unidade_id
     and (v.expira_em is null or v.expira_em > now())
     and v.vigencia <> 'sanou'
   order by coalesce(v.evidencia->>'conversa_id', v.situacao, v.id::text),
            case v.regra_codigo when 'R2' then 0 when 'R14' then 1 else 2 end,
            v.detectado_em desc
),
s as (
  select v.regra_codigo, v.contexto, v.orientacao,
         coalesce((v.evidencia->>'dias_parado')::int,
                  (v.evidencia->>'horas_sem_resposta')::int / 24, 0) as idade_dias,
         row_number() over (order by
           case v.regra_codigo when 'R2' then 0 when 'R14' then 1 else 2 end,
           coalesce((v.evidencia->>'dias_parado')::int,
                    (v.evidencia->>'horas_sem_resposta')::int / 24, 999),
           v.detectado_em desc) as rn_bruto
    from vivos v
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

revoke all on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  to authenticated, service_role;
