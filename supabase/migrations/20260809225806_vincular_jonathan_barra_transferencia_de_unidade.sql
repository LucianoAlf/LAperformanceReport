-- Jonathan de Lima Santos (JOHN) transferiu do Recreio para a Barra.
--
-- PROVA (Emusys GET /pessoas/buscar?email=johnlamusic@gmail.com nas duas unidades):
--   Recreio  id 2191  "Jonathan de Lima Santos (JOHN)"  tel (21) 97998-9962  CPF 17802852722
--   Barra    id 1257  "Jonathan de Lima dos Santos"     tel (21) 99799-8996  CPF 17802852722
-- MESMO CPF e MESMO e-mail. Os ids do Emusys sao POR UNIDADE, entao trocar de unidade
-- gera id novo — e ninguem ligou o 1257 ao nosso cadastro 60.
--
-- Corroboracao independente:
--   * o telefone do lado Recreio bate EXATO com professores.telefone_whatsapp do id 60
--     (5521979989962); o da Barra e o mesmo numero digitado errado (um "9" a mais no
--     comeco, um "2" a menos no fim).
--   * disciplina: no Recreio dava "Montagem em Teatro Musical", na Barra da "Teatro Musical".
--   * cronologia sem sobreposicao: Recreio ate 19/06/2026, Barra a partir de 07/08/2026.
--
-- EFEITO: as 12 aulas da turma TM_Sex_17 (aluno Tito Lapa Cazarim, ate 11/09) passam a ter
-- professor, e o score do Jonathan deixa de ficar bloqueado por "disponibilidade canonica
-- ausente" — ele e professor ativo de verdade, nao fantasma.
--
-- Sobrevive ao cron das 07:00: `sync-professores-emusys` so rebaixa vinculo cujo emusys_id
-- sumiu da lista atual da unidade (index.ts:359). O 1257 esta na lista da Barra.
--
-- ⚠️ COMO ISSO PASSOU BATIDO: `professores.emusys_id` esta 0% preenchido nos 60 registros;
-- a identidade do professor nao esta ancorada no id da fonte. O casamento e por NOME, e
-- "Jonathan de Lima Santos" != "Jonathan de Lima dos Santos". O endpoint
-- `/pessoas/buscar` devolve CPF e funciona entre unidades — e a ancora que falta.
do $mig$
declare
  v_barra uuid;
  v_ja int;
  v_novo_id bigint;
  v_aulas int;
begin
  select id into v_barra from unidades where codigo = 'BARRA';
  if v_barra is null then
    raise exception 'ABORTADO: unidade BARRA nao encontrada';
  end if;

  -- Guarda 1: nao duplicar o vinculo
  select count(*) into v_ja from professores_unidades
   where unidade_id = v_barra and (professor_id = 60 or emusys_id = 1257);
  if v_ja > 0 then
    raise exception 'ABORTADO: ja existe vinculo Barra p/ professor 60 ou emusys 1257 (% linhas)', v_ja;
  end if;

  -- Guarda 2: o professor 60 precisa existir e estar ativo
  if not exists (select 1 from professores where id = 60 and ativo) then
    raise exception 'ABORTADO: professor 60 inexistente ou inativo';
  end if;

  -- Guarda 3: as aulas orfas precisam ser exatamente as que medimos
  select count(*) into v_aulas from aulas_emusys
   where emusys_professor_id = 1257 and professor_id is null and unidade_id = v_barra;
  if v_aulas <> 12 then
    raise exception 'ABORTADO: esperava 12 aulas orfas do emusys 1257 na Barra, achei %', v_aulas;
  end if;

  insert into professores_unidades (
    unidade_id, professor_id, emusys_id, emusys_nome, emusys_nome_normalizado,
    emusys_ativo, validacao_status, origem, identidade_historica_valida,
    validado_em, validado_por, last_seen_em
  ) values (
    v_barra, 60, 1257, 'Jonathan de Lima dos Santos',
    lower(unaccent(btrim('Jonathan de Lima dos Santos'))),
    true, 'validado_humano', 'cpf_igual_emusys_pessoas_buscar', false,
    now(), 'Luciano/Claude — CPF 17802852722 conferido nas 2 unidades', now()
  ) returning id into v_novo_id;

  -- Backfill das aulas ja sincronizadas (o sync so preenche no proximo ciclo)
  update aulas_emusys
     set professor_id = 60
   where emusys_professor_id = 1257 and professor_id is null and unidade_id = v_barra;
  get diagnostics v_aulas = row_count;
  if v_aulas <> 12 then
    raise exception 'ABORTADO: backfill tocou % aulas, esperava 12', v_aulas;
  end if;

  -- A identidade historica do Recreio esta correta (ele saiu de la): marca resolvida.
  update professores_emusys_divergencias
     set resolvido = true,
         decisao = 'transferencia_para_barra_confirmada_por_cpf',
         decidido_por = 'Luciano/Claude',
         decidido_em = now()
   where id in (24, 26) and not resolvido;

  raise notice 'vinculo Barra criado id=%; 12 aulas vinculadas ao professor 60', v_novo_id;
end
$mig$;
