# Relatório Gerencial Mensal — LA Music

## Objetivo

O relatório gerencial reúne, em uma leitura executiva por unidade, o fechamento
mensal Administrativo, o fechamento mensal Comercial, metas e rankings
pedagógicos publicáveis. Ele é gerado manualmente pelo botão **Relatório
Gerencial com IA**.

O relatório de uma competência encerrada nunca é recalculado com o estado vivo
do banco. Os números vêm dos documentos mensais fechados da mesma unidade e
competência.

## Contrato de geração

1. O navegador envia somente `unidade`, `ano` e `mes` para
   `gemini-relatorio-gerencial`.
2. A edge valida a sessão e chama `get_relatorio_gerencial_canonico_v1`.
3. O produtor exige os dois documentos mensais com status `fechado`:
   - `get_relatorio_admin_mensal_rico_v1`;
   - `get_relatorio_mensal_canonico_v1('comercial', ...)`.
4. O produtor valida unidade e competência, acrescenta metas configuradas e
   rankings V3 somente de snapshots oficiais, habilitados e publicáveis, e
   devolve um contrato versionado.
5. A edge monta todos os indicadores e seções numéricas de forma determinística.
6. A IA redige somente resumo, conquistas, pontos de atenção, plano de ação e
   mensagem final. Ela não calcula, corrige nem substitui indicadores.

Não há fallback vivo. Se um dos fechamentos não estiver disponível ou divergir
da unidade/competência pedida, a geração falha sem publicar números parciais.
Retificações mensais auditadas são respeitadas sem alterar o snapshot original.
O responsável exibido no cabeçalho é o gerente vigente no cadastro da unidade.

## Conteúdo público

O texto entregue ao gerente contém:

- financeiro: MRR, faturamento previsto, ticket da base ativa, total e ticket
  das novas parcelas, total e ticket dos passaportes, inadimplência e MRR perdido;
- base de alunos e composição das matrículas, incluindo multicurso;
- trancamentos no fechamento, faixas da política e somente os nomes dos casos
  que exigem acompanhamento;
- funil comercial com volumes, frações e taxas;
- interesses dos leads, canais das matrículas e alertas de qualidade cadastral;
- retenção, renovações, avisos prévios e principais motivos de saída;
- rankings oficiais e publicáveis de permanência, matrículas, presença e média
  de alunos por turma;
- metas mensais, Fideliza+ LA e Matriculador+ LA;
- análise qualitativa e plano de ação.

O texto público não inclui nomes de funções, fontes internas, versões, hashes,
payloads ou linguagem de implementação. Metadados de auditoria permanecem
somente no contrato interno do produtor.

## Distinções obrigatórias

- **Ticket da base ativa:** indicador financeiro do fechamento Administrativo.
- **Ticket das novas parcelas:** média das parcelas das matrículas comerciais do mês.
- **Ticket dos passaportes:** média dos passaportes das matrículas comerciais do mês.
- **Cursos/interesses mais procurados:** distribuição do curso de interesse dos
  leads; não é a distribuição da base ativa de alunos.
- **Experimental para matrícula:** usa a conversão atribuída do fechamento
  Comercial e sempre exibe taxa e fração.
- **Saídas:** total inclui interrupções, bolsistas e não renovações; a composição
  aparece separada.
- **Trancamentos:** alunos e matrículas trancadas não entram como base ativa; os
  casos fora do período contratual ficam visíveis para ação gerencial.

## Ausência de dados

- Comparativos só podem ser exibidos quando as competências usam as mesmas
  definições e estão fechadas. Até existir essa equivalência, o relatório informa
  que a comparação não está disponível.
- Valor de lojinha não é convertido em zero quando não existe uma fonte fechada.
  A linha é omitida.
- Ranking sem evidência publicável informa ausência de dados suficientes.

## IA e proteção contra alucinação

A IA recebe um resumo estruturado, mas sua resposta é aceita apenas nos cinco
campos qualitativos. Respostas com números, percentuais, valores monetários ou
termos técnicos — inclusive números e percentuais escritos por extenso — são
descartadas campo a campo e substituídas por texto
determinístico seguro.

## Ordem segura de publicação

O contrato novo do botão e o contrato antigo da edge não são compatíveis. A
publicação deve respeitar esta ordem:

1. aplicar a migração do produtor;
2. publicar `gemini-relatorio-gerencial`;
3. publicar o frontend.

Durante a janela entre os passos dois e três, o botão antigo falha sem publicar
um relatório. O frontend novo nunca deve ser publicado antes da edge.

## Componentes

- Produtor: `get_relatorio_gerencial_canonico_v1`
- Migração: `20260801193000_relatorio_gerencial_canonico.sql`
- Edge: `supabase/functions/gemini-relatorio-gerencial/index.ts`
- Botão: `src/components/App/Administrativo/ModalRelatorio.tsx`
- Testes: `tests/relatorioGerencialCanonico.test.mjs` e
  `tests/relatorioGerencialCanonicoPostgres.test.mjs`
