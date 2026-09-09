# Coordenação: confiabilidade integral dos relatórios

> Execução autorizada em 09/09/2026. A entrega só termina após convergência entre tela, documentos da Coordenação e fontes gerenciais do mesmo período.

## Objetivo

Eliminar as divergências do ciclo Jun–Ago/2026 e impedir regressão nos ciclos em andamento, preservando histórico e sem alterar domínios fora de Professores/Coordenação.

## Gates encontrados durante a execução

- **Decisão confirmada pelo usuário nesta continuação:** manter D+30, com Jun–Ago oficial em 30/09; manter ciclos correntes vivos acumulando somente meses já iniciados; autorizar a integração existente com OpenAI; retirar MRR e informações financeiras da apresentação dos cinco relatórios de Coordenação, sem alterar dados ou relatórios financeiros/gerenciais.
- **Publicação D+30:** o checkpoint aprovado em 09/08 (`docs/handoffs/2026-08-09-frente-professores-checkpoint-vivo.md`) fixa o fechamento oficial de Jun–Ago em 30/09. A retificação executada em 09/09 seguindo o direcionamento recente publicou os comparáveis antes dessa data. O conflito foi informado ao usuário; aguarda decisão explícita entre manter D+30 e antecipar a classificação. Não liberar premiação nem declarar o rollout concluído enquanto isso estiver pendente.
- **IA externa:** a publicação da Edge foi bloqueada pela revisão automática por manter envio de nomes/prioridades pedagógicas à OpenAI. Autorização específica foi solicitada. Não contornar o bloqueio por outra ferramenta nem disparar o relatório com IA antes da resposta.
- **Agendamento — gate concluído:** a migration preparou funções sem ativação. Ensaio real com rollback passou em 81,174 s e execução definitiva em 69,301 s, ambos dentro de 110 s. Configurador então ativou o job 257 às 08:00 UTC e desativou somente os oito jobs substituídos, preservando histórico e demais agendamentos.

## Invariantes de negócio

1. Ciclo fechado publica todos e somente os professores comparáveis; ciclo em andamento mostra diagnóstico, nunca ranking ou premiação oficial.
2. Presença usa a política vigente por unidade e período. Ausência de aula, ausência de dado e dado pendente nunca são apresentados como a mesma situação.
3. Percentuais acumulam numeradores e denominadores do recorte; carteira e média por turma declaram claramente o universo usado.
4. Destaques exigem valor e amostra válidos. Professor sem nota comparável continua visível, mas não entra indevidamente em destaques.
5. Cobertura informa indicadores aplicáveis preenchidos, não sugere que cinco indicadores existem para todos.
6. Os cinco relatórios da Coordenação não exibem MRR ou valores financeiros. Os dados e consumidores financeiros/gerenciais permanecem preservados.
7. Fatos, prioridades e plano de ação são determinísticos. IA pode sugerir treinamento apenas dentro do catálogo e sem criar, omitir ou duplicar prioridade.
8. Todo relatório exibe versão/status do documento para distinguir uma retificação de uma cópia anterior.
9. Documento fechado é imutável; correção histórica gera nova versão retificada e mantém a anterior íntegra.

## Execução TDD

### Continuação autorizada — fechamento e liberação

- [x] Remover apresentação financeira dos cinco relatórios com prova red/green; preservar o documento de origem e outros consumidores.
- [ ] Restabelecer o bloqueio oficial antes de D+30 e regularizar a publicação antecipada de Jun–Ago por transição versionada, preservando notas, evidências e histórico.
- [ ] Provar acumulação do ciclo em setembro/outubro/novembro e o fechamento formal elegível a partir de D+30, sem meses futuros ou soma incorreta de percentuais.
- [ ] Reconciliar documentos novos, painel, fontes e versões nos quatro escopos.
- [ ] Revisar, testar, versionar e publicar frontend/Edge; gerar os cinco relatórios em navegador autenticado, com reload e verificação de console/rede.
- [ ] Registrar evidências finais e limites mensuráveis; nunca converter concordância entre relatórios em garantia fictícia sobre fatos ausentes na origem.

### 1. Contratos de apresentação

- Criar fixtures mínimas para ciclo fechado e ciclo em andamento.
- Fazer testes falharem para: rótulo do ranking, cobertura x/y, exclusão por amostra, MRR parcial, universos de turmas e versão do documento.
- Corrigir o gerador local e o gerador completo da Edge Function.

### 2. Narrativa pedagógica

- Testar que todas as prioridades aparecem nos pontos de atenção.
- Testar ausência de professor duplicado e cobertura equilibrada das sugestões.
- Remover plano contraditório quando não há pendência cadastrada.
- Manter números e decisões fora da geração probabilística.

### 3. Publicação e presença

- Ler do PostgreSQL as definições atuais das funções produtoras/materializadoras.
- Adicionar migration com guardas sobre a definição esperada.
- No fechamento, publicar todos os comparáveis e construir o ranking oficial completo.
- Aplicar a política de presença vigente de Campo Grande ao período Jun–Ago/2026, sem mascarar eventos existentes.
- Corrigir a contagem de conversão que compõe a nota.

### 4. Retificação histórica

- Materializar nova versão de Jun–Ago/2026 para as três unidades e consolidado.
- Confirmar hash, vínculo de supersessão, status retificado e imutabilidade da versão anterior.
- Repetir a materialização diária de Set–Nov/2026 e confirmar estado em andamento sem ranking oficial.

### 5. Verificação antes da publicação

- Rodar testes específicos, suíte de Coordenação e build.
- Comparar documento e fonte por período, unidade, universo, agregação e valor renderizado.
- Conferir ACLs, migrations, alertas de segurança/desempenho e logs.
- Validar no navegador autenticado as três unidades e o consolidado, mensal e ciclo.
- Gerar os cinco relatórios, recarregar a página e repetir a geração sem erros de console/rede.

### 6. Entrega

- Atualizar regras de negócio, métricas, mapa do sistema e mapa do banco quando os contratos mudarem.
- Commit, push, PR, revisão, merge e deploy.
- Confirmar produção pelo navegador e registrar hashes/versões finais.
