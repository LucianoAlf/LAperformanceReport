# Professores: saidas e fator de demanda canonicos

## Objetivo

Fechar duas ambiguidades da tela de Performance sem alterar os contratos ja
publicados para relatorios administrativos, comerciais ou gerenciais:

1. separar saidas operacionais de saidas que impactam o score do professor;
2. calcular fator de demanda na competencia selecionada, em vez de usar a foto
   atual de `alunos`.

O pipeline de churn permanece fora deste escopo.

## Graos

- Resumo de saidas: `professor + unidade + periodo`.
- Detalhe de saida: uma linha por `movimentacoes_admin.id`.
- Fator de demanda: um vinculo distinto `pessoa + curso` dentro da fonte
  preferida do periodo.
- Reparo do Erick: uma aula Emusys identificada por `aulas_emusys.id`.

## Saidas

Fonte unica: `movimentacoes_admin`.

Uma saida valida deve:

- ter tipo `evasao` ou `nao_renovacao`;
- passar por `is_movimentacao_admin_retencao_valida(id)`;
- nao ser uma linha de segundo curso;
- estar dentro do periodo e da unidade pedidos;
- possuir `professor_id` historico na propria movimentacao.

O total operacional e a soma disjunta de:

- `evasoes_validas`;
- `nao_renovacoes_validas`.

`saidas_score_professor` e um subconjunto do total operacional, definido por
`motivos_saida.conta_score_professor = true`. Ele alimenta a retencao
atribuivel e o Health Score. O total exibido na coluna `Saidas` nao e somado
novamente com esse subconjunto.

## Fator de demanda

Fonte por competencia:

- periodo que inclui hoje: jornada ativa por matricula/disciplina;
- periodo encerrado: roster e presenca das aulas Emusys do periodo;
- fallback: cadastro operacional historicamente elegivel.

O fator e a media de `cursos.fator_demanda` por vinculo distinto
`pessoa + curso`. A RPC retorna fonte, cobertura e flag de publicacao.
Sem curso mapeado ou fator cadastrado, o resultado fica nao publicavel; a UI
mostra `Sem base` em vez de inventar `1,0`.

## Compatibilidade

- `get_kpis_professor_periodo_canonico_v2` permanece intacta.
- a nova `v3` agrega os campos novos e sera consumida pela tela de Professores;
- helpers internos ficam restritos a `service_role`;
- o detalhe de saidas valida usuario e unidade antes de retornar dados.

## Reparo historico Erick Osmy

O reparo usa a identidade auditada em `professores_unidades` e so atualiza
aulas que simultaneamente:

- pertencem ao mesmo `unidade_id` do vinculo;
- possuem o mesmo `emusys_professor_id`;
- estao sem `professor_id`;
- nao sao `sem_acompanhamento`;
- ocorreram entre 08/07/2026 e 11/07/2026.

Nenhuma presenca e regravada: as presencas desse recorte ja apontam para o
professor local correto.
