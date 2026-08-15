# Correção de pendências de presença por trancamento e reagendamento

## Contexto e evidência

Em 15/08/2026, o relatório diário referente a 14/08 listou Elisa, Fabiana e
Isis como sem presença/sem falta mesmo tendo trancamento iniciado antes da
aula. A fonte do relatório (`fn_presenca_pendencias_do_dia`) e a visão
operacional (`vw_presenca_pendencia`) não consultavam a jornada de matrícula.

No mesmo incidente, a alteração de grade do Sérgio chegou pelo webhook depois
da geração do relatório. A edge tentou reconciliar a grade, mas a RPC escreveu
`cancelada_origem = 'sync_ausente_emusys'`, valor que a constraint da tabela
não aceitava. Além disso, a janela da edge/RPC começava em hoje e não corrigia
o dia anterior.

## Regra canônica

Uma pendência de presença é elegível somente se não houver, para a mesma
unidade, aluno e disciplina da aula, uma jornada com:

- `status_matricula = 'trancada'`;
- `trancamento_data_inicial <= data_aula`; e
- `trancamento_data_final` nula ou maior/igual à data da aula.

O vínculo da disciplina usa primeiro `matricula_disciplina_id`; quando a linha
de turma não tem esse identificador, usa o nome do curso normalizado. Portanto,
um trancamento posterior não apaga a pendência histórica e um trancamento de
outro curso não esconde a aula válida.

## Arquitetura

Uma função SQL interna e somente de leitura centraliza o predicado de
elegibilidade. Ela será chamada tanto pela função que alimenta o relatório
diário quanto pela view de pendências. O escopo é o par aluno/aula, associado à
jornada por `unidade_id + emusys_matricula_disciplina_id`, com fallback
conservador de curso somente para linhas sem matrícula-disciplina.

A reconciliação de grade mantém seu comportamento de soft-cancelamento e só
ganha uma janela limitada ao dia anterior. A decisão humana já lançada continua
sendo uma trava de preservação: nenhuma presença/falta humana é substituída,
apagada ou reclassificada.

## Segurança e compatibilidade

A nova função será `SECURITY DEFINER`, com `search_path` fixo, execução
revogada de `public`, `anon` e `authenticated`, e concedida apenas aos papéis
que já consomem a view e à `service_role`. A migration não executa DML nem
altera linhas históricas; ela apenas substitui definições e amplia uma
constraint para registrar a origem já usada pela reconciliação.

## Cenários de regressão

1. Elisa/Fabiana/Isis: trancamento antes da aula esconde a pendência no
   relatório e na view.
2. Trancamento posterior: a pendência histórica permanece visível.
3. Dois cursos: um trancamento em Bateria não esconde a aula de Piano.
4. Sérgio: ausência da aula na foto do Emusys pode cancelar o slot de ontem
   com `sync_ausente_emusys`; se já houver decisão humana, o slot é mantido.

## Risco residual

O webhook ainda depende de o Emusys enviar o evento e de sua foto de aulas ser
consultável. A janela de um dia limita a correção automática e evita varrer
histórico antigo; alterações recebidas depois dessa janela permanecem
auditáveis, mas exigem ação humana deliberada.
