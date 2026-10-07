-- ============================================================
-- SMOKE M2-M9 — branch dev-eventos (schema de prod + migrations)
-- Testes negativos rodam soltos: o ERRO esperado aparece no log.
-- ============================================================
\pset pager off
\set ON_ERROR_STOP off

-- ---------- FIXTURES (limpa execucao anterior) ----------
delete from evento_bloco where evento_id in (select id from evento where titulo like '%Smoke%' or titulo='Outro Evento');
delete from evento where titulo like '%Smoke%' or titulo='Outro Evento';
alter table public.alunos disable trigger user;
delete from alunos where emusys_student_id in ('SMK001','SMK002');
alter table public.alunos enable trigger user;
delete from staff_unidade where nome='Staff Smoke';
delete from professores where nome in ('Prof A','Prof B');
delete from cursos where nome='Piano Smoke';
delete from tipos_matricula where codigo='SMK';
delete from unidades where codigo in ('SMK-B','SMK-R');

insert into unidades (nome, codigo) values ('Barra Smoke','SMK-B'), ('Recreio Smoke','SMK-R');
insert into tipos_matricula (nome, codigo, entra_ticket_medio, conta_como_pagante)
values ('Mensalidade Smoke','SMK', true, true) returning id \gset tm_

alter table public.alunos disable trigger user;
insert into alunos (nome, unidade_id, emusys_student_id, tipo_matricula_id)
values ('Aluna Barra',   (select id from unidades where codigo='SMK-B'), 'SMK001', :tm_id) returning id \gset a1_
insert into alunos (nome, unidade_id, emusys_student_id, tipo_matricula_id)
values ('Aluno Recreio', (select id from unidades where codigo='SMK-R'), 'SMK002', :tm_id) returning id \gset a2_
alter table public.alunos enable trigger user;

insert into evento (unidade_id, titulo, data_evento, cortesias_por_aluno)
select id, 'Recital Smoke', '2026-11-13', 2 from unidades where codigo='SMK-B'
returning id \gset ev_
insert into evento_bloco (evento_id, nome, data, horario_inicial, capacidade)
values (:ev_id, 'Bloco 1', '2026-11-13', '19:00', 4) returning id \gset bl_
insert into evento (unidade_id, titulo, data_evento)
select id, 'Outro Evento', '2026-11-15' from unidades where codigo='SMK-R'
returning id \gset ev2_
insert into evento_bloco (evento_id, nome, data) values (:ev2_id, 'B outro', '2026-11-15')
returning id \gset bl2_
insert into cursos (nome) values ('Piano Smoke') returning id \gset c_
insert into professores (nome) values ('Prof A') returning id \gset pf_
insert into professores (nome) values ('Prof B') returning id \gset pf2_

-- ============ T1: apresentacao comum ============
select '--- T1: apresentacao aluno mesma unidade ---' as _;
insert into evento_apresentacao (bloco_id, ordem, aluno_id, curso_id, musica)
values (:bl_id, 1, :a1_id, :c_id, 'Fur Elise') returning id \gset ap_
select ap.id, ap.tipo, ap.pessoa_chave, u.codigo as unidade,
       ap.unidade_origem_id = (select id from unidades where codigo='SMK-B') as origem_barra
  from evento_apresentacao ap join unidades u on u.id = ap.unidade_id
 where ap.id = :ap_id;

-- ============ T2: numero sem aluno ============
select '--- T2: abertura sem aluno ---' as _;
insert into evento_apresentacao (bloco_id, ordem, tipo, titulo)
values (:bl_id, 0, 'abertura', 'Abertura professores') returning id, tipo, titulo;
select '>>> esperado ERRO: abertura sem titulo' as _;
insert into evento_apresentacao (bloco_id, ordem, tipo)
values (:bl_id, 0, 'abertura');

-- ============ T3: aluno de outra unidade ============
select '--- T3: aluno de fora (ext:) ---' as _;
insert into evento_apresentacao (bloco_id, ordem, aluno_id, curso_id, musica)
values (:bl_id, 2, :a2_id, :c_id, 'De outra unidade')
returning id, pessoa_chave,
       unidade_origem_id = (select id from unidades where codigo='SMK-R') as origem_recreio;

-- ============ T4: participacao + confirmado_origem ============
select '--- T4: participacao ---' as _;
insert into evento_participacao (evento_id, pessoa_chave, aluno_id, status)
values (:ev_id, public.fn_evento_pessoa_chave(:a1_id, :ev_id), :a1_id, 'participa')
returning id, status, (confirmado_em is not null) as carimbou, confirmado_origem \gset pt_

-- ============ T5: convidado cortesia + herda bloco ============
select '--- T5: convidado cortesia herda bloco ---' as _;
insert into evento_convidado (evento_id, nome) values (:ev_id, 'Mae da Aluna') returning id \gset cv_
insert into evento_convidado_participacao (convidado_id, participacao_id)
values (:cv_id, :pt_id);
select (bloco_id = :bl_id) as herdou_bloco, tipo_entrada
  from evento_convidado where id = :cv_id;

-- ============ T6: check-in ============
select '--- T6: check-in ---' as _;
insert into evento_convidado_checkin (convidado_id, bloco_id)
values (:cv_id, :bl_id) returning convidado_id, bloco_id;
select '>>> esperado ERRO: check-in em bloco de outro evento' as _;
insert into evento_convidado_checkin (convidado_id, bloco_id) values (:cv_id, :bl2_id);

-- ============ T7: cota de cortesias (2/aluno) ============
select '--- T7: cota cortesia=2 (3o deve falhar) ---' as _;
insert into evento_convidado (evento_id, nome) values (:ev_id, 'Pai da Aluna') returning id \gset cv2_
insert into evento_convidado_participacao (convidado_id, participacao_id) values (:cv2_id, :pt_id);
insert into evento_convidado (evento_id, nome) values (:ev_id, 'Avo da Aluna') returning id \gset cv3_
select '>>> esperado ERRO: terceira cortesia acima da cota' as _;
insert into evento_convidado_participacao (convidado_id, participacao_id) values (:cv3_id, :pt_id);
select count(*) as cortesias_da_participacao
  from evento_convidado_participacao cp
  join evento_convidado c on c.id = cp.convidado_id
 where cp.participacao_id = :pt_id and c.tipo_entrada='cortesia';

-- ============ T8: formatura ============
select '--- T8: formatura ---' as _;
update evento_participacao set formatura = true, formatura_tipo = 'kids' where id = :pt_id returning formatura;
select '>>> esperado ERRO: formatura sem tipo' as _;
update evento_participacao set formatura_tipo = null, formatura = true where id = :pt_id;

-- ============ T9: comunicacao append-only ============
select '--- T9: comunicacao ---' as _;
insert into evento_comunicacao (participacao_id, canal, texto, origem)
values (:pt_id, 'whatsapp', 'Convite enviado', 'la_report') returning id, canal \gset cm_
select '>>> update em comunicacao como authenticated (esperado: 0 linhas — RLS sem policy de update)' as _;
set role authenticated;
update evento_comunicacao set texto = 'editado' where id = :cm_id;
reset role;
select (texto = 'Convite enviado') as texto_intocado from evento_comunicacao where id = :cm_id;

-- ============ T10: staff ============
select '--- T10: staff ---' as _;
insert into staff_unidade (unidade_id, nome, cargo, foto_url)
select id, 'Staff Smoke', 'recepcao', 'x' from unidades where codigo='SMK-B' returning id \gset st_
insert into evento_staff (evento_id, staff_unidade_id, funcao, bloco_id)
values (:ev_id, :'st_id', 'credenciamento', :bl_id) returning id, funcao;
select '>>> esperado ERRO: staff com bloco de outro evento' as _;
insert into evento_staff (evento_id, staff_unidade_id, funcao, bloco_id)
values (:ev_id, :'st_id', 'credenciamento', :bl2_id);

-- ============ T11: professor palco/apoio ============
select '--- T11: professor palco/apoio ---' as _;
update evento_apresentacao set professor_palco_id = :pf_id, professor_apoio_id = :pf2_id
 where id = :ap_id returning professor_palco_id, professor_apoio_id;
select '>>> esperado ERRO: palco=apoio' as _;
update evento_apresentacao set professor_apoio_id = :pf_id where id = :ap_id;

-- ============ M9: BILHETERIA ============
select '--- T12: preco + pacote ---' as _;
insert into evento_ingresso_preco (evento_id, preco_unitario, preco_meia)
values (:ev_id, 100, 50);
insert into evento_ingresso_pacote (evento_id, quantidade_minima, desconto_pct)
values (:ev_id, 2, 10), (:ev_id, 5, 20);

select '--- T13: venda RPC + lotacao (cap=4, cortesias=2 → livres=2) ---' as _;
select bloco_id, capacidade, cortesias, vendidos_pagos, pendentes, livres
  from vw_evento_bloco_lotacao where bloco_id = :bl_id;

-- venda de 2 com pacote automatico (qtd>=2 → 10%)
select public.evento_bilheteria_vender_v1(
  :ev_id, :bl_id, 'Comprador Smoke', 2, 'pix', 'balcao',
  '11999990000', null, 0, null,
  '[{"nome":"Conv Um"},{"nome":"Conv Dois"}]'::jsonb,
  false, null, 'venda teste'
) as venda_id \gset vd_

select id, quantidade, valor_bruto, desconto_pct, valor_final, status
  from evento_ingresso_venda where id = :vd_venda_id;
select count(*) as convidados_da_venda,
       bool_and(tipo_entrada='vendido' and bloco_id = :bl_id) as todos_com_bloco
  from evento_convidado where venda_id = :vd_venda_id;

select '--- T13b: venda acima da lotacao (livres=0) ---' as _;
select '>>> esperado ERRO: Bloco lotado' as _;
select public.evento_bilheteria_vender_v1(
  :ev_id, :bl_id, 'Fura Fila', 1, 'pix', 'porta',
  null, null, 0, null, '[{"nome":"Sem Lugar"}]'::jsonb, false, null, null);

select '--- T14: pagar sem identificador (pix) ---' as _;
select '>>> esperado ERRO: pago sem identificador' as _;
update evento_ingresso_venda set status='pago', pago_em=now() where id = :vd_venda_id;
update evento_ingresso_venda
   set status='pago', pago_em=now(), pagamento_identificador='PIX-SMK-001'
 where id = :vd_venda_id returning status, conciliacao_status;

select '--- T15: check-in vendido (venda paga) ---' as _;
insert into evento_convidado_checkin (convidado_id, bloco_id)
select id, :bl_id from evento_convidado where venda_id = :vd_venda_id limit 1
returning convidado_id;

select '--- T16: conciliacao + estorno pos-conciliacao ---' as _;
select venda_id, unidade_id, valor_final, forma_pagamento
  from evento_bilheteria_pendentes_v1((select id from unidades where codigo='SMK-B'), null, null);
select public.evento_bilheteria_conciliar_v1(:vd_venda_id, 'conciliado', 'SF-LANC-42', null) as conciliou;
select '>>> reembolso DEPOIS de conciliado (bug da v3 corrigido)' as _;
update evento_ingresso_venda set status='reembolsado' where id = :vd_venda_id
returning status, conciliacao_status;
select '>>> feed de estornos pendentes para a Sol' as _;
select venda_id, valor_final, forma_pagamento, pagamento_identificador, conciliacao_ref, status
  from evento_bilheteria_estornos_v1((select id from unidades where codigo='SMK-B'), null, null);
select public.evento_bilheteria_conciliar_v1(:vd_venda_id, 'estornado', 'SF-EST-07', 'estorno lancado') as estornado;
select status, conciliacao_status, conciliacao_ref from evento_ingresso_venda where id = :vd_venda_id;

select '--- T17: audit_log ---' as _;
select tabela, acao, origem, count(*)
  from audit_log
 where tabela like 'evento%'
 group by 1,2,3 order by 1,2;
