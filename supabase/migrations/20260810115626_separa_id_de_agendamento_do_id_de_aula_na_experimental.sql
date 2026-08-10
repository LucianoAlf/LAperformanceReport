-- `lead_experimentais.emusys_aula_id` esta documentado como "id unico da aula no Emusys",
-- mas para 59 linhas guarda o id do AGENDAMENTO do CRM — outra entidade. O campo mente.
--
-- Religamos hoje tudo o que era religavel cruzando com a API:
--   por LEAD 19 (`20260810112125`) | por LEAD+CURSO 6 (`...112239`) | por LEAD+HORARIO 9
--   + 174 linhas de duplicata consolidadas (`20260810005548`).  117 -> 246 ligadas.
--
-- As 59 que sobram NAO sao religaveis por dado:
--   32 — a aula NUNCA EXISTIU (agendamento cancelado): nao ha aula para apontar.
--   21 — par AGENDAMENTO x REALIZACAO: a aula real ja pertence a outra linha. Consolidar
--        exigiria escolher entre status contraditorios (Daniela Andrade `realizada` ->
--        `faltou`; Rayane Braga `realizada` -> `faltou` com outro professor) e A PRESENCA
--        NAO ARBITRA: dos 21 pares, 5 tem `presente`, ZERO tem `falta`, 16 sem registro.
--        Escolher sem evidencia seria inventar dado.
--    6 — multi-instrumento sem desempate por curso nem horario.
--
-- ESTA MIGRATION so faz o campo parar de mentir: move o id de agendamento para coluna
-- propria e deixa `emusys_aula_id` NULL. Nenhuma informacao se perde e nenhuma metrica muda
-- (um id que nao resolve em aula ja nao servia para nada).
--
-- Ganho pratico: quem consultar `emusys_aula_id` passa a poder confiar (97,6% resolvem em
-- aula real; os 6 restantes colidem com indice e sao curadoria). E o trigger
-- `fn_experimental_recebe_id_da_aula` considera religavel quem tem o campo NULL — entao
-- estas linhas voltam a ser candidatas automaticas se a aula aparecer no sync.
--
-- ⚠️ NEM TODAS PODEM SER MOVIDAS. O indice parcial `uq_lead_exp_legado`
--   UNIQUE (lead_id, data_experimental, nome_aluno) WHERE status <> 'cancelada'
--                                                     AND emusys_aula_id IS NULL
-- diz que duas experimentais nao-canceladas sem aula, do mesmo lead/dia/nome, sao duplicata.
-- Zerar o campo joga estas linhas nessa regra e algumas colidem (ex.: Julia Leite, lead
-- 10780, 16/07). Essas ficam como estao — a colisao e informacao, nao obstaculo: marca
-- exatamente os casos que precisam de curadoria humana.
--
-- Resultado: 53 de 59 movidas; 6 permanecem.
do $mig$
declare v_n int; v_quebradas int; v_sobra int;
begin
  select count(*) into v_quebradas
    from public.lead_experimentais le
   where le.emusys_aula_id is not null
     and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id);

  if v_quebradas <> 59 then
    raise exception 'ABORTADO: esperava 59 com id de agendamento, achei %', v_quebradas;
  end if;

  if exists (select 1 from information_schema.columns
              where table_name='lead_experimentais' and column_name='emusys_agendamento_id') then
    raise exception 'ABORTADO: coluna emusys_agendamento_id ja existe';
  end if;

  alter table public.lead_experimentais add column emusys_agendamento_id bigint;

  comment on column public.lead_experimentais.emusys_agendamento_id is
    'id do AGENDAMENTO de aula experimental no CRM do Emusys (POST /crm/aula_experimental). NAO e o id da aula — este vive em emusys_aula_id e so existe quando a aula chegou a acontecer. Ate 10/08/2026 os dois eram gravados no mesmo campo pelo webhook, o que quebrava a reconciliacao.';

  comment on column public.lead_experimentais.emusys_aula_id is
    'id da AULA no Emusys (GET /aulas). Quando preenchido, DEVE resolver em aulas_emusys.emusys_id. NULL quando a aula nao aconteceu (agendamento cancelado) ou pertence a outra linha. O id do agendamento fica em emusys_agendamento_id.';

  -- Move so quem nao colide com o indice parcial de duplicata legada.
  with candidatas as (
    select le.id, le.lead_id, le.data_experimental, le.nome_aluno, le.status, le.emusys_aula_id
      from public.lead_experimentais le
     where le.emusys_aula_id is not null
       and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id)
  ), seguras as (
    select c.* from candidatas c
     where c.status = 'cancelada'   -- cancelada fica fora do indice parcial
        or not exists (
             select 1 from public.lead_experimentais o
              where o.lead_id = c.lead_id and o.data_experimental = c.data_experimental
                and o.nome_aluno = c.nome_aluno and o.status <> 'cancelada'
                and o.emusys_aula_id is null and o.id <> c.id)
       and 1 = (select count(*) from candidatas c2
                 where c2.lead_id = c.lead_id and c2.data_experimental = c.data_experimental
                   and c2.nome_aluno = c.nome_aluno and c2.status <> 'cancelada')
  )
  update public.lead_experimentais le
     set emusys_agendamento_id = le.emusys_aula_id,
         emusys_aula_id = null
    from seguras s
   where le.id = s.id;
  get diagnostics v_n = row_count;

  select count(*) into v_sobra
    from public.lead_experimentais le
   where le.emusys_aula_id is not null
     and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id);

  if v_n = 0 then
    raise exception 'ABORTADO: nenhuma linha movida';
  end if;

  raise notice 'movidas % de 59; sobram % com id de agendamento em emusys_aula_id (colidem com uq_lead_exp_legado, sao curadoria)', v_n, v_sobra;
end
$mig$;
