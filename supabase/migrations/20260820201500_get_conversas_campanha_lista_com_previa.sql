-- Lista de conversas do módulo Campanhas com a prévia da última mensagem.
--
-- `conversas_campanha` guarda só `ultima_mensagem_em`, não o texto. A leitura
-- ingênua (DISTINCT ON sobre `mensagens_campanha`) varre a tabela toda: medido
-- em 631 ms hoje, e cresce a cada disparo (700 envios = 700 linhas). O LATERAL
-- sobre as N conversas do topo usa `idx_mensagens_camp_conv (conversa_id,
-- created_at)` em backward scan — 500 lookups, 16 ms.
--
-- SECURITY INVOKER de propósito: as policies de `conversas_campanha` e
-- `mensagens_campanha` são `true` para authenticated e a tela já lê as duas
-- direto pelo PostgREST. Definer aqui só ampliaria acesso sem necessidade.
create or replace function public.get_conversas_campanha_lista(
  p_limit int default 500,
  p_busca text default null
)
returns table (
  id uuid,
  unidade_id uuid,
  numero_meta_id uuid,
  telefone text,
  nome_contato text,
  ultima_mensagem_em timestamptz,
  nao_lidas int,
  status text,
  created_at timestamptz,
  previa_texto text,
  previa_tipo text,
  previa_direcao text,
  previa_agente_id uuid,
  previa_campanha_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.unidade_id, c.numero_meta_id, c.telefone, c.nome_contato,
         c.ultima_mensagem_em, c.nao_lidas, c.status, c.created_at,
         -- 200 chars bastam para uma linha truncada e evitam trafegar o
         -- template inteiro do disparo (1.000+ chars) por conversa.
         left(m.texto, 200) as previa_texto,
         m.tipo             as previa_tipo,
         m.direcao          as previa_direcao,
         m.enviado_por_agente as previa_agente_id,
         m.campanha_id      as previa_campanha_id
  from (
    select *
    from conversas_campanha
    where p_busca is null
       or telefone ilike '%' || p_busca || '%'
       or nome_contato ilike '%' || p_busca || '%'
    order by ultima_mensagem_em desc nulls last
    limit greatest(p_limit, 1)
  ) c
  left join lateral (
    select mc.texto, mc.tipo, mc.direcao, mc.enviado_por_agente, mc.campanha_id
    from mensagens_campanha mc
    where mc.conversa_id = c.id
    order by mc.created_at desc
    limit 1
  ) m on true
  order by c.ultima_mensagem_em desc nulls last;
$$;

-- `ALTER DEFAULT PRIVILEGES` no schema public concede EXECUTE a `anon` em
-- função nova — revogar nominalmente não é redundância.
revoke execute on function public.get_conversas_campanha_lista(int, text) from public, anon;
grant execute on function public.get_conversas_campanha_lista(int, text) to authenticated, service_role;
