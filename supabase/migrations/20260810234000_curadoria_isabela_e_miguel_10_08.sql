-- Dois casos investigados a fundo em 10/08/2026 a pedido do Alf ("o que ta faltando pra gente
-- encerrar esses cinco").
--
-- (A) ISABELA CORRÊA PENA (Barra, Gabriel Santos Teixeira) -- nao era so "marcamos errado".
-- A matricula (md=1218) e NOVA, 40 aulas contratadas, 0 aulas PASSADAS, primeira aula em
-- 15/08/2026 -- no futuro. Sem nenhuma aula real pra ancorar, a reconstrucao criou um periodo
-- de DURACAO ZERO (data_inicio = data_fim = 08/08) e fechou no mesmo instante, com conflito
-- `jornada_atual_divergente`. Isolado -- medido no universo inteiro, ninguem mais hoje tem esse
-- padrao (0 aulas passadas + periodo fechado com duracao zero). O bug de fundo na reconstrucao
-- (matricula recem-criada sem nenhuma aula ainda) fica para outra frente; aqui so a curadoria
-- pontual: o vinculo esta vivo (mesmo professor, mesma disciplina, jornada ativa), reabre como
-- `ativo`.
--
-- (B) MIGUEL SANTOS BORGES / GABRIEL SANTOS TEIXEIRA (Campo Grande) -- achado diferente: a
-- atribuicao JA ESTAVA 100% resolvida internamente -- `motivo_saida_id=16` ('Saude'),
-- `atribuicao_confirmada=true`, `conta_retencao_professor=false` (nao penaliza, correto) --
-- mas o campo `publicavel` da linha baseline nunca foi promovido para refletir isso. `publicavel`
-- e calculado UMA VEZ na reconstrucao (a partir de confianca/conflitos daquele momento) e so e
-- recalculado nos ramos de promocao automatica ('ativo' exato) ou revisao humana -- nunca
-- automaticamente quando a atribuicao se resolve depois via o LATERAL JOIN da view. Resultado:
-- um vinculo plenamente resolvido, correto, ficava PARA SEMPRE como "em revisao".
--
-- ⚠️ MEDIDO NO UNIVERSO INTEIRO (nao so o ciclo): so 1 caso com esse perfil exato
-- (`atribuicao_confirmada=true AND motivo_saida_id IS NOT NULL AND conta_retencao_professor IS
-- NOT NULL AND publicavel=false`) -- o proprio Miguel. Isolado, nao sistemico; por isso o
-- conserto e via curadoria pontual (marcar publicavel=true), nao uma mudanca na formula da view
-- que afetaria universo maior sem necessidade.
--
-- ⚠️ RESULTADO ARITMETICO INESPERADO E CORRETO: esta e a PRIMEIRA mudanca do dia inteiro que
-- FAZ a retencao de um professor CAIR. Gabriel Santos Teixeira: 84,91% -> 83,64% (denominador
-- 53->55, penalizadores 8->9). A explicacao: o periodo do Miguel e PRE-CORTE (data_fim=20/06,
-- antes de 03/08) e a regra do CP8 e "pre-corte: TODOS os encerramentos penalizam, exceto
-- troca%" -- `conta_retencao_professor=false` so importa PARA PENALIZACOES POS-CORTE.
-- O motivo "Saude" nao muda isso: e uma evasao real (nao e troca), so estava escondida dentro
-- de "vinculo em revisao" (nem penalizando nem contando a favor) porque a flag nunca foi
-- promovida. Agora conta -- e essa e a correcao certa: o numero estava artificialmente alto por
-- causa de um bug de bookkeeping, nao porque o professor "merecia" o beneficio da duvida.
--
-- ⚠️ O IRMAO DO MIGUEL (periodo com Alexandre de Sa Ritta, fim 27/06) NAO e tocado aqui.
-- A movimentacao registrada (evasao 09/07, motivo Saude) tem `professor_id` = Gabriel Santos
-- Teixeira, nao Alexandre -- entao so o periodo do Gabriel Santos tem evidencia. Sem historico
-- de aula (`aula_alunos_emusys` vazio para este aluno) para provar quando/se ele passou por
-- Alexandre de verdade, fica em revisao -- ambiguidade genuina, nao dado quebrado.
--
-- ⚠️ GUILHERME DIAS DA SILVA (Campo Grande) e VICENTE DIAS BOTELHO (Campo Grande) NAO sao
-- tocados aqui pelo mesmo motivo: Guilherme tem a saida registrada no nome do Vicente Pinheiro
-- Neto, mas nosso periodo tinha Gabriel Barbosa Rufino Otavio -- SEM historico de aula para
-- provar a troca de professor, e sem `aluno_professor_transicoes` registrada. Vicente Dias
-- Botelho precisa de nova pergunta a unidade (a resposta anterior nao cobria as duas turmas de
-- Power Kids que ele frequenta). Ambos ficam para curadoria humana.
--
-- Efeito consolidado do ciclo: vinculos_em_revisao 5 -> 3, pendentes seguem 0, estado ok 33 -> 34.
do $mig$
declare
  v_revisado_por integer := 2;  -- mesmo ator das promocoes automaticas de hoje
  v_isabela_id uuid := '6cfb0a74-39b6-45b0-835b-8a9815d4bd22';
  v_miguel_gabriel_id uuid;
  v_n int;
begin
  -- confere que a Isabela ainda esta como veio a investigacao
  if not exists (
    select 1 from public.professor_matricula_disciplina_periodos_v1 p
    where p.id = v_isabela_id and p.data_inicio = p.data_fim
  ) then
    raise exception 'ABORTADO: periodo da Isabela mudou desde a investigacao';
  end if;

  if exists (select 1 from public.professor_periodos_revisoes_v1 where periodo_id = v_isabela_id) then
    raise exception 'ABORTADO: periodo da Isabela ja tem revisao';
  end if;

  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo, data_fim_corrigida,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao
  )
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria (10/08/2026): matricula nova sem nenhuma aula passada (0/40), primeira aula '
         || 'agendada para 15/08/2026. A reconstrucao criou um periodo de duracao zero por falta '
         || 'de evidencia de aula e fechou no mesmo instante. O vinculo esta vivo -- mesmo '
         || 'professor, mesma disciplina, jornada ativa no Emusys. Reabre como ativo.',
         null,
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel),
         jsonb_build_object('status_periodo', 'ativo', 'tipo_fim', null,
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_10_08_2026',
                              'periodo_duracao_zero_matricula_sem_aulas_passadas')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = v_isabela_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Isabela nao gravou'; end if;

  -- Miguel Santos Borges / Gabriel Santos Teixeira -- pega o periodo_id vivo pela pessoa_chave
  select b.periodo_origem_id into v_miguel_gabriel_id
    from public.vw_professor_periodos_baseline_v3_sombra b
   where b.pessoa_chave = 'emusys:2705'
     and b.professor_id = 8
     and b.data_fim::date = '2026-06-20'
     and b.motivo_saida_id = 16
     and b.atribuicao_confirmada is true
     and b.publicavel is false;

  if v_miguel_gabriel_id is null then
    raise exception 'ABORTADO: periodo do Miguel/Gabriel Santos nao encontrado como esperado';
  end if;

  if exists (select 1 from public.professor_periodos_revisoes_v1 where periodo_id = v_miguel_gabriel_id) then
    raise exception 'ABORTADO: periodo do Miguel ja tem revisao';
  end if;

  insert into public.professor_periodos_revisoes_v1 (
    periodo_id, reconstrucao_id, decisao, motivo,
    snapshot_anterior, snapshot_posterior, revisado_por, origem_revisao
  )
  select p.id, p.reconstrucao_id, 'corrigido',
         'Curadoria (10/08/2026): atribuicao ja estava 100% resolvida (motivo_saida_id=16 '
         || '(Saude), atribuicao_confirmada=true, conta_retencao_professor=false -- nao '
         || 'penaliza, correto) mas publicavel nunca foi promovido para refletir isso. So '
         || 'promove o flag; nao muda o motivo nem se penaliza.',
         jsonb_build_object('status_periodo', p.status_periodo, 'tipo_fim', p.tipo_fim,
                            'confianca', p.confianca, 'publicavel', p.publicavel,
                            'motivo_saida_id', p.motivo_saida_id),
         jsonb_build_object('status_periodo', 'encerrado', 'tipo_fim', p.tipo_fim,
                            'confianca', 'revisado_aprovado', 'conflitos', '[]'::jsonb,
                            'publicavel', true,
                            'evidencias', jsonb_build_object('curadoria_10_08_2026',
                              'atribuicao_ja_resolvida_so_flag_de_publicavel_estava_atrasado')),
         v_revisado_por, 'revisao_humana'
    from public.professor_matricula_disciplina_periodos_v1 p
   where p.id = v_miguel_gabriel_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ABORTADO: Miguel/Gabriel Santos nao gravou'; end if;

  raise notice '2 curadorias gravadas: Isabela (reaberta como ativo) e Miguel/Gabriel Santos (publicavel promovido)';
end
$mig$;
