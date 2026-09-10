-- Agradecimento da evasao: nao mandar quando alguem ja falou com a pessoa.
--
-- Cenario levantado pelo Hugo em 10/09/2026: a Jessy ve a resposta na Caixa e
-- agradece na mao ANTES de o robo agradecer. Os cinco portoes de
-- `_shared/pesquisa-evasao-agradecimento.ts` nao alcancam isso -- todos leem
-- `automacao_log`, que e o registro do que o ROBO mandou. A resposta manual dela
-- vai para `admin_mensagens` e nunca chega a `pesquisa_evasao_mensagens` (as 25
-- saidas de la, medidas hoje, sao 21 repescagens + 4 agradecimentos, zero
-- manuais); a tela da fila de evasao nem tem campo de resposta.
--
-- Janela de risco medida em producao, da chegada da resposta ate o envio:
-- 15,5 · 15,6 · 15,8 · 18,3 minutos (silencio de 15 min da consolidacao mais o
-- processamento). E 12,4% das entradas do departamento sucesso_aluno recebem
-- resposta humana dentro dela -- 36 de 291 em 45 dias.
--
-- ⚠️ A pergunta e "saiu mensagem NOSSA depois da resposta?", nunca "um humano
-- agradeceu?". Duas razoes medidas hoje:
--   1. `admin_mensagens.remetente = 'admin'` NAO quer dizer humano: o robo da
--      pesquisa de 1a aula grava como admin/`Fabi`, e ha `Notificacao
--      (automatico)` e `Boas-vindas (automatico)` no mesmo balde. A tabela nao
--      tem coluna de autor, entao "foi humano?" so se responderia por lista de
--      nomes -- regra que envelhece mal.
--   2. Julgar se o texto foi um agradecimento seria classificar texto de novo,
--      com o mesmo risco de errar que o classificador ja tem.
-- De quebra cobre o caso oposto: a Jessy responde "vou verificar isso com a
-- coordenacao" e o robo emenda um "muito obrigada mesmo!" por cima.
create or replace function public.fn_pesquisa_evasao_alguem_respondeu_depois_v1(
  p_pesquisa_id uuid,
  p_analise_versao integer
) returns boolean
language sql
stable
as $$
  with alvo as (
    select
      regexp_replace(coalesce(pe.telefone_destino_snapshot, ''), '\D', '', 'g') as tel,
      -- A referencia e a PRIMEIRA entrada desta versao de analise: o instante em
      -- que a pessoa falou e o relogio de ~16 min comecou a correr.
      (
        select min(m.recebido_em)
        from public.pesquisa_evasao_mensagens m
        where m.pesquisa_id = pe.id
          and m.analise_versao = p_analise_versao
          and m.direcao = 'entrada'
      ) as ref
    from public.pesquisa_evasao pe
    where pe.id = p_pesquisa_id
  )
  select coalesce((
    select exists (
      select 1
      from public.admin_mensagens am
      join public.admin_conversas ac on ac.id = am.conversa_id
      where ac.departamento = 'sucesso_aluno'
        and am.direcao = 'saida'
        and am.created_at > alvo.ref
        -- Casa a conversa pelo TELEFONE, nunca por aluno_id: uma pessoa costuma
        -- ter mais de uma conversa no mesmo departamento (a de boas-vindas nasce
        -- no numero do responsavel), e foi por isso que o registro da pesquisa de
        -- 1a aula quebrou em 13/08.
        and regexp_replace(coalesce(ac.whatsapp_jid, ac.telefone_externo, ''), '\D', '', 'g') = alvo.tel
        -- Tira o que o proprio robo da evasao mandou, senao ele recusaria o
        -- envio que ele mesmo fez -- e, numa execucao concorrente, logaria
        -- `alguem_ja_respondeu` onde o certo era `ja_agradecido`.
        -- ⚠️ Os dois lados guardam o MESMO id em formatos diferentes:
        -- `pesquisa_evasao_mensagens.provider_message_id` vem com o numero da
        -- caixa na frente (`552123425316:3EB04873...`) e
        -- `admin_mensagens.whatsapp_message_id` guarda so o sufixo. Comparar
        -- cru da zero casamento em 100% das linhas.
        -- ⚠️ NAO filtra por `pesquisa_id`: irmaos dividem telefone, e a
        -- repescagem de um bloquearia o agradecimento do outro. Repescagem e
        -- pergunta, nao resposta -- nao tira ninguem do vacuo.
        and not exists (
          select 1
          from public.pesquisa_evasao_mensagens nossa
          where nossa.direcao = 'saida'
            and regexp_replace(coalesce(nossa.provider_message_id, ''), '^.*:', '')
                = coalesce(am.whatsapp_message_id, '')
        )
    )
    from alvo
    -- Sem referencia nao ha o que julgar. Fail-OPEN de proposito: fail-closed
    -- aqui desligaria o agradecimento inteiro em silencio, que e um estrago
    -- maior que a duplicata que este portao evita.
    where alvo.ref is not null
  ), false);
$$;

comment on function public.fn_pesquisa_evasao_alguem_respondeu_depois_v1(uuid, integer) is
  'Portao do agradecimento da evasao: houve mensagem de saida na conversa da pessoa depois da resposta, excluindo o que o proprio robo da evasao mandou? Consumidor: edge enviar-agradecimento-evasao.';

-- Funcao nova nasce executavel por `anon` por causa do ALTER DEFAULT PRIVILEGES
-- do schema public -- `revoke from public` sozinho nao basta, tem de ser
-- nominal. Ja mordeu tres vezes neste repo (get_agenda_dia, o base_v131 e a
-- retificacao gerencial).
revoke execute on function public.fn_pesquisa_evasao_alguem_respondeu_depois_v1(uuid, integer) from public;
revoke execute on function public.fn_pesquisa_evasao_alguem_respondeu_depois_v1(uuid, integer) from anon;
revoke execute on function public.fn_pesquisa_evasao_alguem_respondeu_depois_v1(uuid, integer) from authenticated;
grant execute on function public.fn_pesquisa_evasao_alguem_respondeu_depois_v1(uuid, integer) to service_role;
