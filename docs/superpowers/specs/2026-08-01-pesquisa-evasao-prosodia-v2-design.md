# Pesquisa de evasão — prosódia e tratamento gramatical V2

**Data:** 01/08/2026  
**Status:** desenho aprovado; implementação local concluída; rollout pendente
**Escopo:** somente prévia e mensagem de saída da pesquisa de evasão

## 1. Objetivo

Corrigir a apresentação de quem envia a pesquisa, adaptar integralmente o texto
ao destinatário e aplicar a formatação aprovada para WhatsApp.

A mensagem deve distinguir:

- aluno menor de 18 anos: conversa com o responsável;
- aluno com 18 anos ou mais: conversa diretamente com o aluno;
- data de nascimento ausente ou inválida: envio bloqueado, sem presumir que o
  aluno é maior de idade.

## 2. Fontes e granularidade

- A saída continua sendo identificada por `movimentacoes_admin.id`.
- O cadastro atual do aluno, inclusive `data_nascimento`, responsável e
  telefone do responsável, vem de `alunos`.
- A identidade do operador continua sendo resolvida pelo JWT e por
  `usuarios`, nunca pelo navegador.
- O conteúdo final continua versionado em `pesquisa_evasao_templates` e
  congelado em preview e pesquisa.

O tratamento gramatical inferido serve somente para renderizar a mensagem. Ele
não representa gênero canônico, não será persistido como atributo de identidade
e não poderá alimentar segmentação ou indicador.

## 3. Regra de destinatário

### 3.1 Menor de idade

Quando a idade calculada na data da prévia for inferior a 18 anos:

- público: `responsavel`;
- destinatário: primeiro nome de `alunos.responsavel_nome`;
- telefone: `alunos.responsavel_telefone`, validado contra o snapshot;
- template: versão ativa do público `responsavel`;
- ausência de nome ou telefone válido do responsável bloqueia o envio.

### 3.2 Maior de idade

Quando a idade calculada for igual ou superior a 18 anos:

- público: `direto`;
- destinatário: primeiro nome do aluno;
- telefone: snapshot canônico da saída;
- template: versão ativa do público `direto`.

### 3.3 Data de nascimento ausente ou inválida

Não há fallback para público `direto`. A prévia deve falhar com uma mensagem
clara informando que não foi possível determinar com segurança o destinatário.
A listagem deve apresentar bloqueio operacional correspondente.

## 4. Tratamento gramatical

O servidor infere uma forma de apresentação a partir do primeiro nome:

- operador: `o Luciano`, `a Fabi`, `a Jessica`;
- aluno citado ao responsável: `do Davi`, `da Maria`;
- nome ambíguo ou não reconhecido: forma neutra, como `Alex` e `de Alex`.

A inferência deve:

- ser determinística e testável;
- normalizar caixa, espaços e acentos somente para consulta;
- preservar a grafia original na mensagem;
- usar dicionários explícitos e versionados de primeiros nomes;
- não classificar somente pela última letra ou por outra heurística de sufixo;
- cobrir os operadores conhecidos e os primeiros nomes da fila operacional
  vigente; nomes fora do dicionário usam a forma neutra;
- nunca receber artigo ou tratamento livre enviado pelo frontend.

### 4.1 Cobertura e fallback esperado

O dicionário cobre deliberadamente poucas dezenas de nomes, enquanto a base tem
mais de mil alunos. Portanto, o fallback neutro é o comportamento esperado para
a maioria dos nomes que não estiver explicitamente catalogada. Uma construção
como `a experiência de Larissa`, em vez de `da Larissa`, é aceitável e não
constitui defeito.

Ampliar a cobertura do dicionário deve ser tratado como item próprio, com nova
revisão da lista. A Prosódia V2 não deve crescer a lista por inferência, consulta
externa ou heurística de sufixo.

## 5. Cópias aprovadas

### 5.1 Responsável

```text
{{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que {{aluno_primeiro_nome}} passou com a gente. As portas estarão sempre abertas!

Posso lhe fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a experiência {{aluno_com_preposicao}} fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
```

Exemplo: `experiência do Davi`; `experiência da Maria`; fallback
`experiência de Alex`.

### 5.2 Aluno

```text
{{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas para você!

Posso te fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a sua experiência fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
```

Não existe linha, pontilhado ou separador antes da última frase.

## 6. Versionamento e compatibilidade

- Os templates atuais de versão 1 permanecem imutáveis para preservar auditoria.
- As novas cópias entram como versão 2, uma para `direto` e outra para
  `responsavel`.
- A Edge deve aceitar os placeholders antigos e novos durante a transição.
- A ativação da versão 2 só ocorre depois de a Edge compatível estar publicada.
- Previews já criadas continuam usando o texto congelado e não são reescritas.
- A implementação local está em `tratamentoGramatical.ts`, `publico.ts` e na
  migration `20260801143000_pesquisa_evasao_prosodia_v2.sql`.

## 7. Formatação do WhatsApp

- `> *pergunta*` produz citação com pergunta em negrito;
- `_pedido de sinceridade_` produz itálico;
- a mensagem renderizada deve preservar exatamente quebras de linha e
  marcadores;
- a prévia deve mostrar o texto exato que será encaminhado;
- nenhum separador deve ser inserido entre o pedido de sinceridade e
  `Pode responder...`.

**Atualização de 03/08/2026:** o item pendente em que a prévia exibia os
marcadores `> *` e `_` de forma crua foi absorvido e resolvido no desenho
`2026-08-03-pesquisa-evasao-preview-editavel-design.md`. O editor preserva o
texto canônico com os marcadores e apresenta abaixo uma visualização formatada
como o WhatsApp. A baixa definitiva desta dívida ocorre no rollout dessa
entrega; não é mais uma frente separada da Prosódia V2.

## 8. Erros e segurança

- Data de nascimento ausente ou inválida: bloquear antes de criar a prévia.
- Nome necessário vazio: bloquear com erro específico.
- Nome ambíguo para tratamento gramatical: usar forma neutra; não bloquear.
- Placeholder desconhecido ou residual: falhar fechado.
- Identidade, artigo, template e mensagem continuam resolvidos no servidor.
- O hash e o snapshot da prévia continuam cobrindo a mensagem final.

### 8.1 Pré-requisito do retorno

A Prosódia V2 não altera o webhook inbound, mas seu rollout é proibido enquanto
`webhook-whatsapp-inbox` não estiver publicado e revalidado em produção com o
contrato já presente no código local: preencher `resposta_status`, remover o
fallback global que podia escolher outra família e não persistir payload
integral em `webhook_debug_log`. Melhorar a pergunta sem garantir a associação
segura da resposta não conclui o fluxo.

## 9. Validação

Cobertura mínima:

- `Luciano`, `Fabi` e `Jessica` geram apresentação correta;
- `Davi` e `Maria` geram `do` e `da`;
- nome ambíguo gera forma neutra;
- menor usa responsável, telefone do responsável e template responsável;
- maior usa o próprio aluno e template direto;
- data de nascimento ausente ou inválida bloqueia;
- pergunta contém citação e negrito;
- pedido de sinceridade contém itálico;
- nenhuma cópia contém separador;
- templates V1 permanecem existentes e V2 entra de forma idempotente;
- previews antigas permanecem válidas;
- build e testes integrais da função passam.

## 10. Fora do escopo

- cadastrar gênero como atributo do aluno ou do usuário;
- inferir gênero para relatórios ou indicadores;
- alterar respostas, webhook inbound ou classificação das respostas dentro da
  Prosódia V2; o redeploy seguro do webhook é gate externo obrigatório;
- mudar destinatário de pesquisas já enviadas;
- modificar mensagens de outros fluxos do WhatsApp.
