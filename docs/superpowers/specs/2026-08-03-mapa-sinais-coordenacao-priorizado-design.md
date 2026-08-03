# Mapa de Sinais Priorizado da Coordenação

**Data:** 03/08/2026
**Status:** desenho aprovado
**Escopo:** relatório mensal da Coordenação Pedagógica

## 1. Objetivo

Transformar o bloco atual de sinais em uma leitura curta, factual e acionável. O relatório público deve destacar prioridades pedagógicas e oportunidades reais sem misturar pendências técnicas de cadastro, repetir professores ou sugerir causalidade que os dados não comprovam.

O contrato canônico bruto continuará preservando todos os sinais para auditoria. Esta entrega cria uma projeção pública determinística, compartilhada pelo renderizador e pela narrativa da IA.

## 2. Evidência da auditoria

Na competência julho/2026 do Recreio, o contrato retornou 18 sinais:

- 6 possíveis sobrecargas;
- 5 pendências de capacidade estimada;
- 4 professores em maturação;
- 2 oportunidades de distribuição;
- 1 expansão sustentável.

O diagnóstico de capacidade contém 701 agrupamentos de ocupação. Nenhum possui turma explícita ou sala vinculada. As 9 excedências encontradas usam somente o fallback por unidade, curso e modalidade. Portanto, elas são pendências de qualidade cadastral, não evidências de sobrecarga física.

A filtragem de sinais exclusivamente técnicos já protege a entrada da IA, mas o renderizador público usa o array bruto. Essa diferença é a causa direta do ruído observado.

## 3. Decisão de produto

O relatório terá três papéis separados:

1. **Prioridades pedagógicas:** até cinco professores com evidências adversas cruzadas.
2. **Oportunidades:** até três professores com espaço de distribuição ou expansão sustentável.
3. **Qualidade dos dados:** resumo agregado das pendências de capacidade estimada.

Professor em maturação permanece contabilizado na visão geral e detalhado na ficha individual. Maturação, isoladamente, não ocupa o mapa priorizado.

## 4. Arquitetura e fluxo de dados

### 4.1 Fonte canônica

O produtor canônico do relatório continua devolvendo `mapa_sinais` completo. Nenhum sinal é apagado do banco, nenhum score é recalculado e nenhum snapshot é alterado.

### 4.2 Projeção pública única

Uma função pura e testável recebe o array bruto e produz:

- `prioridades`;
- `oportunidades`;
- `qualidade_capacidade`;
- `total_sinais_publicos`.

O renderizador determinístico e a IA consomem exatamente essa mesma projeção. Nenhum dos dois acessa o array bruto para compor texto público.

### 4.3 Compatibilidade

Os códigos internos existentes permanecem estáveis. A mudança ocorre na seleção, no agrupamento e na tradução pública. Isso evita quebrar consumidores de auditoria ou exigir uma migração de dados.

## 5. Regras de seleção

### 5.1 Sinais exclusivamente de auditoria

`capacidade_estimada_conferir` nunca entra em prioridades, oportunidades, treinamentos, conquistas ou plano de ação pedagógico.

Ele alimenta apenas um resumo agregado em Qualidade dos dados com:

- quantidade de professores afetados;
- quantidade de agrupamentos de ocupação usando fallback estimado;
- orientação para complementar turma e sala;
- declaração explícita de que a pendência não altera nota nem comprova sobrecarga.

### 5.2 Prioridades pedagógicas

Podem entrar:

- concentração operacional comprovada por capacidade física;
- carteira acima do P75 da unidade combinada com presença ou retenção abaixo da referência.

O rótulo público de `possivel_sobrecarga` será factual:

> Carteira acima do padrão da unidade com indicador pedagógico abaixo da referência.

Cada item mostra somente evidências recebidas do contrato: carteira, P75, presença e meta, retenção e meta, ou capacidade física comprovada.

### 5.3 Oportunidades

Podem entrar:

- oportunidade de distribuição: carteira abaixo do P50, disponibilidade cadastrada e indicadores saudáveis;
- expansão sustentável: carteira relevante com presença e retenção saudáveis.

### 5.4 Deduplicação

Cada professor aparece uma única vez em cada bloco. Sinais do mesmo papel são reunidos numa ficha curta. Uma pendência apenas cadastral nunca promove o professor para prioridade.

## 6. Ordenação e limites

### 6.1 Prioridades

Limite de cinco professores, ordenados por:

1. severidade alta antes de média;
2. capacidade física excedida comprovada;
3. quantidade de indicadores pedagógicos abaixo da referência;
4. maior déficit de retenção;
5. maior déficit de presença;
6. maior distância da carteira para o P75;
7. nome do professor como desempate estável.

Não será criado um score paralelo de risco.

### 6.2 Oportunidades

Limite de três professores. Oportunidade de distribuição precede expansão sustentável. Dentro de cada tipo, a ordenação usa a distância para o P50 e, por último, o nome como desempate estável.

## 7. Formato público

### 7.1 Prioridades pedagógicas

```text
🚦 PRIORIDADES PEDAGÓGICAS

1. Rafael Alves Souza (Akeem)
   • Carteira: 51 | Referência superior da unidade: 24
   • Presença: 67,5% | Referência: 80,0%
   • Direcionamento: revisar distribuição e rotina pedagógica
```

O direcionamento é selecionado de um catálogo determinístico compatível com as evidências. A IA pode melhorar a redação, mas não criar causas, números ou ações incompatíveis.

### 7.2 Oportunidades

```text
🌱 OPORTUNIDADES DE DISTRIBUIÇÃO

• Matheus Felipe Lourenço — carteira 6, abaixo da referência, com disponibilidade cadastrada.
• Willian De Andrade Da Silva — expansão sustentável com presença e retenção preservadas.
```

### 7.3 Qualidade dos dados

```text
🔎 QUALIDADE DOS DADOS

• Capacidade física: 9 agrupamentos de ocupação de 5 professores usam apenas referência estimada.
• Complementar os vínculos de turma e sala para permitir a leitura de capacidade física.
• Essa pendência não representa sobrecarga e não altera nota ou prioridade pedagógica.
```

O termo `agrupamentos de ocupação` será usado enquanto não houver turma explícita, evitando chamar uma chave estimada de turma real.

## 8. Contagens do relatório

A linha pública `Sinais de carga ou distribuição` deixa de usar a contagem bruta. Ela passa a refletir somente prioridades e oportunidades publicáveis depois da deduplicação.

O total bruto continua disponível apenas no contrato de auditoria.

## 9. IA e segurança semântica

- A IA recebe somente prioridades e oportunidades publicáveis.
- Pendências de capacidade estimada não entram no prompt narrativo.
- Números, metas, limites e ordenação são determinísticos.
- A IA não recalcula indicadores nem classifica professores.
- Sinal desconhecido fica fora do texto público e é registrado para auditoria.
- Falha na projeção bloqueia a publicação do bloco; não produz a mensagem enganosa `nenhum sinal`.

## 10. Escopo excluído

- cadastrar ou reconciliar turmas e salas nesta entrega;
- alterar Health Score, pesos, metas ou snapshots;
- mudar regras de carteira, presença ou retenção;
- criar alertas automáticos diários ou semanais;
- modificar os outros quatro relatórios da Coordenação.

## 11. Estratégia de testes

### 11.1 Unidade

- capacidade estimada aparece somente em Qualidade dos dados;
- capacidade física comprovada pode gerar prioridade;
- professor não se repete no mesmo bloco;
- prioridades respeitam o limite de cinco;
- oportunidades respeitam o limite de três;
- ordenação é determinística;
- maturação isolada não entra no mapa;
- sinal desconhecido não vaza ao público.

### 11.2 Contrato e renderização

- IA e renderizador usam a mesma projeção;
- números exibidos são cópias das evidências canônicas;
- contagem pública considera itens deduplicados;
- texto não contém nomes técnicos internos;
- saída permanece UTF-8, copiável e sem paginação artificial.

### 11.3 PostgreSQL real

- fixture reproduz fallback estimado sem sala e garante ausência de prioridade;
- fixture com capacidade física excedida gera prioridade operacional;
- uma fixture baseada no recorte auditado do Recreio reproduz 5 professores e 9 agrupamentos somente em Qualidade dos dados, sem transformar essas quantidades em valores fixos da regra.

## 12. Critérios de aceite

- mapa público possui no máximo cinco prioridades e três oportunidades;
- nenhum professor é repetido dentro do mesmo bloco;
- capacidade estimada nunca gera alerta pedagógico;
- qualidade dos dados resume professores e agrupamentos afetados;
- possível sobrecarga é apresentada como correlação factual, não como causa comprovada;
- IA e renderer consomem a mesma seleção;
- contrato bruto de auditoria é preservado;
- Health Score e snapshots não são modificados;
- testes direcionados, PostgreSQL real, build e revisão independente ficam verdes antes da publicação.
