-- Terceira rodada de curadoria com Campo Grande em 10/08/2026 -- resposta as ultimas 3
-- pendencias do ciclo apos investigacao (Isabela/Miguel resolvidos em `20260810234000`).
--
-- (A) GUILHERME DIAS DA SILVA / GABRIEL BARBOSA RUFINO OTAVIO -- CG confirmou: "O aluno
-- trocou de professor antes de sair" (Gabriel Barbosa -> Vicente Pinheiro Neto). A saida
-- (evasao 02/06/2026, "Incompatibilidade de horario") ja estava registrada no nome do Vicente
-- Pinheiro -- so o NOSSO periodo, preso no professor original, nunca refletia isso.
-- Reclassificado como `troca_confirmada_transicao`: nao penaliza o Gabriel Barbosa.
-- ⚠️ NAO existe periodo nosso para o Vicente Pinheiro com este aluno (conferido: zero linhas em
-- `professor_matricula_disciplina_periodos_v1` com professor_id=37 para pessoa_chave
-- 'emusys:2756'). O sistema so cria periodo a partir de evidencia de aula
-- (`aula_alunos_emusys`), que para este aluno esta vazia. Sem periodo, nao ha o que promover do
-- lado do Vicente -- a evasao fica sem nenhum professor penalizado por ela neste sistema, o que
-- e o comportamento correto: nao inventamos periodo sem evidencia so para "atribuir a alguem".
--
-- (B) MIGUEL SANTOS BORGES / ALEXANDRE DE SA RITTA DO ESPIRITO SANTO -- CG confirmou: "O aluno
-- teve aula com os dois professores, antes de sair" (Alexandre e Gabriel Santos Teixeira, este
-- ja resolvido em `20260810234000` como a evasao real, motivo Saude). Isso encaixa o periodo do
-- Alexandre no MESMO padrao da cadeia anterior do aluno (Leonardo Castro -> Kaio Felipe -> Renan
-- Amorim -> Alexandre/Gabriel Santos), todos ja `troca_sustentada`/publicaveis -- so os dois
-- ultimos elos ficaram presos. Reclassificado como `troca_confirmada`: nao penaliza o Alexandre.
--
-- (C) VICENTE DIAS BOTELHO / KAIO FELIPE RODRIGUES CABRAL (Power Kids) -- CG confirmou: ele faz
-- POWER KIDS DUAS VEZES por semana, sabado com o Kaio e dia de semana com o Rodrigo Pinheiro
-- (alem de Teclado, tambem com o Kaio). O conflito `jornada_atual_divergente` disparou porque a
-- reconstrucao, ao procurar "a" jornada atual para este curso+aluno, achou DUAS jornadas ativas
-- simultaneas (a do Kaio e a do Rodrigo) e nao soube escolher -- mas as duas sao reais e
-- concorrentes, nao e ambiguidade de fato. Resolvido: publicavel=true, conflitos limpos.
-- ⚠️ Nao mexe no lado do Rodrigo Pinheiro -- o periodo dele para esta mesma matricula nao
-- aparecia na lista de pendencias (ja publicavel por outro caminho).
--
-- Nenhum dos tres penaliza: (A) e (B) sao `troca%`/'ativo' respectivamente e (C) e vinculo vivo
-- -- os tres contadores de encerramento (`encerramentos_penalizadores`,
-- `encerramentos_pos_corte_pendentes`) so filtram `status_periodo='encerrado' AND
-- coalesce(tipo_fim,'') not like 'troca%'`, entao nenhum entra ali.
--
-- EFEITO MEDIDO (ciclo 2026-JUN-AGO): vinculos_em_revisao 3 -> 0. Pendencias seguem 0.
-- Penalizadores seguem 115 (nenhum dos tres penaliza). Expostos 1.380 -> 1.385.
--   Gabriel Barbosa Rufino Otavio  82,76% -> 83,33% (29->30 vinculos)
--   Alexandre de Sa Ritta          98,04% -> 98,08% (51->52 vinculos)
--   Kaio Felipe Rodrigues Cabral   90,91% -> 91,07% (55->56 vinculos)
do $mig$
declare
  v_revisado_por integer := 2;
  v_guilherme_id uuid := '4d2eabd0-6b37-4d39-a4e1-4f31fb2f8a86';
  v_miguel_alex_id uuid := '71ad5bfc-e52e-4bd3-b26f-7bc8ecc0c90a';
  v_vicente_kaio_id uuid := 'da51b2e3-30a1-4da1-858f-c9bfcd853c72';
  v_n int;
begin
  if exists (select 1 from public.professor_periodos_revisoes_v1
              where periodo_id in (v_guilherme_id, v_miguel_alex_id, v_vicente_kaio_id)) then
    raise exception 'ABORTADO: algum destes 3 periodos ja tem revisao';
  end if;

  -- (A) Guilherme -- troca de professor confirmada pela unidade, sem periodo do sucessor
  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao)
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria Campo Grande (10/08/2026): "O aluno trocou de professor antes de sair" '
         || '(Gabriel Barbosa -> Vicente Pinheiro Neto). Saida ja registrada no nome do Vicente '
         || '(evasao 02/06, Incompatibilidade de horario). Nao existe periodo nosso para o '
         || 'Vicente com este aluno (sem evidencia de aula) -- a evasao fica sem professor '
         || 'penalizado, correto: nao se inventa periodo sem evidencia.',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel),
         jsonb_build_object('status_periodo', 'encerrado', 'tipo_fim', 'troca_confirmada_transicao',
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_cg_10_08_2026',
                              'troca confirmada pela unidade; sucessor Vicente Pinheiro sem periodo por falta de evidencia de aula')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = v_guilherme_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Guilherme nao gravou'; end if;

  -- (B) Miguel/Alexandre -- elo confirmado da mesma cadeia de troca ja existente
  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao)
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria Campo Grande (10/08/2026): "O aluno teve aula com os dois professores, '
         || 'antes de sair" (Alexandre e Gabriel Santos Teixeira). Mesmo padrao da cadeia '
         || 'anterior do aluno (Leonardo->Kaio->Renan), ja classificada como troca. A evasao '
         || 'real (motivo Saude) ja esta atribuida ao Gabriel Santos (20260810234000).',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel),
         jsonb_build_object('status_periodo', 'encerrado', 'tipo_fim', 'troca_confirmada',
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_cg_10_08_2026',
                              'elo confirmado da mesma cadeia troca_sustentada ja registrada para este aluno')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = v_miguel_alex_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Miguel/Alexandre nao gravou'; end if;

  -- (C) Vicente/Kaio -- segundo Power Kids concorrente confirmado, nao e ambiguidade
  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao)
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria Campo Grande (10/08/2026): aluno faz Power Kids DUAS vezes por semana -- '
         || 'sabado com o Kaio, dia de semana com o Rodrigo Pinheiro, confirmado pela unidade. '
         || 'O conflito jornada_atual_divergente veio de duas jornadas ativas simultaneas e '
         || 'legitimas, nao de ambiguidade real.',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel,
                            'conflitos', p.conflitos),
         jsonb_build_object('status_periodo', 'ativo', 'tipo_fim', null,
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_cg_10_08_2026',
                              'segunda turma Power Kids concorrente confirmada pela unidade')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = v_vicente_kaio_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Vicente/Kaio nao gravou'; end if;

  raise notice '3 curadorias gravadas: Guilherme (troca sem sucessor), Miguel/Alexandre (troca), Vicente/Kaio (concorrente confirmado)';
end
$mig$;
