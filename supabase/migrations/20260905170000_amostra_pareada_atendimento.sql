-- AMOSTRA PAREADA para o estudo de qualidade do atendimento comercial.
--
-- Antes de colocar um agente para avaliar conversa e apontar desvio de técnica,
-- é preciso saber se o desvio SEPARA quem matricula de quem não matricula. Esta
-- função monta o conjunto de comparação.
--
-- 🔴 POR QUE PAREAR: comparar convertido com não-convertido sem parear mede o
--    CANAL, não o atendimento. Indicação leva 77,4% dos leads à aula contra 9,6%
--    do Instagram (padrão PC1) — qualquer amostra desbalanceada por canal
--    "descobriria" que conversa de indicação é melhor, o que é verdade e é
--    inútil. Pareando por (unidade, canal, mês), o que sobra de diferença é
--    candidato a ser atendimento.
--
-- 🔴 O CORTE É POR RODÍZIO, NÃO ALFABÉTICO. A 1ª versão ordenava por
--    (unidade, mês, canal) e cortava no limite: a cota enchia com Barra e Campo
--    Grande e o RECREIO sumia inteiro — medido, 120 pares em 2 unidades. Tomando
--    o 1º par de cada estrato antes do 2º de qualquer um, a amostra cobre as
--    três (Barra 55 · CG 36 · Recreio 29).
--
-- ⚠️ ORDEM ESTÁVEL por `lead_id`: a mesma amostra sai igual em toda execução.
--    Sem isso, remedir depois compararia com um conjunto diferente e a variação
--    seria ruído de amostragem com cara de aprendizado.
--
-- ⚠️ ISTO PRODUZ CORRELAÇÃO. Conversa boa pode ser consequência de lead bom, e
--    não causa da matrícula. O resultado diz se vale investigar.
create or replace function public.amostra_pareada_atendimento_v1(
  p_pares integer default 120, p_meses integer default 6
) returns table (par_id int, lead_id bigint, telefone text, converteu boolean,
                 unidade text, canal text, mes date)
language sql stable security definer set search_path to 'public' as $function$
  with base as (
    select l.id, u.nome un, coalesce(c.nome,'(sem canal)') cn,
           date_trunc('month', l.created_at)::date ms,
           coalesce(l.converteu,false) conv,
           regexp_replace(coalesce(l.telefone,''), '\D','','g') tel
    from leads l
    join unidades u on u.id = l.unidade_id
    left join canais_origem c on c.id = l.canal_origem_id
    where l.created_at >= now() - make_interval(months => p_meses)
      and length(regexp_replace(coalesce(l.telefone,''), '\D','','g')) >= 10
  ),
  num as (
    select *, row_number() over (partition by un, cn, ms, conv order by id) rn
    from base
  ),
  pares as (
    select a.un, a.cn, a.ms, a.rn, a.id id_conv, a.tel tel_conv,
           b.id id_nao, b.tel tel_nao
    from num a
    join num b on b.un=a.un and b.cn=a.cn and b.ms=a.ms and not b.conv and b.rn=a.rn
    where a.conv
  ),
  numerado as (
    select *, row_number() over (order by rn, un, ms, cn)::int pid from pares
  ),
  cortado as (select * from numerado where pid <= p_pares)
  select pid, id_conv, tel_conv, true,  un, cn, ms from cortado
  union all
  select pid, id_nao,  tel_nao,  false, un, cn, ms from cortado
  order by 1, 4 desc
$function$;

revoke all on function public.amostra_pareada_atendimento_v1(integer,integer) from public, anon, authenticated;
grant execute on function public.amostra_pareada_atendimento_v1(integer,integer) to service_role;
