-- A conversa que a pesquisa de evasao abre na Caixa nasce SO com o numero: `aluno_id`, `unidade_id`
-- e `nome_externo` todos NULL. Efeitos praticos, os tres na mesma causa:
--   1. o deep-link "Ir para a conversa" (que casa por `aluno_id`) nao achava nada — das 25 da fila,
--      so 5 tinham vinculo;
--   2. a lista da Caixa mostra o telefone cru, sem nome, enquanto as outras conversas mostram aluno,
--      curso, professor e responsavel;
--   3. `unidade_id` nulo faz a conversa DESAPARECER quando o usuario escolhe uma unidade — o hook
--      filtra `unidade_id = X`. So aparecia em "Consolidado".
--
-- Backfill casando pelos ULTIMOS 8 DIGITOS do telefone (o mesmo numero aparece com e sem DDI e com
-- e sem o 9o digito; o jid as vezes traz sufixo). O escopo ja e estreito — conversas do
-- departamento 'sucesso_aluno' contra os destinos de pesquisas realmente enviadas —, entao o risco
-- de colisao dos 8 finais e desprezivel aqui.
--
-- ⚠️ Fica de fora a conversa que casa com MAIS DE UM aluno: telefone de responsavel com dois filhos
-- (o caso Pedro/Julia Nadaes). Escolher um dos dois seria inventar vinculo — e, como a conversa e a
-- mesma para os dois irmaos, nao existe resposta certa no modelo atual.
--
-- Nao sobrescreve vinculo existente (`is null` nas duas colunas do WHERE).
--
-- ⚠️ Isto conserta o passado. A ORIGEM continua: `enviar-pesquisa-evasao` segue criando conversa
-- sem vinculo, entao a proxima pesquisa nasce com o mesmo problema. O front tem rede (casa por
-- telefone), mas a conversa nova vai continuar sem nome na lista e invisivel no filtro de unidade.

with alvo as (
  select
    c.id as conversa_id,
    min(f.aluno_id) as aluno_id,
    min(f.unidade_id::text)::uuid as unidade_id
  from public.admin_conversas c
  join (
    select distinct
      mov.aluno_id,
      pe.unidade_id,
      right(regexp_replace(pe.telefone_destino_snapshot, '[^0-9]', '', 'g'), 8) as fim_telefone
    from public.pesquisa_evasao pe
    join public.movimentacoes_admin mov on mov.id = pe.evasao_id
    where pe.modo_teste = false
      and pe.envio_status in ('enviado', 'entregue', 'lido')
      and mov.aluno_id is not null
      and length(regexp_replace(pe.telefone_destino_snapshot, '[^0-9]', '', 'g')) >= 8
  ) f
    on right(regexp_replace(coalesce(c.whatsapp_jid, c.telefone_externo, ''), '[^0-9]', '', 'g'), 8)
       = f.fim_telefone
  where c.departamento = 'sucesso_aluno'
    and (c.aluno_id is null or c.unidade_id is null)
  group by c.id
  having count(distinct f.aluno_id) = 1
     and count(distinct f.unidade_id) = 1
)
update public.admin_conversas c
set aluno_id = coalesce(c.aluno_id, alvo.aluno_id),
    unidade_id = coalesce(c.unidade_id, alvo.unidade_id)
from alvo
where c.id = alvo.conversa_id;
