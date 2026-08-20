-- Cadastra os motivos de finalizacao que o Emusys manda por webhook e que ainda nao existiam
-- em motivos_saida. Sem a linha no catalogo, o webhook processar-matricula-emusys resolve
-- motivo_saida_id = NULL (o match e por ilike do texto, e so acontece no INSERT) e a Pesquisa de
-- Evasao bloqueia o envio com 'motivo_nao_catalogado'.
--
-- Os nomes sao EXATAMENTE os textos que o Emusys envia (levantados de automacao_log.payload_bruto),
-- porque e por igualdade de texto que o match acontece.
--
-- conta_score_professor = false em TODOS de proposito: motivo NULL sem match ja nao contava no
-- score do professor, entao esta e a escolha neutra — nao muda nenhum score existente.
-- Ligar (Perdeu o Interesse / Abandono de Curso, p.ex.) e decisao do Alf, pela tela
-- Professores > MotivosScoreConfig.
--
-- eh_transferencia_interna = true em 'Troca de Unidade' por semantica; hoje a flag nao e lida por
-- nenhuma funcao, view ou tela (verificado), entao e inerte.
--
-- nome_normalizado e coluna GERADA (upper(trim(nome))) e tem UNIQUE — por isso nao vai no INSERT
-- e o where not exists compara contra ela.

insert into public.motivos_saida (nome, categoria, ativo, conta_score_professor, eh_transferencia_interna)
select v.nome, v.categoria, true, false, v.transferencia
from (values
  ('Abandono de Curso',         'desistencia', false),
  ('Perdeu o Interesse',        'desistencia', false),
  ('Outros Motivos',            'outro',       false),
  ('Viagem',                    'outro',       false),
  ('Não gostou da metodologia', 'outro',       false),
  ('Troca de Unidade',          'mudanca',     true)
) as v(nome, categoria, transferencia)
where not exists (
  select 1 from public.motivos_saida ms where ms.nome_normalizado = upper(btrim(v.nome))
);
