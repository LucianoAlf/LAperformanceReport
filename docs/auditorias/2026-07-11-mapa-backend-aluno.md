# Mapa completo do backend do aluno

**Sistema:** LA Report / LA Teacher

**Projeto Supabase:** ouqwbbermlzqqvtqwlul

**Data da auditoria:** 11/07/2026

**Escopo:** cadastro, identidade, contatos, fotos, anamnese, origem comercial, matrícula, jornada, aulas, presença, registros pedagógicos, transcrições, renovação, movimentações, histórico, sucesso, risco e passagem de bastão.

**Fora do escopo:** valores pagos, parcelas, mensalidades, faturamento, inadimplência e demais informações financeiras.

---

## 1. Objetivo

Este documento responde onde está, como se relaciona e qual é a fonte correta de cada informação do aluno no backend do LA Report.

Ele foi escrito para orientar:

- o LA Teacher;
- agentes como Fábio e Mila;
- integrações via API, MCP ou RPC;
- novas telas do LA Report;
- auditorias de dados;
- manutenção das Edge Functions;
- criação de relatórios pedagógicos.

O documento também separa:

- **fonte canônica:** onde o dado oficial deve ser lido;
- **read model:** view ou RPC preparada para consumo;
- **trilha operacional:** evento, log ou decisão de conciliação;
- **artefato derivado:** relatório ou resumo que pode ser reconstruído;
- **legado:** estrutura que não deve orientar implementações novas.

---

## 2. Resumo executivo

O backend já possui quase todas as peças necessárias para representar a vida do aluno sem recorrer diretamente ao Emusys em tempo real.

As fontes centrais são:

| Assunto | Fonte principal |
|---|---|
| Cadastro e estado atual | **alunos** |
| Contatos adicionais e responsáveis | **aluno_contatos** e campos de responsável em **alunos** |
| Foto | **alunos.foto_url**, com **photo_url** como fallback antigo |
| Origem antes da matrícula | **leads**, **lead_experimentais**, **crm_conversas** e **crm_mensagens** |
| Anamnese | **anamneses** e **anamnese_respostas_perfil** |
| Jornada contratual por matéria | **aluno_jornada_matricula_disciplina** |
| Agenda e aulas | **aulas_emusys** e **aula_alunos_emusys** |
| Presença e falta | **aluno_presenca** |
| Justificativa administrativa | **aluno_presenca_administrativo** |
| Correções de presença | **aluno_presenca_retificacoes** |
| Renovação e demais movimentações | **movimentacoes_admin** |
| Histórico consolidado de saída | **alunos_historico** |
| Transferência de unidade | **aluno_transferencias** |
| Troca de professor | **aluno_professor_transicoes** |
| Passagem pedagógica entre professores | **professor_passagem_bastao** |
| Ações, metas e feedbacks | **aluno_acoes**, **aluno_metas** e **aluno_feedback_professor** |
| Risco de evasão | **risco_evasao** e **vw_risco_evasao_atual** |
| Registros e áudio do Fábio | **fabio_fila_audios** e **fabio_registros_aula** |
| Pesquisas de jornada e saída | **pesquisas_whatsapp** e **pesquisa_evasao** |
| Auditoria de webhook e sincronização | **automacao_log** e **emusys_sync_log** |

Há quatro regras estruturais que precisam ser respeitadas por qualquer consumidor:

1. **alunos.id representa uma linha operacional de matrícula, não uma pessoa universal.**
2. **IDs do Emusys só são únicos dentro da unidade.**
3. **a jornada oficial é por matrícula e disciplina.**
4. **movimentacoes_admin é a fonte atual de renovação; a tabela antiga renovacoes não deve ser usada.**

---

## 3. Regra de identidade

### 3.1 Os cinco níveis de identidade

O backend contém cinco níveis diferentes que não devem ser confundidos:

| Nível | Identificador | Significado |
|---|---|---|
| Pessoa | ainda não existe uma chave-mestra definitiva | Ser humano, independentemente de curso ou matrícula |
| Registro local | **alunos.id** | Linha operacional do aluno em um curso/matrícula |
| Aluno Emusys | **unidade_id + emusys_student_id** | Cadastro do aluno na unidade do Emusys |
| Matrícula Emusys | **unidade_id + emusys_matricula_id** | Contrato/matrícula específica |
| Disciplina da matrícula | **unidade_id + emusys_matricula_disciplina_id** | Jornada específica de uma matéria |

### 3.2 Consequência prática

O mesmo aluno pode ter duas linhas em **alunos** quando possui dois cursos. Isso é esperado.

Na fotografia atual do banco:

- **alunos:** 1.570 linhas;
- pessoas aproximadas por nome normalizado e unidade: 1.347;
- registros marcados como segundo curso: 84.

Portanto:

- não conte pessoas com um simples count de **alunos.id**;
- não junte dados apenas pelo nome;
- não trate **emusys_student_id** como global;
- para jornada, use sempre a disciplina da matrícula.

### 3.3 IDs do Emusys são escopados pela unidade

Foram encontrados IDs repetidos entre unidades:

- 73 IDs de aluno Emusys repetidos;
- 102 IDs de matrícula Emusys repetidos.

As chaves corretas são:

    (unidade_id, emusys_student_id)
    (unidade_id, emusys_matricula_id)
    (unidade_id, emusys_matricula_disciplina_id)

Esta regra vale para queries, upserts, cache, eventos, integrações e novos índices.

### 3.4 Uso do nome

Nome + unidade aparece em algumas rotinas históricas como fallback. Isso permite consolidar os dois cursos da mesma pessoa, mas também pode unir duas pessoas homônimas.

O nome deve ser usado apenas:

- para busca humana;
- para reconciliação assistida;
- em rotinas históricas já existentes, com o risco documentado.

Não deve ser a chave principal de novas integrações.

---

## 4. Cadastro atual do aluno

### 4.1 Tabela canônica: alunos

**Granularidade:** uma linha operacional por aluno/matrícula local.

**Chave local:** alunos.id.

**Escopo externo:** unidade + IDs do Emusys.

Grupos de informações disponíveis:

#### Identidade

- nome;
- nome normalizado;
- data de nascimento;
- idade atual;
- classificação EMLA/LAMK;
- tipo e modalidade do aluno;
- indicador de retorno;
- indicador de segundo curso.

#### Contato

- telefone;
- WhatsApp;
- e-mail;
- Instagram;
- indicação de que o aluno não possui Instagram;
- nome, telefone e parentesco do responsável.

#### Vínculos atuais

- unidade;
- professor atual;
- curso;
- tipo de matrícula;
- modalidade;
- dia e horário da aula.

#### Datas e ciclo de vida

- data da matrícula;
- início do contrato;
- fim do contrato;
- data da saída;
- data da última renovação;
- número de renovações;
- estado atual;
- aguardando renovação;
- indicador de ex-aluno;
- dados de arquivamento.

#### Dados pedagógicos

- professor da experimental;
- percentual de presença antigo;
- health score e data da última atualização;
- indicador de anamnese preenchida;
- data de preenchimento da anamnese;
- codinome de temperamento.

#### Integrações

- ID do aluno no Emusys;
- ID da matrícula no Emusys;
- ID do lead de origem;
- URL de foto atual;
- URL de foto antiga.

### 4.2 Status permitidos

O cadastro principal admite:

- ativo;
- inativo;
- aviso_previo;
- trancado;
- evadido.

Na fotografia auditada:

| Status | Quantidade |
|---|---:|
| Ativo | 1.159 |
| Trancado | 28 |
| Aviso prévio no campo principal | 0 |
| Evadido | 197 |
| Inativo | 186 |

Aviso prévio não deve ser lido apenas pelo status atual de **alunos**. A movimentação e a competência ficam em **movimentacoes_admin**.

### 4.3 Cobertura atual

| Campo | Cobertura |
|---|---:|
| ID de aluno Emusys | 1.521 de 1.570 |
| ID de matrícula Emusys | 1.461 de 1.570 |
| Data de matrícula | 1.570 de 1.570 |
| Tempo de permanência local | 1.570 de 1.570 |
| Data de fim de contrato | 1.525 de 1.570 |
| Alguma URL de foto | 1.371 de 1.570 |
| Lead de origem vinculado | 33 de 1.570 |
| Anamnese marcada no cadastro | 15 de 1.570 |

### 4.4 Classificação aos 12 anos

Há uma divergência de regra:

- o trigger do banco usa idade menor que 12 para LAMK;
- o parser da Edge Function usa idade menor ou igual a 12 para LAMK.

Isso pode classificar um aluno de 12 anos de forma diferente conforme o fluxo de escrita. A regra precisa ser unificada antes de ser considerada definitivamente canônica.

---

## 5. Contatos e responsáveis

### 5.1 aluno_contatos

Permite vários contatos por aluno:

- nome;
- telefone;
- parentesco;
- indicador de contato principal;
- data de criação.

**Relação:** aluno_contatos.aluno_id → alunos.id.

**Comportamento:** exclusão em cascata com a linha do aluno.

Existem 1.899 contatos cadastrados.

### 5.2 Campos de responsável em alunos

O cadastro principal também mantém um snapshot simples:

- responsavel_nome;
- responsavel_telefone;
- responsavel_parentesco.

Para uma ficha completa:

1. use os campos principais como resumo;
2. carregue **aluno_contatos** para a lista completa.

### 5.3 Atenção de acesso

As políticas atuais de **aluno_contatos** estão amplas para usuários autenticados. O LA Teacher deve consumir contatos por RPC autenticada e escopada ao professor, não por select genérico na tabela.

---

## 6. Fotos e mídias

### 6.1 Foto do aluno

Ordem recomendada:

1. **alunos.foto_url**;
2. **alunos.photo_url** como fallback legado;
3. avatar gerado pela interface.

O webhook de matrícula lê **foto_aluno_url** do Emusys. O sincronizador de matrículas também preenche a foto quando ela está ausente.

### 6.2 Diferença entre foto_url e photo_url

- **foto_url:** campo atual vindo do fluxo Emusys;
- **photo_url:** campo mais antigo, ainda usado como fallback por partes do front-end.

Novos consumidores devem preferir **foto_url**.

### 6.3 Buckets

| Bucket | Uso | Estado |
|---|---|---|
| fabio-audios | áudios pedagógicos enviados pelo professor | privado, com pasta por usuário |
| avatars | avatares gerais | público e com políticas excessivamente abertas |
| crm-midia | mídia das conversas comerciais | público e com escrita/alteração excessivamente abertas |

### 6.4 Risco

As políticas de **avatars** e, principalmente, **crm-midia** precisam de endurecimento. O bucket de CRM permite operações públicas que podem comprometer privacidade e integridade de mídia.

---

## 7. Origem comercial e contexto anterior à matrícula

### 7.1 leads

Esta é a origem do relacionamento antes de o contato virar aluno.

Dados não financeiros relevantes:

- nome, telefone, e-mail e idade;
- unidade;
- curso de interesse;
- canal de origem;
- datas e status do atendimento;
- experimental agendada, realizada ou perdida;
- consultor;
- vínculo com aluno convertido;
- motivo de perda ou arquivamento;
- observações para o professor;
- campos de passagem da Mila;
- ID do lead no Emusys.

Fotografia atual:

| Indicador | Quantidade |
|---|---:|
| Leads | 8.054 |
| Vinculados a aluno local | 544 |
| Marcados como convertidos | 550 |
| Com ID Emusys | 4.304 |
| Com observações para professor | 0 |
| Com passagem Mila registrada | 0 |
| Com quantidade de mensagens Mila maior que zero | 2 |

O schema existe, mas o contexto Mila ainda não possui cobertura suficiente para ser tratado como fonte confiável de produção.

### 7.2 lead_experimentais

Guarda a ponte entre lead, experimental e possível matrícula:

- lead;
- unidade;
- data e horário;
- professor da experimental;
- curso de interesse;
- status;
- aluno convertido;
- ID do lead e da aula no Emusys;
- observações.

Existem 854 experimentais:

- todas vinculadas a um lead;
- 81 vinculadas a aluno local;
- 276 com ID de aula Emusys.

### 7.3 Conversas e mensagens

#### crm_conversas

Guarda:

- lead e unidade;
- estado da conversa;
- ator responsável;
- JID do WhatsApp;
- foto de perfil;
- mensagens não lidas;
- prévia;
- estado de pausa ou transferência da Mila.

#### crm_mensagens

Guarda:

- conversa e lead;
- direção;
- tipo;
- conteúdo;
- mídia;
- remetente;
- estado de entrega;
- IDs da mensagem e resposta;
- transcrição de áudio.

Fotografia atual:

- 12 conversas;
- 82 mensagens;
- 6 mensagens de áudio;
- 13 mensagens com mídia;
- 0 mensagens transcritas.

### 7.4 Mila

A Edge **mila-processar-mensagem** possui ferramentas para:

- preparar aula;
- registrar gostos, banda ou cantor favorito;
- gravar observações para o professor;
- transferir o atendimento;
- pausar a conversa.

Hoje, os campos de saída estão quase vazios. O LA Teacher deve aceitar o contexto quando existir e mostrar estado “não informado” quando não existir.

---

## 8. Anamnese

### 8.1 Tabela canônica: anamneses

A anamnese é separada do cadastro principal porque contém um formulário detalhado e sensível.

Ela guarda:

- aluno e unidade;
- tipo de formulário EMLA ou LAMK;
- nome e telefone de referência;
- entrevistador;
- resposta presencial ou on-line;
- status rascunho ou completo;
- vínculo vinculado, pendente ou ignorado;
- duração;
- gênero;
- instrumento e cursos;
- objetivos, sonhos, rotina e tempo de estudo;
- experiência musical;
- interesse em banda;
- preferências musicais;
- instrumentos e nível;
- observações da entrevista;
- dados de desenvolvimento infantil;
- sono, estereotipias, contexto familiar e transporte;
- informações de saúde, acompanhamento, medicação, diagnóstico e suporte;
- perfil de temperamento;
- token de compartilhamento;
- datas e autoria.

### 8.2 anamnese_respostas_perfil

Guarda as respostas do perfil comportamental:

- anamnese;
- número da pergunta;
- posição da resposta;
- data.

### 8.3 Cobertura

| Indicador | Quantidade |
|---|---:|
| Anamneses | 18 |
| Completas | 18 |
| Vinculadas a aluno | 15 |
| Pendentes de vínculo | 3 |
| Respostas de perfil | 187 |

### 8.4 Vinculação

O fluxo atual possui:

- **fn_vincular_anamnese_pendente:** tenta vincular automaticamente por nome normalizado, unidade e classificação;
- **buscar_anamneses_pendentes:** apresenta candidatas para revisão;
- **vincular_anamnese_aluno:** efetiva o vínculo manual sem tomar uma anamnese já vinculada a outro aluno;
- **fn_atualizar_aluno_anamnese:** atualiza os indicadores resumidos em **alunos**.

### 8.5 RPC pública por token

**get_anamnese_publica** devolve a anamnese completa quando recebe um token válido.

O conteúdo inclui informações médicas, comportamentais e familiares. O token deve ser tratado como credencial sensível. Não foi identificado prazo de expiração no schema atual.

---

## 9. Matrícula e sincronização com o Emusys

### 9.1 processar-matricula-emusys

Edge Function de evento. Trata:

- matrícula nova;
- renovação;
- trancamento;
- finalização;
- alteração de matrícula.

Responsabilidades:

- criar ou atualizar a linha local;
- criar segundo curso quando necessário;
- vincular lead convertido;
- registrar movimentação administrativa;
- atualizar jornada por disciplina;
- capturar troca de professor antes de sobrescrever o professor atual.

### 9.2 sync-matriculas-emusys

Sincronizador de reconciliação, executado por unidade.

Responsabilidades:

- comparar estado atual do Emusys com o LA Report;
- preencher IDs e dados ausentes;
- respeitar campos fixados pela equipe;
- atualizar jornada;
- registrar divergências;
- reconciliar matrícula finalizada;
- converter matrícula finalizada com renovação pendente em não renovação.

Agenda atual:

- uma execução noturna por unidade;
- horários escalonados aproximadamente entre 02:00 e 02:40.

### 9.3 Conciliação e governança

Tabelas operacionais:

- **alunos_emusys_atributos_divergencias**;
- **matriculas_divergencias**;
- **alunos_emusys_atributos_decisoes**;
- **matriculas_divergencias_decisoes**;
- **matriculas_emusys_decisoes_canonicas**;
- **matriculas_campos_fixados**.

Elas registram:

- divergência encontrada;
- decisão humana;
- valor mantido;
- valor aplicado;
- campo protegido contra nova sobrescrita.

Não são read models de ficha do aluno. São trilha de auditoria e governança.

---

## 10. Jornada contratual por matrícula e disciplina

### 10.1 Tabela canônica

**aluno_jornada_matricula_disciplina**

**Granularidade:** uma linha por unidade, matrícula e disciplina.

Campos principais:

- unidade;
- aluno local;
- aluno Emusys;
- matrícula Emusys;
- disciplina da matrícula Emusys;
- disciplina Emusys;
- curso local e nome no Emusys;
- professor local e Emusys;
- status da matrícula;
- quantidade de contratos;
- aulas contratadas;
- aulas passadas;
- aulas futuras;
- próxima aula;
- percentual da jornada;
- primeira e última aula;
- dia da semana e horário;
- fonte da última atualização;
- data da sincronização;
- snapshot do payload.

Chave única:

    (unidade_id, emusys_matricula_disciplina_id)

### 10.2 Regra de negócio

    proxima_aula_numero =
      nr_aulas_passadas + 1,
      quando ainda existem aulas futuras

    percentual_jornada =
      nr_aulas_passadas / nr_aulas_contratadas

Exibição sem ambiguidade:

- **Próxima aula: 36 de 40**;
- **Realizadas: 35 de 40**.

### 10.3 Um aluno pode ter várias jornadas

Exemplo:

- Piano: próxima aula 12 de 40;
- Canto: próxima aula 3 de 40.

O LA Teacher não deve reduzir essas duas jornadas a um único contador.

### 10.4 Cobertura

| Indicador | Quantidade |
|---|---:|
| Jornadas | 4.779 |
| Ativas | 1.177 |
| Trancadas | 3.202 |
| Finalizadas | 400 |
| Sincronizadas nas últimas 24h | 4.776 |
| Ativas com aluno local | 1.176 de 1.177 |
| Ativas com professor local | 1.135 de 1.177 |
| Ativas com curso local | 1.177 de 1.177 |

### 10.5 Views e RPCs

#### vw_jornada_aluno_atual

- apenas jornadas ativas;
- aluno, curso, professor e contatos;
- posição e rótulo de jornada.

#### vw_jornada_aluno_com_presenca

- adiciona contagem de presença e ausência;
- possui uma ressalva de modelagem descrita na seção 24.

#### vw_jornada_professor_atual

- carteira atual por professor;
- exclui jornada sem professor local.

#### vw_jornada_marcos

Classifica:

- primeira aula;
- aula 15;
- aula 21;
- perto da renovação;
- demais posições.

#### RPCs

- **get_jornada_aluno(p_aluno_id)**;
- **get_jornada_professor(p_professor_id)**.

Essas RPCs são a primeira opção de consumo para o LA Teacher.

---

## 11. Aulas, grade e roster

### 11.1 aulas_emusys

Uma linha representa uma aula sincronizada do Emusys.

Dados:

- ID local e ID Emusys;
- unidade;
- data e horários;
- duração;
- tipo e categoria;
- turma, curso, sala e professor;
- cancelamento;
- número da aula;
- quantidade de alunos;
- observações;
- vínculo com disciplina da matrícula;
- quantidade de aulas do contrato.

Chave:

    (emusys_id, unidade_id)

Existem 43.706 aulas sincronizadas.

### 11.2 aula_alunos_emusys

É o roster, isto é, a lista de alunos esperados em cada aula.

Dados:

- aula;
- unidade;
- chave do aluno na aula;
- ID do aluno Emusys;
- ID local do aluno;
- nome em snapshot;
- nome normalizado;
- datas de sincronização.

Chave:

    (aula_id, aluno_chave)

Cobertura:

| Indicador | Quantidade |
|---|---:|
| Linhas de roster | 4.549 |
| Vinculadas a aluno local | 4.394 |
| Sem vínculo local | 155 |
| Com ID de aluno Emusys | 4.497 |

### 11.3 Grade futura

A Edge remota **sync-grade-futura-emusys** busca aproximadamente:

    hoje até hoje + 35 dias

Ela alimenta **aulas_emusys**. O roster futuro também é complementado pelo modo agenda do sincronizador de presença, com janela de aproximadamente sete dias.

### 11.4 Agenda do LA Teacher

RPCs recomendadas:

- **app_minha_agenda_sessao(data)**: agenda do dia, roster e situação de presença;
- **app_minha_agenda_mes(inicio, fim)**: visão mensal;
- **app_minha_carteira()**: carteira do professor autenticado.

Essas funções validam o professor pelo usuário autenticado e são preferíveis a consultas diretas em views internas.

---

## 12. Presença, falta e justificativa

### 12.1 Tabela canônica: aluno_presenca

Uma linha representa a situação do aluno em uma aula.

Dados:

- aluno;
- professor;
- unidade;
- data e horário;
- estado da resposta;
- fonte e data da resposta;
- mensagem e token;
- aula Emusys;
- curso, turma e sala;
- estado canônico de presença.

Estado canônico:

- presente;
- falta.

Também há estados operacionais antigos:

- presente;
- ausente;
- remarcou;
- pendente.

Chaves:

    (aluno_id, aula_emusys_id)

    (aluno_id, data_aula)
    somente para registros legados sem aula_emusys_id

### 12.2 Cobertura

| Indicador | Quantidade |
|---|---:|
| Registros | 46.284 |
| Presenças | 30.338 |
| Faltas | 15.946 |
| Vinculados a aula | 45.233 |
| Fonte Emusys | 46.283 |
| Fonte LA Teacher | 0 |

### 12.3 Justificativas

**aluno_presenca_administrativo**

Guarda:

- aluno e aula;
- unidade;
- justificativa;
- fonte Emusys ou coordenação;
- datas de sincronização.

Existem 4.410 registros.

### 12.4 Retificações

**aluno_presenca_retificacoes**

É a trilha append-only prevista para correções de presença. Atualmente está vazia.

### 12.5 Escrita pelo professor

**app_registrar_presencas_aula**

Regra:

1. valida o professor autenticado;
2. valida que a aula pertence a ele;
3. valida janela de lançamento;
4. valida o roster;
5. marca presentes todos os alunos não informados como falta;
6. preserva a primeira gravação e exige retificação para correção posterior.

### 12.6 Ausência e risco

**vw_absenteismo_aluno** calcula presença recente a partir de **aluno_presenca** e sinaliza risco quando há volume mínimo de aulas.

---

## 13. Histórico de aulas e prontuário pedagógico

### 13.1 get_historico_aulas_aluno

Retorna o histórico de aulas individuais do aluno.

Use quando a necessidade é:

- data da aula;
- professor;
- presença;
- contexto da aula individual.

### 13.2 get_historico_pedagogico_aluno

Retorna observações pedagógicas acumuladas.

O comportamento atual:

- encontra linhas locais do aluno por nome exato e unidade;
- consolida cursos da mesma pessoa;
- ignora aulas canceladas;
- retorna somente aulas com observação.

### 13.3 get_relatorio_pedagogico_aluno

Monta um relatório JSON a partir do mesmo histórico.

Ele é um read model, não uma nova fonte de verdade.

### 13.4 Ressalva de identidade

As duas RPCs pedagógicas usam nome + unidade para consolidar cursos. Isso ajuda alunos de segundo curso, mas pode misturar homônimos.

Antes de usá-las como prontuário definitivo do LA Teacher, a consolidação deve migrar para uma identidade de pessoa confiável ou aceitar explicitamente uma coleção de alunos.id da mesma pessoa.

### 13.5 relatorios_pedagogicos

Contém sete relatórios gerados.

Classificação:

- artefato derivado;
- útil para histórico de emissão;
- não deve alimentar o dado canônico.

### 13.6 anotacoes_alunos

Guarda notas operacionais livres:

- aluno;
- texto;
- categoria;
- autoria;
- datas;
- indicador de resolução.

Existem 17 anotações. Elas podem complementar a leitura humana, mas não substituem os registros estruturados do Fábio, a anamnese ou a passagem de bastão.

As políticas atuais permitem acesso amplo a usuários autenticados e precisam ser escopadas antes de uso direto pelo LA Teacher.

---

## 14. Áudio, transcrição e registros do Fábio

### 14.1 fabio_fila_audios

Fila de processamento:

- professor;
- unidade;
- aula;
- caminho no storage;
- duração;
- estado;
- transcrição;
- erro e tentativas;
- origem app ou WhatsApp;
- datas.

Estados:

- pendente;
- transcrevendo;
- transcrito;
- normalizado;
- erro.

Fotografia atual: 0 linhas.

### 14.2 fabio_registros_aula

Registro pedagógico estruturado:

- aula;
- unidade;
- professor;
- aluno;
- registro pai e fatias;
- molde;
- campos JSON;
- texto consolidado;
- estado;
- origem;
- áudio;
- marco sugerido;
- confirmação;
- datas.

Estados:

- rascunho;
- aguardando confirmação;
- confirmado;
- escrito no Emusys;
- descartado.

Fotografia atual: 0 linhas.

### 14.3 RPCs do fluxo

- **app_enfileirar_audio**;
- **app_status_audio_fila**;
- **app_registro_completo**;
- **app_atualizar_fatia**;
- **app_confirmar_registro**;
- **app_meus_registros**;
- **app_registros_pendentes**.

### 14.4 Edge fabio-registro-aula

Fluxo:

1. gera URL assinada com curta duração;
2. envia o áudio para o Hermes com assinatura;
3. muda a fila para transcrevendo;
4. espera a devolução da transcrição e da normalização.

O pipeline existe, mas ainda não possui dados reais nas tabelas auditadas.

### 14.5 Três locais diferentes de transcrição

| Contexto | Campo |
|---|---|
| Conversa comercial | crm_mensagens.transcricao |
| Registro de aula | fabio_fila_audios.transcricao |
| Passagem de bastão | professor_passagem_bastao.transcricao |

Eles atendem eventos diferentes e não devem ser fundidos em uma única coluna.

---

## 15. Renovação e movimentações administrativas

### 15.1 Fonte canônica: movimentacoes_admin

Tipos atuais:

- renovacao;
- nao_renovacao;
- aviso_previo;
- evasao;
- trancamento.

Dados não financeiros relevantes:

- unidade;
- data;
- tipo;
- aluno e nome em snapshot;
- professor;
- curso;
- competência;
- motivo e observação;
- agente administrativo;
- tempo de permanência;
- previsão de retorno;
- data prevista de saída;
- unidade de destino;
- primeira aula do novo ciclo;
- renovação antecipada;
- status da renovação;
- ID da matrícula Emusys.

### 15.2 Cobertura

| Tipo | Quantidade |
|---|---:|
| Aviso prévio | 110 |
| Evasão | 723 |
| Não renovação | 195 |
| Renovação | 454 |
| Trancamento | 78 |
| Total | 1.560 |

Status das renovações:

| Status | Quantidade |
|---|---:|
| Confirmada | 363 |
| Antecipada confirmada | 21 |
| Pendente de validação | 57 |
| Antecipada pendente | 11 |
| Sem status | 2 |

### 15.3 Não renovação automática

Regra atual:

    renovação pendente existente
    + mesma matrícula finalizada no Emusys
    = não renovou

O sincronizador registra a não renovação e atualiza o estado do aluno.

### 15.4 Tabela renovacoes

A tabela antiga **renovacoes** é legado.

O código atual declara **movimentacoes_admin** como fonte única. Novas telas, relatórios e agentes não devem consultar a tabela antiga.

---

## 16. Saída, evasão e tempo de permanência

### 16.1 alunos_historico

Histórico consolidado de passagens de saída:

- aluno;
- unidade;
- datas de entrada e saída;
- tempo de permanência;
- categoria e motivo;
- IDs locais relacionados;
- estado de anulação;
- auditoria.

Existem 1.474 linhas.

### 16.2 Tempo atual na escola

Para uma matrícula ainda existente:

- fonte: **alunos.tempo_permanencia_meses**;
- base: data_matricula até hoje ou data_saida;
- natureza: número inteiro de meses da linha operacional.

Esse valor responde:

> Há quanto tempo esta matrícula está ativa ou esteve ativa?

### 16.3 Tempo de permanência de retenção

Para análise histórica:

- fonte: **get_historico_ltv(unidade)**;
- média: **get_tempo_permanencia(unidade, ano, mes)**.

Regra:

- consolida passagens encerradas;
- combina histórico materializado e saídas ainda não consolidadas;
- agrupa a pessoa por nome e unidade;
- exclui bolsa e banda;
- exige ausência de matrícula ativa ou trancada;
- considera passagens com pelo menos quatro meses;
- calcula meses por dias divididos por 30,44.

Esse valor responde:

> Quanto tempo os alunos que efetivamente encerraram sua passagem permaneceram?

Não confundir com o campo inteiro de cada matrícula em **alunos**.

### 16.4 Parâmetros de competência

Na implementação atual, os parâmetros de ano e mês de **get_tempo_permanencia** são mantidos por compatibilidade, mas não filtram a competência. Isso precisa estar documentado para evitar interpretação mensal incorreta.

### 16.5 Arquivamento

Há duas camadas:

- campos de arquivamento dentro de **alunos**;
- cópia física em **alunos_arquivados**.

Fotografia atual:

- sete linhas principais marcadas como arquivadas;
- 20 cópias em alunos_arquivados.

O arquivamento não deve ser confundido com evasão. Evasão é evento de ciclo de vida; arquivamento é estado operacional do registro.

---

## 17. Transferências e troca de professor

### 17.1 aluno_transferencias

Registra:

- aluno;
- unidade de origem;
- unidade de destino;
- data;
- observação;
- auditoria.

Existem três transferências registradas.

### 17.1.1 turmas_historico

Registra alterações de turma:

- ação;
- turma de origem;
- turma de destino;
- usuário;
- motivo;
- metadados.

Existem duas linhas. É uma trilha complementar, não a fonte da jornada contratual.

### 17.2 aluno_professor_transicoes

Camada fria e automática da troca:

- unidade;
- aluno;
- matrícula e disciplina Emusys;
- curso anterior e novo;
- professor anterior e novo;
- IDs Emusys dos professores;
- data e tipo;
- descrição Emusys;
- log de automação;
- snapshot do payload;
- fonte.

Existem 18 transições.

### 17.3 professor_passagem_bastao

Camada quente e humana:

- transição;
- aluno;
- disciplina da matrícula;
- curso;
- professor de origem;
- professor de destino;
- status;
- motivo de dispensa;
- resposta textual;
- áudio;
- transcrição;
- resumo por IA;
- datas.

Estados:

- pendente;
- respondido;
- dispensado.

Cobertura atual:

- 18 passagens;
- 18 pendentes;
- 0 respondidas;
- 0 dispensadas;
- 0 com áudio, transcrição ou resumo.

### 17.4 RPCs

- **get_passagens_bastao_pendentes(p_professor_id)**;
- **responder_passagem_bastao(p_id, p_texto, p_audio_url)**;
- **dispensar_passagem_bastao(p_id, p_motivo)**;
- **get_passagem_bastao_aluno(p_aluno_id)**.

### 17.5 Captura

No evento **matricula_alterada**:

1. o sistema lê a jornada atual;
2. compara o professor salvo com o novo;
3. registra a transição e a pendência;
4. atualiza a jornada para o novo professor;
5. falha no enriquecimento não bloqueia a matrícula.

---

## 18. Sucesso do aluno

### 18.1 aluno_acoes

Guarda:

- aluno e unidade;
- tipo e descrição da ação;
- resultado;
- responsável;
- data.

Fotografia atual: 0 linhas.

### 18.2 aluno_metas

Guarda:

- aluno e unidade;
- título e descrição;
- tipo;
- meta e valor atual;
- prazo;
- status;
- autoria;
- datas.

Fotografia atual: 0 linhas.

### 18.3 aluno_feedback_professor

Guarda:

- aluno;
- professor;
- unidade;
- competência;
- feedback;
- observação;
- sessão;
- data da resposta.

Fotografia atual: 0 linhas.

### 18.4 aluno_feedback_sessoes

Controla disparos de feedback por professor:

- professor e unidade;
- competência;
- token;
- status;
- total de alunos;
- respondidos;
- envio e conclusão;
- autoria.

Fotografia atual: 2 sessões.

### 18.5 alunos_health_score_historico

Prevê histórico do health score:

- aluno;
- professor;
- score;
- observação;
- data.

Fotografia atual: 0 linhas.

### 18.6 vw_aluno_sucesso_lista

Read model que reúne:

- cadastro principal;
- professor, curso e unidade;
- absenteísmo atual;
- último feedback;
- quantidade de ações e metas.

Filtro:

- aluno ativo ou trancado;
- exclui segundo curso.

### 18.7 Fase de jornada antiga

A view classifica:

- menos de 3 meses: onboarding;
- de 3 a 5 meses: consolidação;
- de 6 a 8 meses: encantamento;
- 9 meses ou mais: renovação.

Essa fase é uma segmentação antiga por tempo de casa. Ela não informa “aula 15 de 40”.

Para posição contratual, use **aluno_jornada_matricula_disciplina**.

---

## 19. Health score e risco de evasão

### 19.1 Health score

**calcular_health_score_aluno** combina vários sinais:

- tempo de permanência;
- fase antiga;
- feedback do professor;
- presença recente;
- outros fatores operacionais.

Parte da fórmula atual também usa condição financeira, omitida deste documento por escopo.

O score não deve ser interpretado como uma métrica exclusivamente pedagógica.

### 19.2 risco_evasao

Guarda:

- aluno;
- unidade;
- probabilidade;
- faixa baixa, atenção ou crítica;
- fatores em JSON;
- versão do modelo;
- data de cálculo.

Existem 1.156 previsões.

### 19.3 vw_risco_evasao_atual

Entrega a previsão mais recente por aluno.

### 19.4 features_churn_alunos_ativos

Monta sinais como:

- tempo na escola;
- renovações;
- presença em janelas recentes;
- dias desde a última aula;
- classificação;
- modalidade;
- tipo de aluno;
- anamnese preenchida.

Também contém sinais financeiros, fora do escopo deste relatório.

### 19.5 Agenda

O cálculo de risco roda periodicamente e mantém histórico. Registros antigos são podados após aproximadamente 180 dias.

---

## 20. Pesquisas e voz do aluno

### 20.1 pesquisas_whatsapp

Guarda pesquisas relacionadas à jornada:

- aluno e unidade;
- tipo;
- data da matrícula;
- destinatário;
- envio e erro;
- nota;
- resposta;
- comentário;
- status;
- indicador de operação manual.

Existem 37 registros.

### 20.2 pesquisa_evasao

Guarda pesquisa de saída:

- aluno e evasão;
- unidade;
- snapshots de nome, contato, curso e professor;
- tempo de permanência;
- data e motivo;
- status de envio;
- resposta em texto ou áudio;
- categoria;
- sentimento;
- datas.

Existem quatro registros.

### 20.3 RPCs

- **get_candidatos_pesquisa_primeira_aula**;
- **get_timeline_pesquisas_aluno**;
- **get_respostas_pesquisa**;
- **get_analise_pesquisas**;
- **criar_pesquisa_evasao**;
- **listar_evadidos_para_pesquisa**;
- **pode_enviar_pesquisa_evasao**;
- **registrar_resposta_pesquisa_manual**;
- **stats_pesquisa_evasao**.

---

## 21. Catálogo de RPCs por assunto

### 21.1 Cadastro e conciliação

| RPC | Uso |
|---|---|
| get_divergencias_alunos | listar divergências cadastrais |
| get_conciliacao_matriculas | listar divergências de matrícula |
| aplicar_conciliacao_aluno_atributo | aplicar valor escolhido |
| ignorar_conciliacao_aluno_atributo | registrar decisão de ignorar |
| marcar_aluno_sem_instagram_conciliacao | encerrar pendência legítima de Instagram |

### 21.2 Anamnese

| RPC | Uso |
|---|---|
| buscar_anamnese_pendente | localizar uma pendência |
| buscar_anamneses_pendentes | listar candidatas |
| buscar_anamneses_pendentes_todas | visão administrativa ampla |
| get_anamnese_by_token | leitura por token interno |
| get_anamnese_publica | formulário compartilhado |
| vincular_anamnese_aluno | vínculo manual seguro |

### 21.3 Jornada

| RPC | Uso |
|---|---|
| get_jornada_aluno | jornadas atuais do aluno |
| get_jornada_professor | carteira com posição contratual |

### 21.4 Agenda e presença

| RPC | Uso |
|---|---|
| app_minha_carteira | carteira do professor autenticado |
| app_minha_agenda_sessao | agenda e roster do dia |
| app_minha_agenda_mes | visão mensal |
| app_registrar_presencas_aula | registrar presença/falta |
| admin_corrigir_presenca | correção administrativa |

### 21.5 Histórico pedagógico

| RPC | Uso |
|---|---|
| get_historico_aulas_aluno | histórico de aulas individuais |
| get_historico_pedagogico_aluno | observações pedagógicas |
| get_relatorio_pedagogico_aluno | relatório JSON derivado |

### 21.6 Fábio

| RPC | Uso |
|---|---|
| app_enfileirar_audio | criar item na fila |
| app_status_audio_fila | consultar processamento |
| app_registro_completo | ler registro estruturado |
| app_atualizar_fatia | editar parte do registro |
| app_confirmar_registro | confirmar conteúdo |
| app_meus_registros | listar registros do professor |
| app_registros_pendentes | pendências |

### 21.7 Renovação e histórico

| RPC | Uso |
|---|---|
| get_resumo_renovacoes_proximas | próximos ciclos |
| get_historico_ltv | passagens encerradas consolidadas |
| get_tempo_permanencia | média histórica de permanência |

### 21.8 Sucesso e risco

| RPC | Uso |
|---|---|
| calcular_health_score_aluno | score individual |
| cálculo em lote de health score | atualização periódica |
| features_churn_alunos_ativos | sinais do modelo |
| RPCs de pesquisas | timeline e respostas |

### 21.9 Passagem de bastão

| RPC | Uso |
|---|---|
| get_passagens_bastao_pendentes | fila do professor de origem |
| responder_passagem_bastao | resposta textual ou áudio |
| dispensar_passagem_bastao | encerrar caso sem resposta |
| get_passagem_bastao_aluno | leitura no prontuário |

### 21.10 Assinaturas confirmadas no banco

| Função | Assinatura | Segurança |
|---|---|---|
| app_minha_carteira | app_minha_carteira() | security definer |
| app_minha_agenda_sessao | app_minha_agenda_sessao(p_data date) | security definer |
| app_minha_agenda_mes | app_minha_agenda_mes(p_inicio date, p_fim date) | security definer |
| app_registrar_presencas_aula | app_registrar_presencas_aula(p_aula_emusys_id integer, p_alunos_ausentes integer[]) | security definer |
| get_jornada_aluno | get_jornada_aluno(p_aluno_id integer) | invoker |
| get_jornada_professor | get_jornada_professor(p_professor_id integer) | invoker |
| get_historico_aulas_aluno | get_historico_aulas_aluno(p_aluno_id integer) | invoker |
| get_historico_pedagogico_aluno | get_historico_pedagogico_aluno(p_aluno_id integer) | invoker |
| get_relatorio_pedagogico_aluno | get_relatorio_pedagogico_aluno(p_aluno_id integer, p_data_inicio date, p_data_fim date) | invoker |
| get_historico_ltv | get_historico_ltv(p_unidade_id uuid) | security definer |
| get_tempo_permanencia | get_tempo_permanencia(p_unidade_id uuid, p_ano integer, p_mes integer) | security definer |
| get_timeline_pesquisas_aluno | get_timeline_pesquisas_aluno(p_aluno_id integer) | security definer |
| get_passagens_bastao_pendentes | get_passagens_bastao_pendentes(p_professor_id integer) | security definer |
| get_passagem_bastao_aluno | get_passagem_bastao_aluno(p_aluno_id integer) | security definer |
| responder_passagem_bastao | responder_passagem_bastao(p_id uuid, p_texto text, p_audio_url text) | security definer |
| dispensar_passagem_bastao | dispensar_passagem_bastao(p_id uuid, p_motivo text) | security definer |

---

## 22. Consultas recomendadas

As consultas abaixo omitem deliberadamente campos financeiros.

Todas as consultas desta seção foram submetidas ao parser do PostgreSQL do projeto remoto em 11/07/2026, dentro de transação revertida e sem leitura ou escrita de registros pessoais.

### 22.1 Ficha operacional por alunos.id

    select
      a.id,
      a.unidade_id,
      a.nome,
      a.data_nascimento,
      a.idade_atual,
      a.classificacao,
      a.telefone,
      a.whatsapp,
      a.email,
      a.instagram,
      a.responsavel_nome,
      a.responsavel_telefone,
      a.responsavel_parentesco,
      a.status,
      a.tipo_aluno,
      a.modalidade,
      a.data_matricula,
      a.data_inicio_contrato,
      a.data_fim_contrato,
      a.data_saida,
      a.tempo_permanencia_meses,
      a.data_ultima_renovacao,
      a.numero_renovacoes,
      a.aguardando_renovacao,
      a.is_segundo_curso,
      a.emusys_student_id,
      a.emusys_matricula_id,
      coalesce(a.foto_url, a.photo_url) as foto,
      a.anamnese_preenchida,
      a.anamnese_preenchida_em,
      a.temperamento_codinome,
      a.health_score,
      c.nome as curso,
      p.nome as professor,
      u.nome as unidade
    from alunos a
    left join cursos c on c.id = a.curso_id
    left join professores p on p.id = a.professor_atual_id
    left join unidades u on u.id = a.unidade_id
    where a.id = $1;

### 22.2 Contatos

    select
      nome,
      telefone,
      parentesco,
      principal
    from aluno_contatos
    where aluno_id = $1
    order by principal desc, created_at;

### 22.3 Jornadas atuais

    select *
    from get_jornada_aluno($1);

### 22.4 Anamnese vinculada

    select
      an.id,
      an.tipo_formulario,
      an.status,
      an.vinculo_status,
      an.entrevistador,
      an.modo_resposta,
      an.objetivos,
      an.tempo_para_metas,
      an.tempo_disponivel_estudo,
      an.generos_musicais,
      an.instrumentos_toca,
      an.experiencia_anterior,
      an.interesse_bandas,
      an.observacoes_entrevistador,
      an.temperamento_primario,
      an.temperamento_secundario,
      an.temperamento_codinome,
      an.created_at,
      an.updated_at
    from anamneses an
    where an.aluno_id = $1
    order by an.updated_at desc;

Os campos de saúde e desenvolvimento devem ser carregados somente em uma tela autorizada.

### 22.5 Movimentações do aluno

    select
      id,
      unidade_id,
      data,
      tipo,
      competencia_referencia,
      curso_id,
      professor_id,
      motivo,
      observacoes,
      agente_comercial,
      tempo_permanencia_meses,
      data_prevista_saida,
      unidade_destino_id,
      renovacao_primeira_aula_novo_ciclo,
      renovacao_antecipada,
      renovacao_status,
      emusys_matricula_id,
      created_at
    from movimentacoes_admin
    where aluno_id = $1
    order by data desc, created_at desc;

### 22.6 Histórico de saída

    select *
    from get_historico_ltv($1);

Quando o objetivo for uma pessoa específica, filtre o retorno pelos IDs locais consolidados e valide o nome somente como conferência.

Consulta direta pelo registro local:

    select
      id,
      nome,
      unidade_id,
      aluno_id,
      aluno_ids,
      data_entrada,
      data_saida,
      tempo_permanencia_meses,
      categoria_saida,
      motivo_saida,
      anulado,
      motivo_anulacao,
      created_at
    from alunos_historico
    where aluno_id = $1
       or $1::bigint = any(aluno_ids)
    order by data_saida desc, created_at desc;

### 22.6.1 Transferências de unidade

    select
      id,
      aluno_id,
      unidade_origem_id,
      unidade_destino_id,
      data_transferencia,
      observacao,
      created_at
    from aluno_transferencias
    where aluno_id = $1
    order by data_transferencia desc;

### 22.7 Trocas de professor

    select
      t.id,
      t.emusys_matricula_disciplina_id,
      t.curso_id,
      t.curso_anterior_id,
      t.professor_anterior_id,
      t.professor_novo_id,
      t.data_transicao,
      t.tipo_transicao,
      t.descricao_emusys,
      b.status as passagem_status,
      b.resposta_texto,
      b.transcricao,
      b.resumo_ia,
      b.respondido_em
    from aluno_professor_transicoes t
    left join professor_passagem_bastao b
      on b.transicao_id = t.id
    where t.aluno_id = $1
    order by t.data_transicao desc;

### 22.8 Origem comercial vinculada

    select
      l.id,
      l.status,
      l.curso_interesse_id,
      l.canal_origem_id,
      l.observacoes_professor,
      l.data_passagem_mila,
      l.motivo_passagem_mila,
      l.qtd_mensagens_mila
    from alunos a
    join leads l on l.id = a.lead_origem_id
    where a.id = $1;

### 22.9 Risco atual

    select *
    from vw_risco_evasao_atual
    where aluno_id = $1;

### 22.10 Timeline de pesquisas

    select *
    from get_timeline_pesquisas_aluno($1);

---

## 23. Payload recomendado para o LA Teacher

Uma ficha completa não deve nascer de um select gigante em tabelas abertas. O ideal é compor um payload autenticado e escopado com blocos:

    {
      "perfil": {},
      "contatos": [],
      "matriculas": [],
      "jornadas": [],
      "agenda_proxima": [],
      "presenca_resumo": {},
      "historico_aulas": [],
      "registros_pedagogicos": [],
      "anamnese": {},
      "contexto_comercial": {},
      "renovacoes_e_movimentacoes": [],
      "trocas_de_professor": [],
      "passagens_de_bastao": [],
      "metas": [],
      "acoes": [],
      "feedbacks": [],
      "pesquisas": [],
      "risco_atual": {}
    }

Regras:

- o professor recebe apenas alunos da própria carteira;
- dados sensíveis de anamnese exigem autorização explícita;
- o professor novo pode ler a passagem de bastão;
- o professor antigo só vê a pendência que lhe pertence;
- dados de outras unidades não entram no payload;
- nenhum campo financeiro entra no contrato do LA Teacher;
- ausência de cobertura deve retornar nulo ou lista vazia, nunca dado inventado.

---

## 24. Fontes canônicas, derivadas e legadas

### 24.1 Canônicas

| Fonte | Regra |
|---|---|
| alunos | estado operacional atual da matrícula local |
| aluno_contatos | lista de contatos |
| anamneses | formulário e dados sensíveis |
| aluno_jornada_matricula_disciplina | posição contratual por disciplina |
| aulas_emusys | aula sincronizada |
| aula_alunos_emusys | roster esperado |
| aluno_presenca | presença/falta |
| movimentacoes_admin | renovação, não renovação, aviso, evasão e trancamento |
| alunos_historico | passagem de saída consolidada |
| aluno_professor_transicoes | troca automática de professor |
| professor_passagem_bastao | avaliação humana da troca |
| risco_evasao | histórico de previsões |

### 24.2 Read models

| Fonte | Observação |
|---|---|
| vw_jornada_aluno_atual | boa para posição atual |
| vw_jornada_professor_atual | boa para carteira por professor |
| vw_jornada_marcos | boa para automações por aula |
| vw_absenteismo_aluno | presença recente |
| vw_aluno_sucesso_lista | visão operacional, mas usa fase antiga |
| vw_risco_evasao_atual | previsão mais recente |
| RPCs app_* | acesso preferencial do LA Teacher |

### 24.3 Operacionais e de auditoria

- automacao_log;
- emusys_sync_log;
- tabelas de divergência;
- tabelas de decisão;
- campos fixados;
- webhook_debug_log, quando habilitado.

Essas estruturas explicam o que aconteceu, mas não substituem a fonte canônica.

Cobertura observada:

- automacao_log: 12.397 eventos;
- emusys_sync_log: 2.839 execuções;
- divergências de atributos de aluno: 5.412;
- divergências de matrícula: 1.157;
- decisões canônicas de matrícula: 35;
- campos de matrícula fixados: 57.

### 24.4 Artefatos derivados

- relatorios_pedagogicos;
- textos consolidados por IA;
- resumos gerenciais;
- mensagens já formatadas.

Eles podem ser regenerados.

### 24.5 Legados ou inadequados para novas leituras

| Fonte | Motivo |
|---|---|
| renovacoes | substituída por movimentacoes_admin |
| movimentacoes | tabela antiga e órfã; não usar para passagem de bastão |
| alunos.percentual_presenca | snapshot antigo; prefira aluno_presenca |
| alunos.photo_url | fallback antigo |
| fase_jornada de vw_aluno_sucesso_lista | segmentação por meses, não posição contratual |
| alunos_turmas | sem cobertura útil |
| turmas_alunos | cobertura residual |
| relatorios_pedagogicos | resultado, não fonte |
| nome + unidade como chave | risco de homônimo |

---

## 25. Achados de consistência

### 25.1 Presença por disciplina pode duplicar

**vw_jornada_aluno_com_presenca** relaciona presença ao aluno antes de validar a disciplina da aula.

Consequência:

- um aluno com Piano e Canto pode ter a mesma presença contada nas duas jornadas.

Interpretação:

- contadores de jornada vindos do Emusys são canônicos;
- percentual de presença contratual dessa view ainda não é completamente seguro por disciplina.

Correção recomendada:

- contar presença somente depois de a aula casar com a disciplina da jornada;
- criar teste para aluno com dois cursos.

### 25.2 Histórico pedagógico por nome

As RPCs de histórico pedagógico consolidam por nome + unidade.

Risco:

- unir homônimos.

### 25.3 Classificação aos 12 anos

Trigger e Edge usam limites diferentes para LAMK/EMLA.

### 25.4 Cobertura de contexto inteligente

- Mila: campos praticamente vazios;
- Fábio: filas e registros vazios;
- feedbacks, metas e ações: tabelas preparadas, sem dados;
- passagem de bastão: criada e capturando, mas ainda sem respostas.

O modelo está pronto em várias áreas, mas cobertura zero não pode ser apresentada como histórico existente.

### 25.5 Grade futura com diferença entre repo e remoto

A Edge **sync-grade-futura-emusys** está publicada no ambiente, mas não foi encontrada no diretório local auditado.

Isso cria risco de deriva:

- produção pode conter código que o Git não versiona;
- uma publicação futura pode regredir o comportamento.

---

## 26. Achados de segurança e privacidade

### P0 - corrigir imediatamente

#### vw_fabio_aulas_contexto exposta

Foi validado com role anônima que a view devolve 44.302 linhas.

Ela reúne aula, aluno, professor, roster e presença. Isso é exposição indevida.

Ação:

- ativar security_invoker;
- revogar leitura anônima;
- consumir agenda pelas RPCs app_minha_agenda_*.

#### crm-midia com políticas públicas

Há leitura e operações de escrita públicas no bucket.

Ação:

- tornar privado;
- usar URLs assinadas;
- permitir escrita apenas ao serviço autorizado.

#### Segredos em código remoto e cron

Foram encontrados tokens antigos embutidos em comandos agendados e código remoto.

Ação:

- rotacionar;
- mover para secrets;
- republicar;
- remover cópias antigas.

#### automacao_log com payload sensível

A tabela guarda payloads completos de webhook e está legível de forma ampla por autenticados.

Ação:

- restringir a administradores e serviço;
- definir retenção;
- mascarar conteúdo quando possível.

### P1 - corrigir na sequência

- políticas amplas em crm_conversas e crm_mensagens;
- políticas amplas em aluno_contatos;
- políticas amplas em anotacoes_alunos;
- select autenticado amplo na tabela de jornada;
- token público de anamnese sem expiração observada;
- bucket avatars com escrita e exclusão abertas.

### Regra para o LA Teacher

O aplicativo deve usar RPCs escopadas ao usuário autenticado. Não deve receber acesso direto genérico às tabelas de aluno.

---

## 27. Arquivos do repositório

### Matrícula e jornada

- supabase/functions/processar-matricula-emusys/index.ts
- supabase/functions/sync-matriculas-emusys/index.ts
- supabase/functions/_shared/jornada-canonica.ts
- supabase/migrations/20260708190000_jornada_canonica_matricula_disciplina.sql
- supabase/migrations/20260708193000_jornada_canonica_security_invoker.sql

### Passagem de bastão

- supabase/migrations/20260709120000_passagem_bastao_professores.sql

### Presença e LA Teacher

- supabase/functions/sync-presenca-emusys/index.ts
- supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql
- supabase/migrations/20260703120000_historico_pedagogico_aluno.sql
- supabase/migrations/20260703140000_get_relatorio_pedagogico_aluno.sql
- supabase/migrations/20260704212922_criar_view_absenteismo_aluno.sql

### Sucesso e risco

- supabase/migrations/20260214_sucesso_aluno_fase1_tabelas.sql
- supabase/functions/calcular-risco-evasao/index.ts
- supabase/migrations/20260711120000_features_churn_alunos_ativos.sql
- supabase/migrations/20260711120300_vw_risco_evasao_atual.sql

### Renovação e histórico

- supabase/migrations/20260507_historico_ltv_passagens.sql
- supabase/migrations/20260624_aluno_transferencias_origem_destino.sql
- supabase/migrations/20260711143000_nao_renovacao_emusys_canonica.sql

### CRM, Mila e transcrição

- supabase/migrations/20260213_crm_conversas_mensagens.sql
- supabase/functions/mila-processar-mensagem/index.ts
- supabase/functions/transcrever-audio/index.ts

### Publicadas no remoto, sem fonte local localizada nesta auditoria

- sync-grade-futura-emusys
- fabio-registro-aula

Essas duas funções devem ser exportadas e versionadas para eliminar deriva.

---

## 28. Prioridades recomendadas

### Prioridade 0 - privacidade

1. Fechar acesso anônimo à view de contexto do Fábio.
2. Fechar o bucket crm-midia.
3. Restringir automacao_log.
4. Rotacionar e remover segredos embutidos.

### Prioridade 1 - correção canônica

1. Corrigir presença por disciplina.
2. Substituir consolidação por nome nas RPCs pedagógicas.
3. Unificar a regra de classificação aos 12 anos.
4. Garantir que todo consumo de renovação use movimentacoes_admin.

### Prioridade 2 - cobertura funcional

1. Ativar o pipeline real de registros do Fábio.
2. Popular observações comerciais da Mila.
3. Colocar respostas na passagem de bastão.
4. Iniciar metas, ações e feedbacks do Sucesso do Aluno.
5. Aumentar vínculo entre lead convertido e aluno.

### Prioridade 3 - arquitetura

1. Definir identidade-mestra de pessoa.
2. Criar uma RPC única e segura de prontuário para o LA Teacher.
3. Versionar todas as Edge Functions publicadas.
4. Definir retenção de logs e transcrições.

---

## 29. Contrato de confiança

Uma informação pode ser publicada como canônica somente quando:

- possui granularidade definida;
- possui chave estável;
- respeita unidade;
- tem fonte identificada;
- tem regra de atualização;
- tem trilha de auditoria;
- tem política de acesso;
- possui cobertura mensurável;
- possui fallback explícito;
- não depende de texto gerado por IA para existir.

Aplicação por domínio:

| Domínio | Estado |
|---|---|
| Cadastro atual | maduro, com ressalva de identidade de pessoa |
| Jornada por disciplina | canônica e com boa cobertura |
| Presença | canônica por aula; ajuste pendente na view por disciplina |
| Anamnese | canônica, sensível e com baixa cobertura |
| Renovação | canônica em movimentacoes_admin |
| Histórico de saída | consolidado, com fallback por nome |
| Troca de professor | capturada e estruturada |
| Passagem humana | pronta, ainda sem respostas |
| Mila | schema pronto, cobertura insuficiente |
| Fábio | schema e pipeline prontos, sem registros |
| Sucesso do Aluno | read model funcional, ações/metas/feedbacks ainda vazios |
| Risco | ativo, mas score não é exclusivamente pedagógico |

---

## 30. Conclusão

O LA Report já consegue fornecer ao LA Teacher uma ficha ampla do aluno sem consultar o Emusys em tempo real:

- quem é;
- contatos e responsáveis;
- foto;
- cursos e professores;
- quando se matriculou;
- quanto tempo está na escola;
- em qual aula de cada disciplina está;
- próximas aulas;
- presenças e faltas;
- anamnese;
- origem comercial, quando vinculada;
- renovações e movimentações;
- histórico pedagógico;
- pesquisas;
- risco atual;
- trocas de professor e passagem de bastão.

O caminho seguro é consumir as fontes canônicas por RPCs autenticadas, mantendo:

- unidade como parte de toda identidade Emusys;
- matrícula/disciplina como grão da jornada;
- movimentacoes_admin como fonte de renovação;
- aluno_presenca como fonte de presença;
- anamnese sob acesso restrito;
- logs e artefatos de IA fora do papel de fonte da verdade.

As maiores pendências não são ausência de schema. São:

- segurança de acesso;
- identidade de pessoa;
- presença por disciplina;
- cobertura real dos fluxos Mila, Fábio, feedback e passagem de bastão.

Com esses ajustes, o backend fica preparado para ser a central canônica da vida pedagógica do aluno em todo o ecossistema LA.
