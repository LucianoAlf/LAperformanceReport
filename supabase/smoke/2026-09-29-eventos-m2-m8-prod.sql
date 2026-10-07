-- Smoke M2-M8 EM PRODUCAO (pos-migration) — 2026-09-29
-- Usa dados reais (unidades/alunos/cursos/staff) e um evento descartavel
-- '[SMOKE]' que e apagado no fim. Escopo M2-M8: sem bilheteria (M9 nao aplicada).
-- Fixtures reais: Barra=368d47f5-…, Recreio=95553e96-…, aluno Bento=2536 (Barra),
-- aluna Agatha=421 (Recreio → chave ext:), curso 6, staff Arthur, professores 24/675.
\set ON_ERROR_STOP off
\pset footer off

-- ============ FIXTURE: 2 eventos descartaveis ============
insert into public.evento (unidade_id, tipo, titulo, data_evento, horario_inicio, status, duracao_padrao_segundos, intervalo_entre_blocos_segundos, cortesias_por_aluno)
values ('368d47f5-2d88-4475-bc14-ba084a9a348e','recital','[SMOKE] validacao M2-M8','2026-12-20','10:00','rascunho',180,300,2);

insert into public.evento (unidade_id, tipo, titulo, data_evento, horario_inicio, status, duracao_padrao_segundos, intervalo_entre_blocos_segundos)
values ('95553e96-971b-4590-a6eb-0201d013c14d','recital','[SMOKE] outro evento','2026-12-21','10:00','rascunho',180,300);

insert into public.evento_bloco (evento_id, nome, ordem, horario_inicial)
select id, 'Bloco 1', 1, '10:00'::time from public.evento where titulo='[SMOKE] validacao M2-M8';

insert into public.evento_bloco (evento_id, nome, ordem, horario_inicial)
select id, 'Bloco X', 1, '10:00'::time from public.evento where titulo='[SMOKE] outro evento';

-- ============ T1: apresentacao normal (deriva pessoa_chave + selo) ============
insert into public.evento_apresentacao (bloco_id, ordem, aluno_id, curso_id)
select b.id, 1, 2536, 6 from public.evento_bloco b join public.evento e on e.id=b.evento_id
 where e.titulo='[SMOKE] validacao M2-M8';

select 'T1 apresentacao', pessoa_chave, ap.unidade_id='368d47f5-2d88-4475-bc14-ba084a9a348e' as unidade_ok,
       unidade_origem_id='368d47f5-2d88-4475-bc14-ba084a9a348e' as selo_ok, tipo
  from public.evento_apresentacao ap join public.evento_bloco b on b.id=ap.bloco_id
  join public.evento e on e.id=b.evento_id where e.titulo='[SMOKE] validacao M2-M8' and ap.aluno_id=2536;

-- ============ T2: numero sem aluno ============
insert into public.evento_apresentacao (bloco_id, ordem, tipo, titulo)
select b.id, 2, 'abertura', 'Abertura do recital' from public.evento_bloco b
  join public.evento e on e.id=b.evento_id where e.titulo='[SMOKE] validacao M2-M8';

-- negativo: abertura sem titulo tem que falhar
do $$ begin
  insert into public.evento_apresentacao (bloco_id, ordem, tipo)
  select b.id, 99, 'abertura' from public.evento_bloco b
    join public.evento e on e.id=b.evento_id where e.titulo='[SMOKE] validacao M2-M8';
  raise notice 'T2 FALHOU: abertura sem titulo passou';
exception when others then raise notice 'T2 ok: %', sqlerrm; end $$;

-- ============ T3: aluno de fora (ext:) ============
insert into public.evento_apresentacao (bloco_id, ordem, aluno_id, curso_id)
select b.id, 3, 421, 6 from public.evento_bloco b join public.evento e on e.id=b.evento_id
 where e.titulo='[SMOKE] validacao M2-M8';

select 'T3 aluno_fora', pessoa_chave, unidade_origem_id='95553e96-971b-4590-a6eb-0201d013c14d' as selo_recreio
  from public.evento_apresentacao ap join public.evento_bloco b on b.id=ap.bloco_id
  join public.evento e on e.id=b.evento_id where e.titulo='[SMOKE] validacao M2-M8' and ap.aluno_id=421;

-- ============ T4: participacao + convidado + check-in ============
insert into public.evento_participacao (evento_id, aluno_id, status)
select id, 2536, 'participa' from public.evento where titulo='[SMOKE] validacao M2-M8';

insert into public.evento_convidado (evento_id, nome)
select id, 'Maria Smoke' from public.evento where titulo='[SMOKE] validacao M2-M8';

insert into public.evento_convidado_participacao (convidado_id, participacao_id)
select c.id, p.id from public.evento_convidado c join public.evento_participacao p on p.evento_id=c.evento_id
 where c.nome='Maria Smoke' and p.aluno_id=2536;

insert into public.evento_convidado_checkin (convidado_id, bloco_id)
select c.id, b.id from public.evento_convidado c join public.evento e on e.id=c.evento_id
  join public.evento_bloco b on b.evento_id=e.id and b.nome='Bloco 1'
 where c.nome='Maria Smoke';

-- negativo: check-in no bloco do OUTRO evento tem que falhar
do $$ begin
  insert into public.evento_convidado_checkin (convidado_id, bloco_id)
  select c.id, b.id from public.evento_convidado c
    join public.evento_bloco b on b.evento_id=(select id from public.evento where titulo='[SMOKE] outro evento')
   where c.nome='Maria Smoke';
  raise notice 'T4 FALHOU: check-in em bloco de outro evento passou';
exception when others then raise notice 'T4 ok: %', sqlerrm; end $$;

select 'T4 checkin', count(*)=1 as ok from public.evento_convidado_checkin ck
  join public.evento_convidado c on c.id=ck.convidado_id where c.nome='Maria Smoke';

-- ============ T5: cota de cortesias (2) — 3a tem que falhar ============
insert into public.evento_convidado (evento_id, nome)
select id, 'Convidado Dois' from public.evento where titulo='[SMOKE] validacao M2-M8';
insert into public.evento_convidado_participacao (convidado_id, participacao_id)
select c.id, p.id from public.evento_convidado c join public.evento_participacao p on p.evento_id=c.evento_id
 where c.nome='Convidado Dois' and p.aluno_id=2536;

insert into public.evento_convidado (evento_id, nome)
select id, 'Convidado Tres' from public.evento where titulo='[SMOKE] validacao M2-M8';
-- trigger de cota e deferido: o insert na ponte abaixo tem que falhar no commit
begin;
insert into public.evento_convidado_participacao (convidado_id, participacao_id)
select c.id, p.id from public.evento_convidado c join public.evento_participacao p on p.evento_id=c.evento_id
 where c.nome='Convidado Tres' and p.aluno_id=2536;
commit;
rollback;

select 'T5 cota', count(*)=2 as ok_2_convidados from public.evento_convidado_participacao cp
  join public.evento_participacao p on p.id=cp.participacao_id where p.aluno_id=2536;

-- ============ T6: formatura ============
update public.evento_participacao set formatura=true, formatura_tipo='la' where aluno_id=2536;
-- negativo: formatura sem tipo tem que falhar
do $$ begin
  update public.evento_participacao set formatura=true, formatura_tipo=null where aluno_id=2536;
  raise notice 'T6 FALHOU: formatura sem tipo passou';
exception when others then raise notice 'T6 ok: %', sqlerrm; end $$;

-- ============ T7: comunicacao append-only ============
insert into public.evento_comunicacao (participacao_id, canal)
select id, 'whatsapp' from public.evento_participacao where aluno_id=2536;

begin;
set local role authenticated;
update public.evento_comunicacao set canal='email' where true;
rollback;

select 'T7 comunicacao', count(*)>=1 as inseriu from public.evento_comunicacao cm
  join public.evento_participacao p on p.id=cm.participacao_id where p.aluno_id=2536;

-- ============ T8: staff no bloco certo / errado ============
insert into public.evento_staff (evento_id, staff_unidade_id, funcao, bloco_id)
select e.id, '909c8341-671f-45ea-a0aa-f4bd9d61a2ce', 'credenciamento', b.id
  from public.evento e join public.evento_bloco b on b.evento_id=e.id and b.nome='Bloco 1'
 where e.titulo='[SMOKE] validacao M2-M8';

do $$ begin
  insert into public.evento_staff (evento_id, staff_unidade_id, funcao, bloco_id)
  select e.id, '909c8341-671f-45ea-a0aa-f4bd9d61a2ce', 'saida', b.id
    from public.evento e join public.evento_bloco b on b.evento_id<>e.id
   where e.titulo='[SMOKE] validacao M2-M8' and b.evento_id=(select id from public.evento where titulo='[SMOKE] outro evento');
  raise notice 'T8 FALHOU: staff em bloco de outro evento passou';
exception when others then raise notice 'T8 ok: %', sqlerrm; end $$;

-- ============ T9: professor palco != apoio ============
update public.evento_apresentacao ap set professor_palco_id=24, professor_apoio_id=675
  from public.evento_bloco b join public.evento e on e.id=b.evento_id
 where ap.bloco_id=b.id and e.titulo='[SMOKE] validacao M2-M8' and ap.aluno_id=2536;

do $$ begin
  update public.evento_apresentacao ap set professor_palco_id=24, professor_apoio_id=24
    from public.evento_bloco b join public.evento e on e.id=b.evento_id
   where ap.bloco_id=b.id and e.titulo='[SMOKE] validacao M2-M8' and ap.aluno_id=421;
  raise notice 'T9 FALHOU: palco=apoio passou';
exception when others then raise notice 'T9 ok: %', sqlerrm; end $$;

-- ============ T10: audit_log capturou as escritas evento_* ============
select 'T10 audit', tabela, count(*) from public.audit_log
 where tabela like 'evento_%' and created_at > now() - interval '10 minutes'
 group by tabela order by tabela;

-- ============ CLEANUP ============
delete from public.evento where titulo in ('[SMOKE] validacao M2-M8','[SMOKE] outro evento');

select 'CLEANUP restos',
  (select count(*) from public.evento where titulo like '[SMOKE]%') as eventos,
  (select count(*) from public.evento_convidado where nome like '%Smoke%' or nome like 'Convidado%') as convidados,
  (select count(*) from public.evento_participacao where aluno_id in (2536,421)
     and evento_id not in (select id from public.evento)) as participacoes_orfas;
