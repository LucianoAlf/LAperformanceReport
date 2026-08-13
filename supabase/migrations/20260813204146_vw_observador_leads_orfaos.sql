-- Leads que o observador RECEBEU (payload salvo) e que nao existem em `leads`.
--
-- POR QUE UMA VIEW E NAO MAIS LOG DENTRO DA EDGE
-- O observador ja captura excecao (`acao='erro_processamento'`) e ja tem try/catch nas
-- 3 gravacoes. O caso real de 13/08 — lead "Arielly", emusys 14812, Campo Grande,
-- recebido 15:55:52 — nao deixou NENHUM rastro: nem erro, nem resultado, e o lead nao
-- existia em `leads`. Isso bate com o isolate morrendo entre o passo (1) LOG BRUTO e o
-- (2) PROCESSAMENTO. Quando o processo morre, nenhum log de dentro roda — so a
-- reconciliacao posterior enxerga.
--
-- O payload bruto SEMPRE fica salvo (passo 1, antes de qualquer processamento), entao
-- todo orfao daqui e recuperavel: reexecutar `upsert_lead` com os campos abaixo. Foi
-- assim que a Arielly voltou (lead_id 13032) e como os 21 leads de 12/08 voltaram.
--
-- COMO LER O RESULTADO
--  - `lead_criado` orfao  = lead que nunca entrou no funil. E perda de verdade.
--  - `lead_editado` orfao = quase sempre edicao de lead antigo do Emusys que nunca
--    existiu do nosso lado (anterior a integracao). NAO e perda.
-- Medido em 13/08: 23 `lead_criado` orfaos, TODOS anteriores a 12/08 16:30 (o passivo
-- do incidente do overload de `upsert_lead`), e zero depois da virada.
create or replace view public.vw_observador_leads_orfaos as
select
  l.id                                              as automacao_log_id,
  l.created_at,
  (l.created_at at time zone 'America/Sao_Paulo')    as recebido_brt,
  l.evento,
  (l.payload_bruto->'lead'->>'id')                   as emusys_lead_id_texto,
  nullif(regexp_replace(coalesce(l.payload_bruto->'lead'->>'id',''), '\D', '', 'g'), '')::bigint
                                                     as emusys_lead_id,
  l.payload_bruto->'lead'->>'nome_aluno'             as nome,
  l.payload_bruto->'lead'->>'telefone'               as telefone_bruto,
  l.payload_bruto->'lead'->>'email'                  as email,
  l.payload_bruto->>'escola_id'                      as escola_id,
  l.payload_bruto->'lead'->>'instrumento'            as instrumento,
  l.payload_bruto->'lead'->>'data_hora_criacao'      as data_hora_criacao,
  l.payload_bruto->'lead'->>'data_nascimento_aluno'  as data_nascimento
from automacao_log l
where l.acao = 'webhook_observado_direto'
  and l.evento in ('lead_criado', 'lead_editado')
  and l.payload_bruto->'lead'->>'id' is not null
  -- so digitos: payload torto nao pode derrubar a view inteira no cast
  and l.payload_bruto->'lead'->>'id' ~ '^\d+$'
  and not exists (
    select 1 from leads le
    where le.emusys_lead_id = (l.payload_bruto->'lead'->>'id')::bigint
  );

-- ALTER DEFAULT PRIVILEGES no schema public da `authenticated=arwdDxtm` a toda relacao
-- nova — inclusive VIEW. `grant select` depois NAO tira o resto. Revogar primeiro.
revoke all on public.vw_observador_leads_orfaos from public, anon, authenticated;
grant select on public.vw_observador_leads_orfaos to authenticated, service_role;

comment on view public.vw_observador_leads_orfaos is
  'Leads recebidos pelo observador (payload salvo em automacao_log) que nao chegaram a leads. Cada linha e um lead perdido e recuperavel via upsert_lead. Zero linhas novas = observador integro.';
