# Conciliação Emusys: separar matrícula/grade de cadastro e financeiro

> Status: aprovado pelo produto em 18/08/2026. Implementação no worktree
> `fix/conciliacao-matricula-grade`.

## Objetivo

Eliminar o uso indevido de `matriculas_divergencias.auto_preview` como fila
genérica. A aba **Conciliação Emusys** deve mostrar como sugestão de
matrícula/grade exclusivamente diferenças de curso, professor, dia ou horário.
Dados cadastrais e financeiros precisam seguir seus próprios contratos, sem
apagamento de histórico nem sobrescrita de decisão humana.

## Evidência de partida

- A função `sync-matriculas-emusys` registrava em `auto_preview` patches de
  telefone, e-mail, responsável, foto, status financeiro, valores e grade.
- A tela rotulava todo `auto_preview` como `Sync grade`, inclusive registros
  antigos, o que gerou ruído na Barra, Campo Grande e Recreio.
- O cron operacional atualiza cadastro e estado, mas retorna antes da fase B;
  por isso uma fila genérica antiga podia permanecer congelada.

## Etapas

1. Criar testes de classificação por domínio que falhem para campos não-grade
   em `auto_preview` e cubram patch misto.
2. Centralizar a classificação dos campos do patch em módulo compartilhado:
   - grade: `curso_id`, `professor_atual_id`, `dia_aula`, `horario_aula`;
   - cadastro: telefone, e-mail, responsável, foto e Instagram;
   - financeiro operacional: forma e status de pagamento;
   - valores/contrato: valor cheio, descontos, parcela e fim de contrato.
3. Alterar `sync-matriculas-emusys`:
   - gerar `auto_preview` apenas para patch exclusivamente de grade;
   - manter foto/Instagram na trilha de atributos;
   - converter diferenças de valor para `valor_divergente` e fim de contrato
     para revisão de status/contrato, nunca para grade;
   - preservar as proteções de campos fixados e identidade por
     unidade + matrícula Emusys.
4. Versionar uma migration auditável que reclassifica a fila legada:
   - fecha itens puramente não-grade com decisão técnica e payload original em
     metadata;
   - para itens mistos, mantém somente a parcela de grade ativa e armazena os
     campos separados no histórico da própria linha;
   - cria/atualiza a pendência apropriada de atributo/financeiro quando ela
     ainda não existe;
   - nunca interpreta ausência da origem como pagamento nem substitui decisão
     humana.
5. Fortalecer a UI para que um payload futuro inválido nunca seja exibido ou
   aprovado como `Sync grade`; ela deve informar a classificação correta.
6. Atualizar a documentação de integração/negócio e validar na Barra:
   - contagem de `auto_preview` apenas de grade;
   - dados de contato/foto/financeiro fora de grade;
   - nenhuma alteração automática em aluno com campo fixado;
   - resultado visível na tela após recarregar.
7. Executar testes focados, build e regressão; então versionar, aplicar a
   migration, publicar a Edge Function e integrar somente com evidência.

## Critérios de aceite

- Telefone, e-mail, foto, Instagram, forma de pagamento, status financeiro,
  valores e contrato nunca aparecem como `Sync grade`.
- A lista de grade contém apenas divergências de curso, professor, dia ou
  horário e mantém a decisão humana existente.
- Itens legados ficam auditáveis e deixam de poluir a fila operacional.
- A tela de atributos/financeiro continua com seu próprio fluxo de resolução.
