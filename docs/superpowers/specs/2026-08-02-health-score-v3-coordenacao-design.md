# Health Score Professor V3 e Relatorio da Coordenacao

**Data:** 02/08/2026

**Status:** desenho aprovado pelo usuario em 02/08/2026; pronto para implementacao

**Escopo:** motor V3, configuracao, diagnosticos pedagogicos, mapa de sinais e relatorio mensal da Coordenacao

## 1. Objetivo

Transformar o Health Score Professor V3 em uma ferramenta de governanca pedagogica justa, explicavel e configuravel. O produto deve ajudar a Coordenacao a identificar professores que precisam de apoio, reconhecer evolucao e entender riscos reais sem punir falta de dados, diferencas estruturais entre unidades ou fatores que nao estejam sob controle do professor.

O mesmo contrato semantico deve sustentar o painel de Professores, o relatorio da Coordenacao e futuros alertas do Fabio/LA Teacher. Cada consumidor recebe somente o recorte adequado ao seu papel.

## 2. Principios aprovados

1. **Cuidado antes de julgamento.** O score orienta apoio e governanca; nao e mecanismo automatico de punicao.
2. **Sem base nao e zero.** Falta de amostra, professor novo, ausencia de experimental ou dado incompleto devem aparecer com o motivo real.
3. **Nota e confianca sao diferentes.** Todo score publicado informa a cobertura e a qualidade da evidencia.
4. **So pontua o que e atribuivel.** Indicadores fortemente influenciados por demanda, grade, estrutura fisica ou distribuicao gerencial permanecem diagnosticos.
5. **Granularidade operacional e preservada.** Metas podem variar por unidade, curso e modalidade porque Barra, Recreio e Campo Grande possuem estruturas distintas.
6. **Dados fechados permanecem imutaveis.** Simulacoes nao alteram snapshots oficiais. Toda aplicacao de configuracao gera historico e rollback, ainda que a interface esconda a burocracia de rascunhos.
7. **Uma verdade pedagogica.** Painel, relatorio, Fabio e LA Teacher nao recalculam metricas por caminhos diferentes.

## 3. Abordagens avaliadas

### 3.1 Regra global para toda a rede

Rejeitada. Uma unica meta de turma ou capacidade para a rede ignora tamanho de escola, quantidade de salas, instrumentos e demanda por unidade.

### 3.2 Manter o modelo atual e apenas desbloquear a tela

Rejeitada. Reduz a friccao de edicao, mas preserva a mistura entre capacidade fisica, meta pedagogica e avaliacao do professor.

### 3.3 Separar nota, diagnostico e capacidade operacional

**Escolhida.** Mantem a granularidade necessaria, simplifica a experiencia e evita falsa precisao. Cada metrica possui um papel explicito e uma regra de aplicabilidade.

## 4. Contrato das metricas

### 4.1 Pilares que podem compor a nota

| Pilar | Papel | Aplicabilidade | Regra inicial |
|---|---|---|---|
| Retencao atribuivel | Nota | Quando atingir a amostra configurada | Preservar meta e amostra versionadas; exige evidencia de fidelizacao |
| Permanencia com o professor | Nota | Quando atingir a amostra configurada | Preservar janela historica e corte de maturacao versionados |
| Conversao experimental | Nota condicional | Somente quando o professor atingir a amostra minima | Iniciar com a amostra vigente de 3 experimentais e permitir simulacao/configuracao |
| Media de alunos por turma | Nota segmentada | Somente nos segmentos em que a metrica e aplicavel | Meta por unidade, curso e modalidade |
| Presenca dos alunos | Nota | Quando houver amostra e cobertura semantica suficientes | Aulas justificadas e canceladas ficam fora do denominador; nenhuma regra paralela hardcoded |

### 4.2 Indicadores que nao compoem a nota

| Indicador | Papel | Uso |
|---|---|---|
| Numero de alunos / carteira | Diagnostico | Carga atual, evolucao, concentracao, maturacao e oportunidade de redistribuicao |
| Meta de carteira | Referencia diagnostica | Contextualiza carga; nunca aumenta ou reduz a nota |
| Capacidade maxima | Alerta operacional | Detecta incompatibilidade entre ocupacao e capacidade fisica; nunca penaliza o professor |
| Conversao sem amostra minima | Diagnostico provisório | Exibe numerador, denominador e estado `amostra insuficiente`, sem entrar no score |

### 4.3 Normalizacao dos pesos

- `numero_alunos` deixa o denominador pontuavel.
- Um pilar nao aplicavel ou sem amostra tambem fica fora do denominador daquele professor.
- Os pesos dos pilares aplicaveis sao normalizados proporcionalmente para totalizar 100%.
- A tela e o relatorio mostram o peso original e o peso efetivo depois da normalizacao.
- Com ao menos um pilar valido, o sistema pode mostrar **score parcial diagnostico**, sempre acompanhado de confianca e dos pilares ausentes.
- Classificacao oficial, ranking e premiacao exigem a cobertura minima configurada e ao menos um pilar de fidelizacao elegivel, preservando a protecao contra conclusoes formadas por evidencias fracas.
- Nao atingir a cobertura oficial nao apaga o diagnostico nem transforma pilares ausentes em zero; apenas impede uso competitivo daquele score.
- Alterar pesos, metas ou amostras passa sempre pelo mesmo motor de simulacao; consumidores nao possuem regras locais.

### 4.4 Estados de evidencia

O estado generico `sem base` deve ser substituido, na interface e no relatorio, por um motivo estruturado e uma traducao legivel:

- professor em maturacao;
- amostra insuficiente;
- sem experimental no periodo;
- cobertura de presenca insuficiente;
- calendario sem aulas elegiveis;
- vinculo ou segmentacao incompletos;
- fonte canonica indisponivel;
- metrica nao aplicavel ao perfil do professor.

Nenhum desses estados pode ser convertido silenciosamente em zero.

## 5. Carteira como diagnostico e mapa de sinais

O sistema ja possui politica de carteira por unidade com P50, P75, meses de maturacao e base de horas. Essa estrutura passa a alimentar diagnostico, nao score.

O painel deve mostrar por professor:

- quantidade atual de alunos por pessoa, sem duplicacao por curso;
- distribuicao por unidade, curso e modalidade;
- evolucao mensal da carteira;
- tempo de maturacao;
- referencia P50/P75 da unidade;
- concentracao de carga e disponibilidade declarada;
- relacao entre carga, presenca, retencao e evasoes.

Nao sera fixado um limite universal como 25 ou 30 alunos. O historico devera revelar em quais faixas a qualidade comeca a se deteriorar por unidade e perfil.

### 5.1 Sinais iniciais

- **Possivel sobrecarga:** carteira alta para a unidade acompanhada de queda de presenca, retencao ou aumento de evasoes.
- **Expansao sustentavel:** carteira crescendo com presenca e retencao saudaveis.
- **Oportunidade de distribuicao:** carteira abaixo da referencia, disponibilidade existente e indicadores pedagogicos saudaveis.
- **Concentracao operacional:** parte excessiva da carteira em um curso, horario ou unidade.
- **Maturacao:** professor novo ainda construindo carteira, sem classificacao negativa.

Um indicador isolado nao gera alerta critico. A severidade nasce do cruzamento de sinais e deve trazer as evidencias que justificam a leitura.

## 6. Capacidade fisica e metas segmentadas

### 6.1 Capacidade efetiva

A capacidade fisica deve ser resolvida na turma, preferindo a sala vinculada. A regra efetiva usa o menor limite conhecido entre sala, curso e turma. Isso permite que salas de Bateria com duas, tres ou quatro posicoes coexistam na mesma rede e ate na mesma unidade.

Quando a sala nao estiver vinculada ou a capacidade nao estiver disponivel, a regra por unidade/curso/modalidade atua apenas como fallback identificado como `capacidade estimada`.

Exceder capacidade gera alerta de estrutura/grade para a Coordenacao. Nao reduz a nota do professor.

### 6.2 Metas segmentadas preservadas

Permanecem configuraveis por unidade, curso e modalidade:

- meta de media de alunos por turma;
- referencia diagnostica de carteira;
- fallback de capacidade quando nao houver dado fisico confiavel.

No acesso consolidado, as tres unidades aparecem lado a lado. No acesso de unidade, somente a unidade autorizada fica visivel. Copiar valores entre unidades e editar em lote sao conveniencias explicitas; nao existe heranca silenciosa que altere uma unidade ao mudar outra.

## 7. Laboratorio de configuracao V3

### 7.1 Experiencia

A configuracao deixa de obrigar o usuario a administrar rascunhos. A tela oferece um modo de edicao unico com:

- pesos dos pilares;
- metas globais;
- amostras e coberturas minimas;
- faixas de classificacao;
- metas por unidade, curso e modalidade;
- desfazer, restaurar e aplicar;
- comparacao consolidada entre unidades.

### 7.2 Simulacao imediata

Qualquer alteracao recalcula, sem publicar:

- score anterior e simulado;
- confianca e cobertura;
- peso efetivo de cada pilar;
- professores que mudam de faixa;
- professores que passam a ter ou deixam de ter base;
- motivo de cada mudanca;
- diagnosticos e alertas afetados.

O usuario pode abrir cada professor e confrontar o resultado com a operacao real. A aplicacao exige confirmacao e uma justificativa curta. Internamente, o sistema cria e ativa uma versao auditavel pela RPC protegida por `professores.editar`; snapshots fechados nunca sao reescritos.

## 8. Validacao empirica

Antes da publicacao oficial do novo contrato:

1. usar junho/2026 como mes de operacao regular;
2. usar julho/2026 com o recesso explicitamente registrado no calendario;
3. excluir dias de recesso do universo esperado de aulas e da cobertura de presenca;
4. revisar professores conhecidos, incluindo Matheus Lana e Valdo Delfino, nos recortes local e consolidado;
5. comparar V3 atual e V3 simulado, pilar por pilar;
6. registrar divergencias entre resultado e conhecimento operacional;
7. aceitar o modelo somente quando cada divergencia tiver explicacao de dado, regra ou contexto.

O relatorio de julho pode usar score parcial como diagnostico, mas deve declarar o contexto de recesso e nao gerar ranking ou premiacao oficial.

## 9. Produtor canonico do relatorio da Coordenacao

O relatorio passa a ser montado no servidor a partir do mesmo read model do painel. A IA pode redigir e priorizar, mas nao recalcular numeros, trocar denominadores ou inventar classificacoes.

### 9.1 Conteudo

1. **Resumo da equipe:** total de professores ativos, com score, em maturacao e com lacunas de evidencia.
2. **Mapa de sinais:** poucos alertas priorizados, com professor, evidencias e acao sugerida.
3. **Todos os professores:** score, confianca, pilares, diagnosticos de carteira e motivo de ausencia de base.
4. **Retencao e permanencia:** leitura de evolucao e casos que pedem acompanhamento.
5. **Presenca:** resultado, cobertura e pendencias semanticas, considerando calendario e justificativas.
6. **Experimentais:** conversao somente com amostra minima; demais casos aparecem como diagnostico.
7. **Carteira e carga:** distribuicao, tendencias e sinais de sobrecarga ou oportunidade.
8. **Treinamentos e plano de acao:** sugestoes derivadas dos sinais, sem repeticao ou recomendacoes genericas.
9. **Qualidade dos dados:** motivos claros para cada lacuna e responsavel operacional pela correcao.

### 9.2 Conteudo removido ou restrito

- MRR e outros dados financeiros nao pertencem ao relatorio pedagogico.
- Ranking e premiacao aparecem apenas em ciclo oficial fechado.
- Terminologia tecnica de RPC, snapshot, tabela ou funcao nao aparece no texto destinado a equipe.
- O relatorio nao usa paginacao artificial como `(1/2)`.

### 9.3 Periodicidade

O primeiro produto continua mensal e manual pelo botao. O mapa de sinais sera desenhado para permitir, em evolucao posterior, resumos semanais e alertas diarios seletivos. Nao sera criado disparo automatico nesta entrega, evitando ruido no grupo da Coordenacao antes da validacao operacional.

## 10. Fabio e LA Teacher

O banco ja possui RPC pedagogica V3, contexto do Fabio, briefing, pente-fino e fontes de presenca humana. O desenho preserva as fronteiras existentes:

- a Coordenacao recebe score, confianca, diagnosticos e governanca completa;
- o Fabio pode consumir o mesmo contrato pedagogico seguro e ajudar a Coordenacao com alertas e perguntas;
- o LA Teacher acessa somente o professor autenticado por backend proprio ou RPC `app_*` escopada;
- nenhum payload de professor contem financeiro;
- o professor nao recebe ranking comparativo nem score bruto nesta entrega;
- futuras orientacoes no LA Teacher devem ser empaticas, acionaveis e baseadas em sinais do proprio professor, nunca em punicao ou comparacao publica;
- Fábio, LA Teacher e relatorio nao inferem score por conta propria.

## 11. Falhas e seguranca operacional

- Fonte indisponivel bloqueia publicacao oficial da metrica afetada e exibe estado legivel.
- Relatorio parcial pode ser gerado apenas quando declarar as lacunas existentes.
- Retentativas nao criam snapshots ou configuracoes duplicadas.
- Aplicacao de configuracao e serializada e auditada.
- Permissoes de leitura respeitam unidade e papel do usuario.
- Escrita de configuracao ocorre somente por RPC protegida; o navegador nao grava diretamente nas tabelas.
- Snapshot fechado e historico de configuracao sao imutaveis.

## 12. Estrategia de testes

### 12.1 Banco e motor

- carteira fora da nota e fora do denominador;
- normalizacao dos pesos aplicaveis para 100%;
- conversao com menos de 3 experimentais fora da nota;
- conversao com 3 ou mais experimentais elegivel;
- ausencia de metrica nunca vira zero;
- score parcial disponivel com pelo menos um pilar valido, sem habilitar ranking;
- exigencia de fidelizacao e cobertura minima preservadas;
- aula justificada, cancelada e recesso fora do denominador esperado;
- capacidade excedida gera alerta sem alterar score;
- professor multiunidade respeita recorte local e consolidado;
- configuracao aplicada nao altera snapshot fechado.

### 12.2 Interface

- edicao de pesos, metas e amostras atualiza simulacao;
- comparacao anterior/simulado explica cada diferenca;
- acesso de unidade nao visualiza nem altera outra unidade;
- aplicar, desfazer e restaurar sao idempotentes;
- todos os estados de ausencia de base possuem texto legivel.

### 12.3 Relatorio

- numeros iguais aos do read model canonico;
- todos os professores ativos presentes;
- nenhuma informacao financeira;
- nenhuma metrica inventada pela IA;
- julho informa recesso; junho nao herda esse contexto;
- score parcial nao produz ranking oficial;
- texto copiavel e sem vazamento de nomes tecnicos internos.

## 13. Entrega em etapas

1. corrigir o contrato do motor e congelar testes de regressao;
2. validar junho e julho com casos reais;
3. simplificar a experiencia de configuracao e simulacao;
4. publicar o produtor canonico do relatorio mensal da Coordenacao;
5. validar o relatorio com a Coordenacao;
6. somente depois desenhar frequencia semanal/diaria e integracoes proativas do Fabio/LA Teacher.

## 14. Criterios de aceite

- carteira continua visivel, mas nao altera a nota;
- conversao somente pontua com amostra minima configurada, inicialmente 3;
- pesos efetivos totalizam 100% entre pilares aplicaveis e ficam visiveis;
- nenhum professor e penalizado por metrica nao aplicavel ou sem base;
- capacidade respeita sala/turma e nunca penaliza o professor;
- metas por unidade, curso e modalidade continuam disponiveis;
- configuracao pode ser simulada livremente sem operar rascunhos na interface;
- todos os professores aparecem no relatorio com score ou motivo concreto;
- relatorio mensal da Coordenacao usa apenas dados canonicos e nao contem financeiro;
- junho e julho passam pela validacao professor a professor antes de publicacao oficial;
- o desenho preserva a futura integracao com Fabio e LA Teacher sem expor score ou dados indevidos ao professor.
