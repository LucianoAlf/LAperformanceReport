---
name: operar-dominio-aluno-la
description: Operar, auditar e alterar com segurança o domínio de alunos do LA Report e do LA Teacher. Usar obrigatoriamente em tarefas sobre cadastro, contatos, responsáveis, fotos, lead convertido, anamnese, matrícula, jornada contratual, número da aula, grade, presença, faltas, registros pedagógicos, transcrições, renovação, aviso prévio, trancamento, evasão, tempo de permanência, histórico, risco, troca de professor, passagem de bastão, Sucesso do Aluno, RPCs, views, queries, Edge Functions ou integrações que leiam ou escrevam dados do aluno.
---

# Operar o domínio do aluno LA

## Objetivo

Tratar o LA Report como central canônica da vida do aluno e impedir que consultas ou alterações misturem pessoa, matrícula, disciplina, evento e artefato derivado.

Aplicar esta skill antes de:

- responder onde está um dado do aluno;
- escrever SQL, view, RPC, migration ou Edge Function;
- montar payload para o LA Teacher;
- alterar sincronização com o Emusys;
- gerar relatório ou auditoria sobre aluno;
- corrigir divergência de cadastro, jornada, presença ou renovação.

## Referência obrigatória

Usar como mapa detalhado:

**docs/auditorias/2026-07-11-mapa-backend-aluno.md**

Não carregar o documento inteiro por padrão. Ler primeiro o sumário e somente as seções relacionadas à tarefa. Ler também “Fontes canônicas, derivadas e legadas”, “Achados de consistência” e “Achados de segurança” antes de alterar backend.

Se schema, migration ou código atual divergirem do relatório:

1. verificar o banco remoto e as migrations mais recentes;
2. tratar o relatório como snapshot de 11/07/2026;
3. explicar a divergência;
4. atualizar a implementação atual, nunca reproduzir cegamente o snapshot.

## Fluxo obrigatório

### 1. Definir a pergunta e o grão

Classificar a necessidade:

- pessoa;
- linha operacional do aluno;
- matrícula;
- disciplina da matrícula;
- aula;
- presença;
- movimentação;
- passagem histórica.

Não começar pela tabela. Começar pelo grão.

### 2. Resolver a identidade

Aplicar:

- **alunos.id** é uma linha operacional, não uma pessoa universal;
- a mesma pessoa pode ter várias linhas por cursos diferentes;
- IDs Emusys só são válidos junto com **unidade_id**;
- jornada usa **unidade_id + emusys_matricula_disciplina_id**;
- nome + unidade é fallback de reconciliação, não chave segura.

Nunca fazer upsert ou join por:

- emusys_student_id isolado;
- emusys_matricula_id isolado;
- emusys_matricula_disciplina_id isolado;
- nome isolado.

### 3. Selecionar a fonte canônica

| Necessidade | Fonte |
|---|---|
| Cadastro e estado atual | alunos |
| Contatos adicionais | aluno_contatos |
| Foto atual | alunos.foto_url; photo_url somente fallback |
| Contexto anterior à matrícula | leads, lead_experimentais, crm_conversas, crm_mensagens |
| Anamnese | anamneses, anamnese_respostas_perfil |
| Jornada por curso/disciplina | aluno_jornada_matricula_disciplina |
| Aula e agenda | aulas_emusys |
| Roster da aula | aula_alunos_emusys |
| Presença e falta | aluno_presenca |
| Justificativa | aluno_presenca_administrativo |
| Retificação | aluno_presenca_retificacoes |
| Renovação e movimentação | movimentacoes_admin |
| Histórico consolidado de saída | alunos_historico |
| Transferência | aluno_transferencias |
| Troca de professor | aluno_professor_transicoes |
| Passagem humana | professor_passagem_bastao |
| Registros do Fábio | fabio_fila_audios, fabio_registros_aula |
| Ações, metas e feedbacks | aluno_acoes, aluno_metas, aluno_feedback_professor |
| Risco atual | vw_risco_evasao_atual |
| Pesquisas | pesquisas_whatsapp, pesquisa_evasao |

### 4. Preferir acesso escopado

Para o LA Teacher:

- preferir RPCs **app_*** autenticadas;
- usar **get_jornada_aluno** e **get_jornada_professor** para jornada;
- usar RPCs de passagem de bastão;
- impedir leitura de outra unidade ou carteira;
- restringir anamnese, contatos e transcrições;
- não expor tabelas inteiras ao cliente.

Não consumir diretamente **vw_fabio_aulas_contexto** enquanto o acesso anônimo não estiver fechado.

### 5. Verificar cobertura

Antes de afirmar que a informação existe:

1. conferir se a tabela tem linhas;
2. medir vínculos com aluno, professor, aula e unidade;
3. distinguir schema preparado de fluxo realmente populado;
4. retornar nulo ou lista vazia quando não houver cobertura;
5. nunca gerar informação pedagógica por inferência de IA.

Tratar com atenção:

- registros do Fábio;
- contexto da Mila;
- ações, metas e feedbacks;
- respostas da passagem de bastão.

Essas áreas podem existir no schema e ainda estar vazias.

### 6. Validar regra e segurança

Antes de editar:

- localizar migration e Edge Function responsáveis;
- verificar RLS, grants e security definer/invoker;
- confirmar unidade e ownership do professor;
- procurar consumidores atuais da tabela, view ou RPC;
- preservar compatibilidade quando houver integração publicada;
- não incluir credenciais, tokens ou payload pessoal em documentação ou logs.

### 7. Implementar de forma aditiva

Em mudanças de backend:

- preferir migration aditiva e versionada;
- preservar trilha de auditoria;
- tornar enriquecimentos best effort quando não puderem bloquear matrícula;
- não reutilizar tabela legada só porque possui nome parecido;
- adicionar teste para segundo curso, duas unidades e aluno homônimo;
- testar professor atual, anterior e usuário sem acesso.

### 8. Verificar antes de concluir

Executar, conforme o tipo de mudança:

- testes unitários;
- build;
- parsing das queries no PostgreSQL;
- smoke read-only ou transação com rollback;
- inspeção de RLS e grants;
- comparação de contagens antes e depois;
- validação de payload sem informações financeiras para o LA Teacher.

Relatar o que foi validado e o que permaneceu sem cobertura.

## Regras canônicas

### Pessoa, matrícula e disciplina

- Contar ou exibir pessoa somente após definir como as várias matrículas serão consolidadas.
- Representar Piano e Canto como jornadas diferentes.
- Não reduzir várias disciplinas a um único “número da aula”.
- Mostrar “próxima aula 36 de 40” e “35 realizadas” quando necessário para evitar ambiguidade.

### Presença

- Usar **aluno_presenca** como fonte.
- Não usar **alunos.percentual_presenca** para dado atual.
- Não considerar seguro por disciplina o percentual de **vw_jornada_aluno_com_presenca** sem revisar o join da aula.
- Registrar correções na camada de retificação, sem apagar a primeira escrita.

### Renovação e ciclo de vida

- Usar **movimentacoes_admin**.
- Não usar a tabela legada **renovacoes**.
- Aviso prévio não é evasão.
- Trancamento não é evasão.
- Distinguir tempo atual da matrícula de tempo histórico de retenção.
- Tratar os parâmetros de competência de **get_tempo_permanencia** como legados até a função passar a filtrar período.

### Jornada

- Usar **aluno_jornada_matricula_disciplina**.
- Não confundir jornada por aulas com a fase antiga calculada por meses em **vw_aluno_sucesso_lista**.
- Usar marcos de aula a partir da jornada contratual.

### Anamnese e dados sensíveis

- Tratar token de compartilhamento como segredo.
- Expor somente os campos necessários ao papel autenticado.
- Não enviar conteúdo médico, familiar ou de desenvolvimento em listagens gerais.
- Não copiar anamnese para logs ou prompts sem necessidade.

### Histórico pedagógico

- Reconhecer que as RPCs atuais consolidam por nome + unidade.
- Sinalizar risco de homônimo antes de usar esse resultado como prontuário definitivo.
- Tratar **relatorios_pedagogicos** como artefato derivado.

### Fotos e mídias

- Preferir **foto_url**.
- Usar **photo_url** somente como fallback.
- Não confiar em bucket público como autorização.
- Usar URL assinada para mídia privada.

### LA Teacher

- Não incluir valores, parcelas, mensalidades, faturamento ou inadimplência.
- Entregar somente o aluno da carteira do professor autenticado.
- Entregar contexto comercial apenas quando vinculado e autorizado.
- Manter jornadas separadas por disciplina.
- Incluir passagem de bastão sem bloquear a entrada na carteira do novo professor.

## Fontes que não devem orientar código novo

- renovacoes;
- movimentacoes legada;
- evasoes_v2;
- alunos.percentual_presenca;
- alunos.photo_url como fonte principal;
- fase_jornada por meses como posição contratual;
- relatorios_pedagogicos como fonte;
- nome + unidade como identidade definitiva;
- views ou buckets com acesso amplo sem camada de autorização.

## Playbooks rápidos

### Montar ficha do aluno

1. Resolver alunos.id e unidade.
2. Ler perfil em alunos.
3. Carregar contatos.
4. Carregar jornadas atuais.
5. Carregar agenda e presença por RPC.
6. Carregar anamnese somente com permissão.
7. Carregar movimentações, histórico e passagem de bastão.
8. Acrescentar risco, metas, ações e feedbacks somente quando existentes.

### Descobrir em qual aula está

1. Listar todas as jornadas ativas do aluno.
2. Identificar matrícula e disciplina.
3. Ler aulas passadas, futuras e contratadas.
4. Exibir uma posição para cada disciplina.
5. Não recalcular por data da matrícula quando o Emusys já entregou os contadores.

### Auditar renovação

1. Consultar movimentacoes_admin.
2. Filtrar matrícula Emusys junto com unidade.
3. Verificar status, competência e primeira aula do novo ciclo.
4. Conferir aluno atual e histórico.
5. Não consultar renovacoes legada.

### Alterar sincronização

1. Ler processar-matricula-emusys.
2. Ler sync-matriculas-emusys.
3. Ler o helper compartilhado da jornada.
4. Verificar migrations posteriores.
5. Preservar decisões canônicas e campos fixados.
6. Testar idempotência e unidades com IDs Emusys iguais.

### Criar nova RPC do LA Teacher

1. Autenticar o usuário.
2. Resolver o professor local.
3. limitar carteira e unidade;
4. selecionar apenas colunas necessárias;
5. omitir dados financeiros;
6. restringir anamnese e contatos;
7. testar professor sem vínculo, admin e usuário anônimo;
8. documentar a granularidade do retorno.

## Condições de parada

Parar e pedir decisão antes de:

- escolher uma regra de pessoa sem identidade estável;
- expor anamnese ou transcrição a novo papel;
- mudar cálculo de presença ou tempo de permanência;
- usar nome para sobrescrever dado;
- migrar ou apagar tabela legada;
- executar backfill que altere histórico;
- publicar Edge Function remota sem fonte versionada;
- resolver divergência com dado inventado.

## Entrega

Ao concluir uma tarefa:

- declarar a fonte canônica usada;
- declarar a granularidade;
- informar validações executadas;
- separar correção de dados de correção de código;
- listar risco residual;
- apontar se a documentação precisa ser atualizada;
- nunca afirmar “100%” sem evidência mensurável.
