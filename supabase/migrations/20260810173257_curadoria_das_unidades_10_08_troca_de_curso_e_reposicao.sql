-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Curadoria respondida pelas EQUIPES de Barra e Campo Grande em 10/08/2026, via Alf.
-- Em todos os casos a resposta foi a mesma: **o Emusys esta certo**. Nenhuma unidade precisou
-- corrigir nada la -- o erro estava no nosso historico.
--
-- Duas regras de negocio NOVAS sairam daqui, e nenhuma existia documentada:
--
--   (A) TROCA DE CURSO NAO E SAIDA. O aluno muda de instrumento, o Emusys abre uma
--       matricula-disciplina NOVA e a antiga some da nossa jornada. Nosso periodo ficava preso
--       na antiga e virava "encerramento sem motivo". Nos quatro casos o PROFESSOR E O MESMO --
--       ele nao perdeu o aluno, so mudou o que ensina. `tipo_fim` vira
--       `troca_de_curso_mesmo_professor`, que entra na familia `troca%` e portanto NAO penaliza
--       (regra do CP8). Foi por isso que esses alunos apareceram como "sem jornada" -- eu quase
--       classifiquei como dado quebrado e teria mandado a equipe procurar fantasma.
--
--   (B) REPOSICAO NAO CRIA VINCULO DE PROFESSOR. Resposta literal de Campo Grande sobre a
--       Sirley: *"O aluno faz aula com o professor Alexandre! Mas devido a sua escala de
--       embarcacoes, o Jereh autorizou algumas reposicoes dessa aula ser com o Israel."*
--       A reconstrucao leu as aulas de reposicao do Israel e montou um periodo dele. Nao e
--       vinculo -- e substituicao autorizada. Vai como `rejeitado` (=> `invalidado`), saindo do
--       universo, e nao como encerramento.
--
-- CASO A CASO:
--
--   Gabriela Dornas (Barra, Lohana) -- tinhamos Teclado no historico e Guitarra no cadastro;
--     o Emusys mostra CANTO com a Lohana, ativa, 39 aulas futuras. Equipe: *"o curso dela
--     atualmente e o de canto com a lohana, Emusys esta certo"*. => troca de curso.
--
--   Clarisse Maria Vignerom Lira (CG, Caio Tenorio) -- tinhamos Musicalizacao Infantil; Emusys
--     mostra BATERIA com o Caio, ativa, 39 futuras. Equipe: *"Aluna trocou o curso"*.
--
--   Luana Ferreira de Souza (CG, Willer) -- tinhamos Violao; Emusys mostra GUITARRA com o
--     Willer, ativa, 40 futuras. Equipe: *"Aluna trocou o curso"*.
--
--   Arthur Galvao Barbosa (Recreio, Matheus dos Santos) -- mesmo padrao, confirmado pelo
--     proprio Emusys (Canto ativa com o Matheus, 33 futuras). Nao foi perguntado a unidade
--     porque a fonte ja resolvia -- eu tinha dito ao Alf que Recreio nao precisava de nada.
--
--   Isadora Florenzano Carvalho (Barra) -- nosso periodo seguia ATIVO com a Daiana; o Emusys
--     mostra Gabriel Santos Teixeira. Equipe: *"A troca foi feita neste sabado, esta correto"*.
--     Encerrado com `data_fim` = 18/07/2026, a ULTIMA AULA REAL dela com a Daiana (medida em
--     `aula_alunos_emusys`) -- nao a data da resposta. Com o Gabriel ela ja tem 10 aulas futuras.
--
--   Sirley Jorge Martins Dantas (CG) -- ver regra (B). Periodo do Israel invalidado.
--
-- ⚠️ FICA DE FORA, de proposito: **Vicente Dias Botelho** (CG). A equipe respondeu *"O professor
-- dessa turma e o Rodrigo Pinheiro. O Kaio e o professor de Piano"*, mas a agenda mostra que o
-- aluno faz **Power Kids DUAS vezes por semana, com os dois**: Kaio na turma PK_Sa_10 (sabado
-- 10h, 10 aulas futuras) e Rodrigo na PK_Qui_15 (quinta 15h, 10 futuras) -- alem de Teclado com
-- o Kaio. A resposta esta certa para a turma de quinta e nao cobre o caso. Encerrar o periodo do
-- Kaio apagaria um vinculo que existe. Volta para o Alf.
--
-- ⚠️ `origem_revisao='revisao_humana'` porque foi decisao humana de verdade, das unidades. Isso
-- tambem garante que a promocao automatica (cron 131) nunca sobreponha estas linhas -- ela pula
-- qualquer chave natural que ja tenha revisao.
do $mig$
declare
  v_revisado_por integer;
  v_n integer;
  v_ids uuid[] := array[
    'c8007b2e-e6ca-4499-9a06-e2bbc3dc37fa'::uuid,  -- Gabriela Dornas / Lohana
    'd2018b47-35dd-4e2d-aba4-cbab47d44250'::uuid,  -- Clarisse / Caio Tenorio
    '534aee03-25e4-4753-9de2-604f2794917b'::uuid,  -- Luana Ferreira / Willer
    '42473200-92f0-4df2-ae4d-de0b7e2a3e1b'::uuid,  -- Arthur Galvao / Matheus
    '922e40f2-533e-48df-b817-9fb31cbb92e6'::uuid,  -- Isadora / Daiana
    '4d9fdfd4-94ec-4151-8e92-e263809b0b53'::uuid   -- Sirley / Israel
  ];
begin
  select count(*) into v_n
    from public.professor_matricula_disciplina_periodos_v1 where id = any(v_ids);
  if v_n <> 6 then
    raise exception 'ABORTADO: achei % dos 6 periodos; a reconstrucao rodou e trocou os ids', v_n;
  end if;

  if exists (select 1 from public.professor_periodos_revisoes_v1 where periodo_id = any(v_ids)) then
    raise exception 'ABORTADO: algum destes periodos ja tem revisao';
  end if;

  select c.ativado_por into v_revisado_por
    from public.health_score_professor_v3_config_versoes c
    join public.usuarios u on u.id = c.ativado_por
   where c.status = 'ativa' and c.ativado_por is not null and u.ativo = true
     and public.usuario_tem_permissao(c.ativado_por, 'professores.editar', null)
   order by c.versao desc, c.vigencia_inicio desc, c.id desc
   limit 1;
  if v_revisado_por is null then
    raise exception 'ABORTADO: sem ator valido para assinar a revisao';
  end if;

  -- (A) TROCA DE CURSO, mesmo professor -- 4 casos
  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo, snapshot_anterior, snapshot_posterior,
    revisado_por, origem_revisao)
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria da unidade (10/08/2026): o aluno TROCOU DE CURSO e segue com o mesmo professor. '
         || 'O Emusys abriu matricula-disciplina nova e a antiga saiu da jornada; nao houve saida.',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel),
         jsonb_build_object('status_periodo', 'encerrado',
                            'tipo_fim', 'troca_de_curso_mesmo_professor',
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_unidade_10_08_2026',
                              'troca de curso confirmada pela equipe; professor inalterado')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id in ('c8007b2e-e6ca-4499-9a06-e2bbc3dc37fa','d2018b47-35dd-4e2d-aba4-cbab47d44250',
                  '534aee03-25e4-4753-9de2-604f2794917b','42473200-92f0-4df2-ae4d-de0b7e2a3e1b');
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'ABORTADO: gravei % trocas de curso, esperava 4', v_n; end if;

  -- Isadora: troca de professor confirmada; fim = ultima aula real com a Daiana (18/07/2026)
  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo, data_fim_corrigida,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao)
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria da unidade Barra (10/08/2026): "A troca foi feita neste sabado, esta correto". '
         || 'Aluna passou para Gabriel Santos Teixeira (10 aulas futuras com ele). '
         || 'data_fim = 18/07/2026, ultima aula real com a Daiana em aula_alunos_emusys.',
         timestamptz '2026-07-18 23:59:59-03',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel),
         jsonb_build_object('status_periodo', 'encerrado', 'tipo_fim', 'troca_confirmada_jornada',
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_unidade_10_08_2026',
                              'troca para Gabriel Santos Teixeira confirmada pela Barra')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = '922e40f2-533e-48df-b817-9fb31cbb92e6';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Isadora nao gravou'; end if;

  -- (B) REPOSICAO NAO E VINCULO -- Sirley/Israel vai para invalidado
  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo, snapshot_anterior, snapshot_posterior,
    revisado_por, origem_revisao)
  select p.id, p.reconstrucao_id, 'rejeitado',
         'Curadoria da unidade Campo Grande (10/08/2026): "O aluno faz aula com o professor '
         || 'Alexandre! Mas devido a sua escala de embarcacoes, o Jereh autorizou algumas '
         || 'reposicoes dessa aula ser com o Israel." Reposicao autorizada NAO cria vinculo de '
         || 'professor -- o periodo do Israel nunca existiu como vinculo.',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel),
         jsonb_build_object('status_periodo', 'invalidado', 'confianca', 'revisar',
                            'publicavel', false,
                            'evidencias', jsonb_build_object('curadoria_unidade_10_08_2026',
                              'aulas do Israel eram reposicao autorizada; professor titular e Alexandre')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = '4d9fdfd4-94ec-4151-8e92-e263809b0b53';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Sirley nao gravou'; end if;

  raise notice '6 curadorias gravadas: 4 troca de curso, 1 troca de professor, 1 reposicao invalidada';
end
$mig$;
