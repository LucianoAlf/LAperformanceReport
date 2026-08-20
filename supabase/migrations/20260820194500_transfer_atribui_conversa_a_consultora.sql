-- Transferência do agente de campanha passa a atribuir a conversa do Chatwoot
-- à consultora da unidade (`assignee_id` em transfer.config.units[]).
--
-- Por que: o token da integração é de usuário ADMIN, então toda conversa criada
-- pela transferência nascia no nome dele ("Luciano Alf atribuiu a si mesmo essa
-- conversa" — conversa 19945, lead Lene, 20/08) e não aparecia para a consultora
-- no filtro "atribuídas a mim".
--
-- Por que NÃO trocar o token pelo da consultora: ele é UM só para as três
-- unidades (Barra e Recreio também virariam dela); token de agente comum perde
-- permissão de criar label, que é operação de conta e faz parte da mesma
-- transferência; e a nota privada passaria a sair assinada por ela.
--
-- Ids conferidos em 20/08 via GET /inboxes/:id/assignable_agents — as três são
-- atribuíveis nas caixas das respectivas unidades:
--   CG      inbox 155  Vitória Santos  (comercialcg.emla@gmail.com)      33
--   Recreio inbox 148  Daiana Amorim   (daianaamorim@outlook.com)        81
--   Barra   inbox 147  Kailane Barbosa (kailanecomercial.emla@gmail.com) 30
-- ⚠️ Há duas "Vitoria" na conta: a da CG é a 33 (Santos), não a 344 (Andrade).
--
-- Idempotente: reescreve só o campo assignee_id de cada unidade, preservando
-- inbox_id, consultant_phone e o resto da config.
update agentes a
set tools = (
      select jsonb_agg(
        case
          when t->>'name' <> 'transfer' then t
          else jsonb_set(t, '{config,units}', (
            select jsonb_agg(
              case upper(u->>'name')
                when 'CG'      then u || jsonb_build_object('assignee_id', 33)
                when 'RECREIO' then u || jsonb_build_object('assignee_id', 81)
                when 'BARRA'   then u || jsonb_build_object('assignee_id', 30)
                else u
              end
              order by ord
            )
            from jsonb_array_elements(t->'config'->'units') with ordinality as e(u, ord)
          ))
        end
        order by ord
      )
      from jsonb_array_elements(a.tools) with ordinality as x(t, ord)
    ),
    updated_at = now()
where a.id = 'f4238ffa-8d08-4db8-af28-b5d4a355d7ca'
  and exists (
    select 1 from jsonb_array_elements(a.tools) t
    where t->>'name' = 'transfer' and jsonb_array_length(coalesce(t->'config'->'units','[]'::jsonb)) > 0
  );
