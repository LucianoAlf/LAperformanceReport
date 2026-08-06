-- Teste: o contexto do professor conta o passivo em vez de omiti-lo
--
-- O defeito nao aparecia em nenhuma consulta SQL: `pendencias_cobraveis` = 0
-- estava CERTO. O erro so existia na resposta — o Fabio lia 0 e afirmava que
-- nao havia nada em julho. Por isso o teste mede a presenca e o conteudo da
-- chave nova, e o mutante N3 guarda a fronteira que NAO pode mudar junto:
-- a cobranca continua so com o que e cobravel.
--
-- Roda com o runner da casa (mora no la-teacher, mesmo banco):
--   node D:/la-teacher/scripts/rodar-teste-sql.mjs \
--     supabase/migrations/20260806103000_fabio_contexto_conta_o_passivo.sql \
--     supabase/migrations/20260806103000_fabio_contexto_conta_o_passivo.test.sql
--
-- Nenhum prontuario real vira bancada: tudo ZZTESTE, ids negativos.

create temp table _res(passo text, esperado text, obtido text) on commit drop;

-- ── Premissas da fixture ───────────────────────────────────────────────────
insert into _res select 'premissa: aula de 5 dias atras e cobravel', 'sim',
  case when current_date - 5 >= public.fn_data_corte_cobranca() then 'sim'
       else 'NAO — o corte andou, a fixture apodreceu' end;

-- ── Cenario ────────────────────────────────────────────────────────────────
insert into public.unidades (id, nome, codigo) values
  ('00000000-0000-4000-8000-000000000420', 'ZZTESTE unidade 042', 'ZZTESTE042')
on conflict (id) do nothing;

insert into public.usuarios (id, nome, email, auth_user_id) values
  (-42901, 'ZZTESTE Usuario Com Passivo', 'zzteste-compassivo-42@exemplo.invalido',
   '00000000-0000-4000-8000-000000042901'),
  (-42902, 'ZZTESTE Usuario Sem Passivo', 'zzteste-sempassivo-42@exemplo.invalido',
   '00000000-0000-4000-8000-000000042902');

insert into public.professores (id, nome, usuario_id) values
  (-42001, 'ZZTESTE Professor Com Passivo', -42901),
  (-42002, 'ZZTESTE Professor Sem Passivo', -42902);

insert into public.alunos (id, nome, unidade_id) values
  (-42001, 'ZZTESTE Aluno Um',    '00000000-0000-4000-8000-000000000420'),
  (-42002, 'ZZTESTE Aluno Dois',  '00000000-0000-4000-8000-000000000420'),
  (-42003, 'ZZTESTE Aluno Tres',  '00000000-0000-4000-8000-000000000420'),
  (-42004, 'ZZTESTE Aluno Quatro','00000000-0000-4000-8000-000000000420'),
  (-42005, 'ZZTESTE Aluno Cinco', '00000000-0000-4000-8000-000000000420'),
  (-42006, 'ZZTESTE Aluno Seis',  '00000000-0000-4000-8000-000000000420');

insert into public.aulas_emusys
  (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
   tipo, curso_nome, turma_nome, professor_id, professor_nome, cancelada, anotacoes)
values
  -- COBRAVEL do professor com passivo: 2 alunos
  (-42001, -942001, '00000000-0000-4000-8000-000000000420', current_date - 5,
   ((current_date - 5) + time '14:00') at time zone 'America/Sao_Paulo',
   ((current_date - 5) + time '15:00') at time zone 'America/Sao_Paulo',
   'turma', 'ZZTESTE Canto T', 'ZZTESTE Canto T1', -42001, 'ZZTESTE Professor Com Passivo', false, null),

  -- PASSIVO mais antigo: 2 alunos
  (-42002, -942002, '00000000-0000-4000-8000-000000000420', public.fn_data_corte_cobranca() - 10,
   ((public.fn_data_corte_cobranca() - 10) + time '14:00') at time zone 'America/Sao_Paulo',
   ((public.fn_data_corte_cobranca() - 10) + time '15:00') at time zone 'America/Sao_Paulo',
   'turma', 'ZZTESTE Violao T', 'ZZTESTE Violao T1', -42001, 'ZZTESTE Professor Com Passivo', false, null),

  -- PASSIVO na vespera do corte: 1 aluno. Vespera de proposito — se o filtro
  -- inverter, o `ate` denuncia na hora.
  (-42003, -942003, '00000000-0000-4000-8000-000000000420', public.fn_data_corte_cobranca() - 1,
   ((public.fn_data_corte_cobranca() - 1) + time '10:00') at time zone 'America/Sao_Paulo',
   ((public.fn_data_corte_cobranca() - 1) + time '11:00') at time zone 'America/Sao_Paulo',
   'turma', 'ZZTESTE Bateria T', 'ZZTESTE Bateria T1', -42001, 'ZZTESTE Professor Com Passivo', false, null),

  -- Professor SEM passivo: so uma cobravel
  (-42004, -942004, '00000000-0000-4000-8000-000000000420', current_date - 5,
   ((current_date - 5) + time '16:00') at time zone 'America/Sao_Paulo',
   ((current_date - 5) + time '17:00') at time zone 'America/Sao_Paulo',
   'turma', 'ZZTESTE Teclado T', 'ZZTESTE Teclado T1', -42002, 'ZZTESTE Professor Sem Passivo', false, null);

insert into public.aula_alunos_emusys
  (id, aula_emusys_id, unidade_id, aluno_chave, aluno_id, aluno_nome, aluno_nome_normalizado)
values
  (-42001, -42001, '00000000-0000-4000-8000-000000000420', 'zzteste-42001', -42001, 'ZZTESTE Aluno Um',     'zzteste aluno um'),
  (-42002, -42001, '00000000-0000-4000-8000-000000000420', 'zzteste-42002', -42002, 'ZZTESTE Aluno Dois',   'zzteste aluno dois'),
  (-42003, -42002, '00000000-0000-4000-8000-000000000420', 'zzteste-42003', -42003, 'ZZTESTE Aluno Tres',   'zzteste aluno tres'),
  (-42004, -42002, '00000000-0000-4000-8000-000000000420', 'zzteste-42004', -42004, 'ZZTESTE Aluno Quatro', 'zzteste aluno quatro'),
  (-42005, -42003, '00000000-0000-4000-8000-000000000420', 'zzteste-42005', -42005, 'ZZTESTE Aluno Cinco',  'zzteste aluno cinco'),
  (-42006, -42004, '00000000-0000-4000-8000-000000000420', 'zzteste-42006', -42006, 'ZZTESTE Aluno Seis',   'zzteste aluno seis');

-- ── A rodada sob teste, guardada ───────────────────────────────────────────
create temp table _ctx(quem text, j jsonb) on commit drop;
insert into _ctx values ('com_passivo', public.fabio_contexto_professor(-42001));
insert into _ctx values ('sem_passivo', public.fabio_contexto_professor(-42002));

-- ── A cobranca NAO muda: so o que e cobravel ───────────────────────────────
insert into _res select 'cobranca conta so os alunos cobraveis', '2',
  (select j->>'pendencias_cobraveis' from _ctx where quem='com_passivo');

-- ── O passivo passa a existir no contexto ──────────────────────────────────
insert into _res select 'a chave do passivo existe', 'existe',
  (select case when j ? 'registro_fora_da_cobranca' then 'existe'
               else 'AUSENTE — o Fabio nega o que nao ve' end
     from _ctx where quem='com_passivo');

insert into _res select 'aulas no passivo', '2',
  (select j->'registro_fora_da_cobranca'->>'aulas' from _ctx where quem='com_passivo');

insert into _res select 'alunos no passivo', '3',
  (select j->'registro_fora_da_cobranca'->>'alunos' from _ctx where quem='com_passivo');

insert into _res select 'inicio da janela do passivo',
  (public.fn_data_corte_cobranca() - 10)::text,
  (select j->'registro_fora_da_cobranca'->>'de' from _ctx where quem='com_passivo');

-- A vespera do corte: se o filtro inverter pra `cobravel`, este passo cai.
insert into _res select 'fim da janela do passivo e a vespera do corte',
  (public.fn_data_corte_cobranca() - 1)::text,
  (select j->'registro_fora_da_cobranca'->>'ate' from _ctx where quem='com_passivo');

insert into _res select 'o corte viaja junto, pra resposta poder explicar',
  public.fn_data_corte_cobranca()::text,
  (select j->'registro_fora_da_cobranca'->>'corte' from _ctx where quem='com_passivo');

-- A regra mora no dado, nao so no prompt: e assim que ela chega inteira.
insert into _res select 'a nota explica o que fazer com o numero', 'tem nota',
  (select case when length(coalesce(j->'registro_fora_da_cobranca'->>'nota','')) > 40
               then 'tem nota' else 'SEM NOTA — o numero sozinho nao diz o que fazer' end
     from _ctx where quem='com_passivo');

-- ── Sem passivo: a chave continua la, com zero ─────────────────────────────
-- Chave sumida e chave zerada dao respostas diferentes: sumida devolve o
-- modelo pro chute, que foi exatamente o defeito.
insert into _res select 'professor sem passivo ainda recebe a chave', 'existe',
  (select case when j ? 'registro_fora_da_cobranca' then 'existe' else 'AUSENTE' end
     from _ctx where quem='sem_passivo');

insert into _res select 'professor sem passivo ve zero, nao nulo', '0',
  (select j->'registro_fora_da_cobranca'->>'aulas' from _ctx where quem='sem_passivo');

insert into _res select 'sem passivo, a janela e nula', 'nulo',
  (select case when j->'registro_fora_da_cobranca'->>'de' is null then 'nulo'
               else j->'registro_fora_da_cobranca'->>'de' end
     from _ctx where quem='sem_passivo');

insert into _res select 'a cobranca do professor sem passivo segue de pe', '1',
  (select j->>'pendencias_cobraveis' from _ctx where quem='sem_passivo');

select json_build_object(
  'falhas',  (select count(*) from _res where esperado is distinct from obtido),
  'detalhe', (select coalesce(json_agg(json_build_object(
                       'passo', passo, 'esperado', esperado, 'obtido', obtido)), '[]'::json)
                from _res where esperado is distinct from obtido)
) as resumo;
