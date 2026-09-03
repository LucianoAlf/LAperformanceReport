-- Mapa de Sinais / A1: o Instagram estava produzindo lead e sumindo do funil.
--
-- A bridge de Instagram (la-hq) transfere o lead para o WhatsApp, mas não grava
-- canal de origem em `leads`. Resultado medido em 03/09/2026, cruzando as 104
-- sessões espelhadas em `instagram_sessoes` contra `leads` pela chave canônica
-- de telefone: **52 leads vieram do Instagram e 28 estavam sem origem nenhuma**.
-- No funil, o canal que produziu aparecia como "sem origem".
--
-- ⚠️ FIRST-TOUCH, igual à `varrer-atribuicao-meta-ads`: só preenche onde está
-- VAZIO. Os outros 24 já têm origem declarada (Google, Indicação, Instagram,
-- Site, Visita/Placa) e NÃO são tocados — três deles converteram por
-- "Visita/Placa", e sobrescrever destruiria informação real. Quem visitou a
-- escola E mandou DM tem as duas coisas verdadeiras; o primeiro toque é que
-- manda, e não é este.
--
-- ⚠️ O `is null` no WHERE não é enfeite: além de implementar o first-touch, ele
-- é a trava contra corrida com o `upsert_lead`, que faz
-- `COALESCE(v_canal_id, canal_origem_id)` — se o Emusys mandar canal no mesmo
-- instante, quem chegar primeiro fica.
--
-- Reversível: cada linha alterada deixa registro em `leads_automacao_log` com
-- `acao='origem_instagram_backfill'`, guardando o telefone da sessão e a conta
-- (@lamusickids / @lamusicschool) que originou.

with alvo as (
  select distinct on (l.id)
         l.id            as lead_id,
         l.nome          as lead_nome,
         s.conta         as conta_ig,
         s.sender_name   as nome_no_instagram,
         s.telefone_chave
  from public.instagram_sessoes s
  join public.leads l
    on public.fn_normalizar_telefone_br_key(l.telefone) = s.telefone_chave
  where s.telefone_chave is not null
    and l.canal_origem_id is null
  order by l.id, s.ultima_atividade_em desc
),
atualizados as (
  update public.leads l
     set canal_origem_id = (select id from public.canais_origem
                            where nome ilike 'instagram' limit 1)
    from alvo a
   where l.id = a.lead_id
     and l.canal_origem_id is null   -- trava contra corrida com upsert_lead
  returning l.id, a.conta_ig, a.nome_no_instagram, a.telefone_chave, l.nome
)
insert into public.leads_automacao_log (lead_id, lead_nome, evento, acao, detalhes)
select u.id,
       u.nome,
       'mapa_sinais',
       'origem_instagram_backfill',
       jsonb_build_object(
         'conta_instagram',   u.conta_ig,
         'nome_no_instagram', u.nome_no_instagram,
         'telefone_chave',    u.telefone_chave,
         'politica',          'first_touch_apenas_se_vazio',
         'fonte',             'instagram_sessoes (bridge la-hq)'
       )
from atualizados u;
