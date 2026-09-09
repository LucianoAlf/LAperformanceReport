-- 🔴 O BLOCO QUE VAI PARA O GRUPO LIA `radar_sinais` CRU.
--
-- Medido em 09/09/2026, contra o Chatwoot ao vivo: das 79 linhas de conversa
-- abertas, 37 (46%) nao deveriam estar la. A Vitoria (CG) e a Daiana (Recreio)
-- relataram isso no mesmo dia, cada uma no seu grupo, e as duas estavam certas.
--
-- A view `vw_radar_sinal_vigencia_v1` ja sabia: ela marcava `sanou` justamente
-- os que a equipe tinha atendido. So que ninguem a lia. E a regra "leia a
-- vigencia, nunca a tabela crua" esta escrita no CLAUDE.md desde 07/09 — a
-- ferramenta existia, visivel, e a instrucao antiga venceu.
--
-- Duas mudancas, uma so causa (a lista que a equipe LE nao passava pelo filtro):
--
-- 1) le a view e descarta `sanou`. ⚠️ `sem_rodada` FICA: detector atrasado e
--    alarme, e a direcao da falha aqui e fail-OPEN — item velho custa um
--    instante de atencao, item sumido custa um aluno.
--
-- 2) colapsa por `situacao`, que e a `chave_dedup` SEM o ultimo segmento. O
--    ultimo segmento e a SEMANA ISO (`2026-36` / `2026-37`), entao conversa
--    parada renascia toda segunda e a linha velha continuava aberta — a
--    `radar_marcar_foto_conversas_v1` refresca `visto_em` por CONVERSA, nao por
--    chave, entao as duas ficavam `vigente` para sempre. Eram 9 pares na pauta
--    de hoje (conv 3650, 4533, 10845, 19028, 19434, 19710, 20184, 20306, 20630).
--    O colapso e na LEITURA de proposito: a linha semanal e historico legitimo,
--    o que estava errado era a pauta de hoje mostrar a mesma conversa 2x.
create or replace function public.radar_bloco_comercial_grupo_v1(
  p_unidade_id uuid, p_limite integer default 6, p_janela_dias integer default 30)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
with vivos as (
  -- uma linha por SITUACAO (regra|tipo|entidade|conversa), a mais recente
  select distinct on (coalesce(v.situacao, v.id::text))
         v.id, v.regra_codigo, v.contexto, v.orientacao, v.detectado_em, v.evidencia
    from public.vw_radar_sinal_vigencia_v1 v
   where v.dominio = 'comercial'
     and v.status in ('aberto','triado')
     and v.unidade_id = p_unidade_id
     and (v.expira_em is null or v.expira_em > now())
     and v.vigencia <> 'sanou'
   order by coalesce(v.situacao, v.id::text), v.detectado_em desc
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

-- ⚠️ ALTER DEFAULT PRIVILEGES reabre EXECUTE para anon a cada recriacao
revoke execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer) is
  'Bloco de sinais que vai para o grupo da unidade. Le a VIGENCIA (nunca '
  'radar_sinais cru) e colapsa por situacao, senao a mesma conversa aparece '
  'uma vez por semana ISO. Descarta `sanou`; mantem `sem_rodada` de proposito.';
