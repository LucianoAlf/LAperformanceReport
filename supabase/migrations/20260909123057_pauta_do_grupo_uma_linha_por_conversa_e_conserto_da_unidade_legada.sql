-- (1) UMA LINHA POR CONVERSA NO BLOCO DO GRUPO.
--
-- O colapso por `situacao` (aplicado hoje mais cedo) resolve a duplicata da
-- SEMANA, mas nao a da REGRA: a mesma conversa vira duas linhas quando o
-- extrator a classifica de dois jeitos ao longo dos dias. Medido em 09/09,
-- depois do primeiro conserto: Pietro (conv 20712) aparecia como R7 e R8,
-- Nilza (20732) como R8 e R18, Hosana (20630) duas vezes.
--
-- Num bloco de 6 linhas, ver a mesma pessoa 2x custa 1/3 da pauta e passa a
-- impressao de lista mal feita — que e exatamente o que corroi a confianca no
-- canal. A regra mais grave vence (R2 cancelamento > R14 dificuldade > resto),
-- que e a MESMA precedencia ja usada na ordenacao logo abaixo: uma so nocao de
-- gravidade no arquivo inteiro.
--
-- ⚠️ Colapsa por CONVERSA, nao por entidade: o `entidade_id` e instavel quando
--    a pessoa tem lead em duas unidades (foi o que fez a conv 20630 nascer como
--    lead 13961 numa semana e 14067 na outra). Conversa e o que nao muda.
-- ⚠️ Sinal sem conversa (detector SQL) nao colapsa — cai no id.
create or replace function public.radar_bloco_comercial_grupo_v1(
  p_unidade_id uuid, p_limite integer default 6, p_janela_dias integer default 30)
returns text[]
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

revoke execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  to authenticated, service_role;

-- (2) CONSERTO DOS SINAIS QUE JA NASCERAM NA UNIDADE ERRADA.
--
-- O desempate pela porta corrige daqui pra frente, mas nao retroage: sinal ja
-- gravado nao e reclassificado (a dedup impede). Sao poucos e estao na cara da
-- equipe agora — a Kellen e a Suelen escreveram para o `Mila_CG` e estao na
-- pauta do RECREIO neste momento.
--
-- ⚠️ Escopo minimo e declarado: SO sinal aberto, SO de LEAD, SO quando o inbox
--    aponta para uma unidade diferente. Aluno fica de fora de proposito —
--    matricula manda sobre porta.
-- ⚠️ `entidade_id` tambem e corrigido, senao a ficha abriria o lead da unidade
--    errada; quem resolve e a MESMA RPC que o extrator usa, com a dica da porta
--    (nao ha segunda implementacao da regra aqui).
-- Aplicado: 4 sinais (conv 6796 Kellen, 15052 Suelen, 20456, 20630 Hosana).
with porta as (
  select s.id,
         u.id  as unidade_certa,
         u.nome as unidade_certa_nome,
         s.unidade_id as unidade_errada
    from radar_sinais s
    join unidades u
      on (s.evidencia->>'inbox') ilike '%' ||
         (case u.nome when 'Campo Grande' then 'CG' else u.nome end)
   where s.status in ('aberto','triado')
     and s.entidade_tipo = 'lead'
     and s.evidencia ? 'inbox'
     and u.id <> s.unidade_id
),
resolvido as (
  select p.*, radar_resolver_entidade_por_telefone(
                (select l.telefone from leads l where l.id = s.entidade_id),
                p.unidade_certa) as ident
    from porta p join radar_sinais s on s.id = p.id
)
update radar_sinais s
   set unidade_id  = r.unidade_certa,
       entidade_id = coalesce((r.ident->>'entidade_id')::bigint, s.entidade_id),
       atualizado_em = now(),
       evidencia = s.evidencia || jsonb_build_object(
         'unidade_corrigida_em', now(),
         'unidade_anterior', r.unidade_errada,
         'motivo_correcao', 'sinal nasceu antes do desempate pela porta (09/09/2026)')
  from resolvido r
 where s.id = r.id;
