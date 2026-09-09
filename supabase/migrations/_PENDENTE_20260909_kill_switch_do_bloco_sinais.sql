-- ⛔ NÃO APLICADA. Precisa do gate do Alf.
--    Prefixo `_PENDENTE_` de propósito: o nome não casa o padrão de timestamp
--    que o CLI reconhece, então ela não sobe por engano num `db push`.
--
-- 🔴 O GATE DO RADAR ESTÁ FURADO POR UM CANAL QUE NINGUÉM LISTOU (09/09/2026).
--
-- A auditoria cruzada com o Alfredo convergiu neste ponto e ele reconheceu o
-- erro dele: `radar_pauta_grupo = false` desliga a **pauta**, e de fato
-- `radar_entregas` tem zero linhas. A conclusão que os dois tiramos daí — "a
-- camada calcula mas não aborda a equipe" — estava errada.
--
-- Os sinais chegam ao grupo por OUTRO caminho: a seção `🔥 SINAIS DO DIA — AÇÃO`
-- dentro do **relatório comercial diário das 20:05**, montada em
-- `supabase/functions/_shared/relatorio-comercial.ts:833` a partir de
-- `radar_bloco_comercial_grupo_v1`, chamada pela edge
-- `relatorio-admin-whatsapp:1931`.
--
-- **A prova de que chega:** em 09/09 a Vitória (CG) e a Daiana (Recreio)
-- reclamaram do conteúdo desses sinais, cada uma no seu grupo. Auditadas as 79
-- linhas contra o Chatwoot ao vivo, 37 (46%) não deviam estar lá (PRs #401-#405).
-- Não se recebe reclamação de lista que não é entregue.
--
-- Esta migration dá ao bloco um interruptor PRÓPRIO, para que ele seja governável
-- separadamente da pauta — hoje ele não é governável de forma nenhuma.
--
-- ⚠️ O relatório comercial NÃO PARA. Só o bloco de sinais some quando o
--    interruptor estiver off. Desligar o relatório inteiro para calar 6 linhas
--    seria trocar um problema por um pior.
-- ⚠️ Nasce LIGADO (`true`) de propósito: hoje o bloco já sai, e criar o
--    interruptor desligado mudaria o comportamento em produção sem decisão. A
--    decisão de desligar é do Alf, e vira um `update` de uma linha.
-- ⚠️ Fail-OPEN na ausência da linha: se alguém apagar o registro, o bloco volta
--    a sair. É a direção certa aqui — a inversa esconderia sinal real em
--    silêncio, que é o defeito que passamos o dia consertando.

insert into automacoes_config (slug, ativo, descricao)
values ('radar_bloco_sinais_comercial', true,
        'Interruptor do bloco 🔥 SINAIS DO DIA — AÇÃO dentro do relatório '
        'comercial das 20:05. Separado de `radar_pauta_grupo`, que governa a '
        'pauta autônoma. Desligar aqui NÃO para o relatório comercial.')
on conflict (slug) do nothing;

-- A função passa a consultar o próprio interruptor. Fica `stable` e continua
-- devolvendo `text[]` — a edge não muda de contrato.
--
-- ⚠️ Guarda de âncora com número declarado: a função tem UMA cláusula `where`
--    de dominio, e supor 1 sem checar já escondeu meia correção em 27/08.
do $$
declare
  v_def text;
  v_alvo text := '   where v.dominio = ''comercial''';
  v_novo text := '   where v.dominio = ''comercial''
     -- 🔴 interruptor PROPRIO do bloco (ver comentario da migration). Ausencia
     --    da linha = LIGADO: sumir com sinal real em silencio e pior.
     and coalesce((select ac.ativo from automacoes_config ac
                    where ac.slug = ''radar_bloco_sinais_comercial''), true)';
  v_n int;
begin
  v_def := pg_get_functiondef(
    'public.radar_bloco_comercial_grupo_v1(uuid,integer,integer)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 1 then
    raise exception 'ancora do dominio apareceu % vezes, esperava 1 — abortado', v_n;
  end if;

  execute replace(v_def, v_alvo, v_novo);
end $$;

revoke execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.radar_bloco_comercial_grupo_v1(uuid, integer, integer) is
  'Bloco de sinais do grupo, dentro do relatorio comercial das 20:05. Le a '
  'VIGENCIA (nunca radar_sinais cru), colapsa por conversa, e tem interruptor '
  'proprio `radar_bloco_sinais_comercial` — separado da pauta autonoma.';

-- ROLLBACK
--   update automacoes_config set ativo = true where slug='radar_bloco_sinais_comercial';
--   -- e, para remover o gate por completo, reaplicar a definicao anterior:
--   -- `supabase/migrations/20260909123057_pauta_do_grupo_uma_linha_por_conversa...sql`
