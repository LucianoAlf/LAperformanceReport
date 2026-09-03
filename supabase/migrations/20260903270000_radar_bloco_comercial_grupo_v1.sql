-- 3o ANDAR da vertical COMERCIAL — o bloco do radar que entra no relatorio
-- diario comercial que JA chega aos 3 grupos "RELATORIOS DIARIOS" (20:05 BRT).
--
-- O Luciano mostrou o relatorio de 02/09: "olha que relatorio bacana... so que
-- ficam ali, dou uma olhada mas nao falam muita coisa". O cano existe; faltava
-- ACAO dentro dele. Esta funcao devolve as linhas do radar comercial da unidade
-- para a secao nova "🔥 SINAIS DO DIA — ACAO" (formatador em
-- _shared/relatorio-comercial.ts; busca em relatorio-admin-whatsapp/index.ts).
--
-- Regras: so fatia comercial, so aberto/triado, so a unidade; MAIS RECENTE
-- primeiro (comercial ordena por frescor, nao por prazo); teto por chamada; texto
-- PUBLICO (validarTextoPublicoRelatorio rejeita termo tecnico e derruba o envio);
-- rodape com o tamanho da fila quando corta — nunca truncar em silencio. Linha
-- vinda de conversa e cortada em " Escreveu ha" (a citacao literal e longa demais
-- para grupo). Falha da RPC NAO derruba o relatorio: a secao apenas nao entra.
--
-- Validado em 03/09 com `send-lareport-comercial-hermes.py --dry-run --unit Barra`:
-- a secao aparece entre PROXIMAS EXPERIMENTAIS e ALERTAS, 6 linhas + "Mais 62
-- na fila", e o validador de texto publico aceitou.

CREATE OR REPLACE FUNCTION public.radar_bloco_comercial_grupo_v1(p_unidade_id uuid, p_limite integer DEFAULT 6)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with s as (
  select s.regra_codigo, s.contexto, s.orientacao,
         row_number() over (order by
           case s.regra_codigo when 'R2' then 0 when 'R14' then 1 else 2 end,
           coalesce((s.evidencia->>'dias_parado')::int,
                    (s.evidencia->>'horas_sem_resposta')::int / 24, 999),
           s.detectado_em desc) as rn,
         count(*) over () as total
  from public.radar_sinais s
  where s.dominio = 'comercial'
    and s.status in ('aberto','triado')
    and s.unidade_id = p_unidade_id
    and (s.expira_em is null or s.expira_em > now())
),
linhas as (
  select rn, total,
         regexp_replace(split_part(s.contexto, ' Escreveu há', 1), '\s+', ' ', 'g')
         || case when s.orientacao is not null
                 then ' → ' || split_part(s.orientacao, '.', 1) || '.'
                 else '' end as linha
  from s where rn <= p_limite
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

revoke all on function public.radar_bloco_comercial_grupo_v1(uuid,int) from public, anon;
grant execute on function public.radar_bloco_comercial_grupo_v1(uuid,int) to service_role, authenticated;
