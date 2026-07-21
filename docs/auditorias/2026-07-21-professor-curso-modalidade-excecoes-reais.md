# Auditoria - Excecoes reais de professor, curso e modalidade

**Data:** 2026-07-21

**Escopo:** Gestao de Professores > Configuracoes

**Resultado:** corrigido e validado

## Problema relatado

A interface apresentava 252 itens como se fossem conflitos que a coordenacao
precisasse conciliar manualmente. Isso sugeria, incorretamente, que os vinculos
de professor, unidade, curso e modalidade precisavam ser recadastrados.

## Causa raiz

A tela consumia `get_professor_curso_modalidade_reconciliacao_v1`, uma leitura
diagnostica que juntava fontes com graus e autoridades diferentes:

| Origem do ruido | Linhas |
|---|---:|
| conflito entre jornada e `aulas_emusys.tipo` | 182 |
| pistas globais da tabela legada `professores_cursos` | 37 |
| pendencias repetidas de materializacao | 33 |
| **Total exibido** | **252** |

`aulas_emusys.tipo` descreve a aula operacional e nao e a autoridade da
modalidade curricular. `professores_cursos` nao possui o grao obrigatorio de
unidade e modalidade. Nenhuma dessas fontes pode criar trabalho manual para a
coordenacao.

## Regra canonica aplicada

1. O catalogo oficial do Emusys identifica disciplina e modalidade.
2. `curso_emusys_depara` resolve disciplina Emusys para o curso local por
   unidade.
3. `professor_unidade_curso_modalidade` guarda o vinculo formal materializado.
4. `aluno_jornada_matricula_disciplina` confirma a jornada ativa.
5. A fila operacional mostra somente o que permanece divergente depois dessas
   quatro camadas.

Atividades operacionais sem curso do Health Score continuam auditaveis, mas
recebem `curso_emusys_depara.status_mapeamento = 'fora_escopo'` e nao criam uma
pendencia por professor.

## Resultado apos a correcao

A fila operacional caiu de 252 para 3 excecoes reais:

| Unidade | Professor | Curso | Motivo |
|---|---|---|---|
| Barra | Lucas Amorim Souza | Musicalizacao Preparatoria | jornada ativa fora da atribuicao formal |
| Campo Grande | Ana Beatriz Paz de Almeida | Guitarra | jornada ativa fora da atribuicao formal |
| Campo Grande | Marcos (Marquinhos) da Silva Saturnino | Bateria | jornada ativa fora da atribuicao formal |

Esses tres casos pedem somente conferencia da atribuicao formal no Emusys. Nao
pedem recadastro do professor no LA Report.

## Implementacao

- Nova coluna versionada `curso_emusys_depara.status_mapeamento`:
  `pendente`, `mapeado` ou `fora_escopo`.
- A RPC publica `get_professor_curso_modalidade_excecoes_v2` filtra atividades
  fora do escopo, deduplica disciplina sem de-para por unidade/disciplina e
  preserva o guard `professores.editar` por unidade.
- A leitura bruta foi mantida privada para auditoria de `service_role`.
- O frontend deixou de consumir a reconciliacao V1 e nao grava diretamente em
  tabelas de professores ou cursos.
- A fila antiga de modalidade e atribuicoes foi removida da configuracao para
  nao duplicar nem contradizer a fila V2.

## Nao alterado

- cadastro de professores;
- vinculos ativos ja materializados;
- cursos locais;
- metas ou configuracao ativa do Health Score;
- relatorios e snapshots fechados.

## Evidencias de verificacao

- 73 testes direcionados aprovados;
- build de producao aprovado;
- browser autenticado sem erro de console;
- Cadastro: 48 professores ativos;
- Configuracoes: 3 excecoes operacionais;
- nenhuma ocorrencia visual de `Modalidade a revisar` ou da fila legada
  `Pendencias de atribuicao`.
