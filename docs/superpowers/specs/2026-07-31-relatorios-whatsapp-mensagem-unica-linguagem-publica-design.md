# Relatórios WhatsApp em mensagem única e linguagem pública

## Objetivo

Garantir que os relatórios diários Comercial e Administrativo enviados pela Sol:

1. usem linguagem operacional, sem expor nomes de funções, endpoints, tabelas, versões técnicas ou termos internos;
2. apresentem todas as datas no padrão brasileiro;
3. sejam entregues como uma única mensagem no WhatsApp, preservando o conteúdo canônico completo;
4. mantenham o relatório automático e o relatório gerado pelo botão com a mesma formatação e a mesma base canônica.

## Escopo

Este ajuste abrange:

- o formatador canônico do relatório Comercial;
- o formatador canônico do relatório Administrativo;
- o envio automático dos dois relatórios pela VPS da Sol;
- o envio iniciado pelo botão, quando ele usar o mesmo produtor canônico;
- testes de contrato de texto, tamanho, segurança e entrega.

Não fazem parte deste ajuste:

- alterar cálculos, KPIs, listas detalhadas ou regras canônicas já aprovadas;
- trocar a conta de WhatsApp que envia os relatórios;
- aumentar globalmente o limite das demais mensagens do Hermes;
- juntar Comercial e Administrativo em um único relatório;
- reenviar relatórios aos grupos sem autorização explícita.

## Evidências e causa-raiz

Os relatórios canônicos atuais possuem aproximadamente 5,4 mil a 7,2 mil caracteres. O transporte genérico do Hermes configura o limite de mensagens do WhatsApp em 4.096 caracteres e, ao ultrapassá-lo, divide o texto automaticamente, acrescentando indicadores como `(1/2)` e `(2/2)`.

Portanto, o corte não nasce no formatador nem na base canônica. Ele ocorre depois que o relatório completo já foi produzido. Reduzir o texto para menos de 4.096 caracteres exigiria remover campos relevantes, contrariando a decisão de preservar o melhor conteúdo dos relatórios automático e manual.

Também foi identificado vazamento de detalhes de implementação no rodapé comercial, como nomes de funções, chamadas HTTP, versões internas, `snapshot`, `coorte` e o identificador bruto do fuso horário. No Administrativo existe a expressão `fonte canônica`, que é correta internamente, mas inadequada no texto destinado às unidades.

## Contrato de apresentação pública

### Linguagem

O texto enviado ao WhatsApp deve falar apenas em termos compreensíveis para a operação da escola. Informações de auditoria técnica continuam disponíveis nos logs e registros internos, mas não no corpo do relatório.

O rodapé público será reduzido a informações operacionais, por exemplo:

```text
📅 Informações atualizadas em: 31/07/2026 às 21:40
📅 Relatório gerado em: 31/07/2026 às 21:40
```

Não poderão aparecer no texto público:

- nomes de funções, RPCs, tabelas ou variáveis;
- verbos ou rotas de API, como `GET`, `POST` ou `/aulas`;
- versões internas, como `v2`;
- expressões como `snapshot`, `coorte`, `fonte canônica` ou `canônico v2`;
- identificadores técnicos de fuso, como `America/Sao_Paulo`;
- qualquer identificador com padrão de implementação, como `get_...`.

O nome Emusys pode permanecer apenas quando for necessário identificar, em linguagem operacional, o sistema de origem de uma informação. Ele não será usado em expressões técnicas como `Snapshot Emusys`.

Antes de enfileirar ou enviar, o texto final passará por uma validação de linguagem pública. Se um termo proibido for encontrado, o envio falhará fechado, será registrado como erro e nenhum texto parcial será enviado.

### Datas

Todas as datas visíveis seguirão `dd/mm/aaaa`. Quando houver horário, o padrão será `dd/mm/aaaa às HH:mm`.

Exemplo:

```text
• 01/08/2026 às 10:00: José Gabriel Borges — Musicalização Preparatória
```

O armazenamento interno pode continuar em ISO. A conversão ocorre somente na camada de apresentação, evitando alteração de competência, filtros ou ordenação.

### Conteúdo

O ajuste não poderá suprimir KPIs, tickets médios, funil, canais, cursos, próximas experimentais, alertas, lista detalhada, trancamentos, multicursos, avisos prévios ou demais informações canônicas já aprovadas. A única redução prevista é a retirada de metadados técnicos do texto público.

## Transporte dedicado em mensagem única

Será criado no bridge WhatsApp da Sol um caminho exclusivo para relatórios. Ele utilizará a mesma sessão e a mesma identidade de WhatsApp atualmente usadas, mas não passará pela rotina genérica que fragmenta mensagens em 4.096 caracteres.

O fluxo será:

```text
Produtor canônico
  → validação de linguagem e tamanho
  → fila/idempotência existente
  → cliente dedicado de relatórios na VPS
  → rota local de mensagem única no bridge
  → uma chamada de envio ao WhatsApp
  → um único identificador de mensagem
```

A rota dedicada deverá:

- aceitar conexões apenas da própria VPS;
- manter a lista atual de grupos permitidos;
- aceitar somente texto e o identificador do destino esperado;
- ter limite próprio configurável, inicialmente de 16.000 caracteres UTF-16;
- executar exatamente uma chamada de envio;
- devolver exatamente um identificador de mensagem;
- rejeitar textos vazios, acima do limite ou destinados a grupos não permitidos;
- nunca recorrer à fragmentação como fallback;
- retornar erro se a plataforma não aceitar o envio único.

O limite genérico de 4.096 caracteres do Hermes permanecerá inalterado para conversas e outras automações. Assim, o risco da mudança fica restrito aos relatórios.

Comercial e Administrativo usarão o mesmo cliente dedicado, eliminando a possibilidade de um deles voltar a usar o transporte fragmentado. Se o envio único falhar, a fila será marcada com erro e o relatório completo ficará disponível para auditoria e reprocessamento, sem envio parcial.

## Consistência entre automático e botão

Cada tipo de relatório terá um único formatador público. O agendamento automático e o botão devem consumir o mesmo resultado já formatado, sem manter templates concorrentes.

O contrato de equivalência exige que, para a mesma unidade, competência e instante de referência:

- KPIs e totais sejam iguais;
- seções e rótulos sejam iguais;
- listas detalhadas tenham os mesmos registros e a mesma ordenação;
- datas usem o mesmo formato;
- nenhum dos dois textos contenha termos técnicos proibidos.

Diferenças permitidas ficam limitadas ao horário de geração e a mudanças de dados ocorridas entre duas execuções reais.

## Segurança, auditoria e falhas

- A nova rota não será exposta publicamente e não aceitará autenticação ou destinos vindos do conteúdo do relatório.
- A lista de grupos continuará sendo a fonte de autorização de destino.
- Logs internos poderão registrar produtor, versão, tamanho, unidade, fila e identificador retornado, pois não são enviados ao usuário.
- O texto completo não será duplicado em novos logs se a fila já o preservar, reduzindo exposição desnecessária.
- A idempotência existente será mantida por tipo de relatório, unidade e competência.
- Sucesso só será registrado quando houver confirmação de uma única chamada e um único identificador de mensagem.
- Qualquer resposta ambígua, múltiplos identificadores ou tentativa de fragmentação será tratada como falha.

## Estratégia de testes

Os testes serão escritos antes da alteração de comportamento.

### Formatação

1. Uma próxima experimental armazenada como `2026-08-01 10:00` aparece como `01/08/2026 às 10:00`.
2. O relatório Comercial não contém nenhum termo da lista técnica proibida.
3. O relatório Administrativo não contém `fonte canônica` nem qualquer termo proibido.
4. O conteúdo canônico aprovado continua presente, inclusive os dois tickets médios no Comercial e os detalhamentos administrativos.
5. Automático e botão produzem o mesmo texto para a mesma entrada fixa.

### Transporte

1. Um texto maior que 4.096 e menor que o limite dedicado produz uma única chamada de envio.
2. A resposta contém um único identificador de mensagem.
3. Textos acima do limite são rejeitados sem chamada ao WhatsApp.
4. Destinos fora da lista permitida e requisições não locais são rejeitados.
5. Erros do WhatsApp não acionam fragmentação nem envio parcial.
6. Os scripts automáticos Comercial e Administrativo usam o cliente dedicado, e não o comando genérico do Hermes.

### Regressão

- testes dos formatadores canônicos;
- checagem de tipos e build das funções alteradas;
- testes da fila e da idempotência;
- dry-run das três unidades para Comercial e Administrativo;
- conferência de que o comportamento genérico do Hermes permaneceu igual.

## Implantação controlada

1. Fazer backup versionado do bridge e dos scripts de envio da VPS.
2. Publicar os formatadores e a validação de linguagem.
3. Instalar o cliente e a rota dedicada sem alterar o caminho genérico.
4. Reiniciar somente o serviço do gateway da Sol.
5. Enviar para a conversa de teste da própria Sol um relatório com mais de 4.096 caracteres.
6. Confirmar visualmente uma única mensagem, ausência de `(1/2)` e retorno de um único identificador.
7. Executar dry-run dos dois relatórios nas três unidades e validar datas, linguagem, conteúdo e tamanho.
8. Habilitar o novo caminho para as próximas execuções automáticas.
9. Só realizar novo envio aos grupos mediante autorização explícita.

## Rollback

O rollback restaurará os backups do bridge e dos scripts, desabilitará a rota dedicada e voltará os produtores ao estado anterior. Como o limite global do Hermes não será alterado e a fila continuará preservada, o retorno não exige migração de dados nem afeta outras conversas.

## Critérios de aceite

O trabalho estará concluído quando:

- Comercial e Administrativo forem entregues em uma única mensagem;
- nenhuma mensagem tiver marcadores `(1/2)`, `(2/2)` ou equivalentes;
- todas as datas públicas estiverem no padrão brasileiro;
- nenhum termo técnico proibido aparecer no WhatsApp;
- botão e automático compartilharem o mesmo formatador por tipo de relatório;
- todo o conteúdo operacional aprovado permanecer presente;
- o teste controlado provar uma única chamada e um único identificador;
- os testes automatizados e regressões passarem;
- o comportamento das demais mensagens do Hermes permanecer inalterado.
