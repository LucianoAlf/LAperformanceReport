-- 3o ANDAR da vertical COMERCIAL — quem recebe.
--
-- Dono do sinal comercial e a CONSULTORA DA UNIDADE (decisao do Luciano):
-- a Mila detecta e entrega, ela nao age sozinha.
--
-- Os telefones vem de `agentes.tools -> transfer.config.units`, que e a fonte
-- que o proprio sistema JA usa para avisar a consultora quando o bot transfere
-- um lead. Nao inventei contato novo.
--   CG      Vitoria  553171422022   (assignee_id 33)
--   Recreio Daiana   5521968060404  (assignee_id 81)
--   Barra   Kailane  5521984690143  (assignee_id 30)
-- ⚠️ O da Vitoria e DDD 31, o que ja esta anotado no CLAUDE.md como estranho —
-- mas e o numero que a transferencia usa hoje. Conferir antes da Fase 1.
--
-- Regras: R15/R16/R17 (funil) + R2/R7/R8/R14 (conversa). As de conversa so
-- chegam aqui na fatia COMERCIAL, porque `radar_pauta_v1` passou a filtrar
-- `s.dominio = d.dominio` — sem isso a consultora receberia aluno matriculado.
--
-- ⚠️ NASCE DESLIGADO (ativo=false), igual a fatia do aluno. Fase 0: nada chega
-- a ninguem sem OK explicito do Luciano.

update public.radar_destinatarios
   set ativo = false,
       observacao = 'Substituido pelos tres destinatarios nominais por unidade em 03/09/2026.'
 where agente = 'mila' and nome = 'Consultora — DM';

insert into public.radar_destinatarios
  (agente, papel, camada, nome, canal, destino, unidade_id, dominio,
   regras, severidade_min, teto_por_turno, ativo, observacao)
values
  ('mila','consultora','operacional','Vitória — Campo Grande','dm','553171422022',
   '2ec861f6-023f-4d7b-9927-3960ad8c2a92','comercial',
   array['R15','R16','R17','R2','R7','R8','R14'],'alto',8,false,
   'Telefone de agentes.tools->transfer.config (assignee_id 33). ⚠️ DDD 31 — conferir antes de ligar a Fase 1.'),
  ('mila','consultora','operacional','Daiana — Recreio','dm','5521968060404',
   '95553e96-971b-4590-a6eb-0201d013c14d','comercial',
   array['R15','R16','R17','R2','R7','R8','R14'],'alto',8,false,
   'Telefone de agentes.tools->transfer.config (assignee_id 81).'),
  ('mila','consultora','operacional','Kailane — Barra','dm','5521984690143',
   '368d47f5-2d88-4475-bc14-ba084a9a348e','comercial',
   array['R15','R16','R17','R2','R7','R8','R14'],'alto',8,false,
   'Telefone de agentes.tools->transfer.config (assignee_id 30).')
on conflict do nothing;
