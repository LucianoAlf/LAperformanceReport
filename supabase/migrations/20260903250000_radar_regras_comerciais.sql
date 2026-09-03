-- 1º ANDAR da vertical COMERCIAL — as regras da Mila/consultoras.
--
-- Dono do sinal: **consultora da unidade** (decisão do Luciano). A Mila detecta
-- e entrega; ela não age sozinha.
--
-- Dimensionamento feito ANTES de criar regra, sobre 120 dias de
-- `vw_jornada_lead_v1` (leads não convertidos e não perdidos):
--   C1 novo sem 1o contato > 2d ....... 0     -> regra DESCARTADA, sem lastro:
--                                              `data_primeiro_contato` e
--                                              preenchida na criacao do lead
--   C2 exp. agendada ja passou ........ 103   -> R16
--   C3 exp. REALIZADA sem desfecho .... 179   -> R15  (maior valor)
--   C4 faltou e ninguem remarcou ...... 81    -> R17
--   C5 parado 7-30d ................... 605   -> FORA do 1o andar
--   C6 parado > 30d ................... 2.148 -> FORA: e cemiterio, nao lista
--                                              de trabalho. Virar sinal seria a
--                                              mesma armadilha do R8 ingenuo
--                                              (248 casos, 5% de precisao).
-- C5 e C6 viram METRICA do 2o andar ("tamanho da base parada"), nao alerta.

insert into public.radar_regras
  (codigo, titulo, descricao, entidade_tipo, origem, severidade_padrao,
   canonico, ativo, dominio, params, lastro, orientacao_padrao, versao)
values
(
  'R15',
  'Experimental realizada e ninguém fechou',
  'O lead veio à aula experimental, fez, e a conversa parou sem matrícula nem motivo registrado.',
  'lead', 'sql_comercial', 'alto', true, true, 'comercial',
  '{"dias_sem_desfecho": 3}'::jsonb,
  'Medido em 03/09/2026 sobre 120 dias: 179 leads fizeram a experimental e ficaram mais de 3 dias sem desfecho (Recreio 80, CG 55, Barra 44). É o ponto mais caro do funil — a pessoa já veio até a escola, já conheceu o professor, e o custo de trazê-la de novo é muito maior do que o de ligar hoje.',
  'Ligar HOJE, não mandar mensagem. Perguntar o que achou da aula e fechar ou registrar o motivo real da não-matrícula. Se não fechar, o motivo tem de ser gravado — sem ele o funil não aprende.',
  'v1'
),
(
  'R16',
  'Experimental agendada que já passou sem desfecho',
  'A data da aula experimental já passou e ninguém marcou se ela aconteceu, se faltou, ou o que houve.',
  'lead', 'sql_comercial', 'alto', true, true, 'comercial',
  '{"dias_apos_data": 0}'::jsonb,
  'Medido em 03/09/2026 sobre 120 dias: 103 casos. ⚠️ ATENÇÃO AO VIÉS: 93 dos 103 são de Campo Grande, contra 9 do Recreio e 1 da Barra. Uma concentração de 90% numa unidade é assinatura de PROCESSO (CG não atualiza o status depois da aula), não de oportunidade comercial. Tratar os de CG como higiene de cadastro antes de tratar como lead esquecido.',
  'Confirmar com o professor se a aula aconteceu e atualizar o status. Se aconteceu, virou R15 e precisa de ligação; se não, remarcar. Em Campo Grande, checar primeiro se é só o lançamento que está atrasado.',
  'v1'
),
(
  'R17',
  'Faltou à experimental e ninguém remarcou',
  'O lead não compareceu à aula experimental e não há nova data marcada.',
  'lead', 'sql_comercial', 'alto', true, true, 'comercial',
  '{"dias_apos_falta": 2}'::jsonb,
  'Medido em 03/09/2026 sobre 120 dias: 81 casos (Recreio 38, Barra 23, CG 20). Faltar não é desistir — quem agendou demonstrou interesse real. Sem remarcação, o interesse morre por inércia da escola, não do lead.',
  'Ligar para remarcar, sem cobrança pela falta. Oferecer duas opções de horário em vez de perguntar "quando pode" — pergunta aberta em lead frio costuma não ter resposta.',
  'v1'
)
on conflict (codigo) do update
  set titulo            = excluded.titulo,
      descricao         = excluded.descricao,
      entidade_tipo     = excluded.entidade_tipo,
      origem            = excluded.origem,
      severidade_padrao = excluded.severidade_padrao,
      dominio           = excluded.dominio,
      params            = excluded.params,
      lastro            = excluded.lastro,
      orientacao_padrao = excluded.orientacao_padrao,
      versao            = excluded.versao,
      atualizada_em     = now();
