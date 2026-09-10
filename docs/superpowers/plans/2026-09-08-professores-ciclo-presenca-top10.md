# Professores: presença do ciclo vivo e Top 10

## Objetivo

Fazer o retrato do ciclo aberto exibir a mesma referência mensal disponível quando
a presença canônica do mês em curso ainda estiver bloqueada, sem promover esse
dado para a nota/ranking. Corrigir o Matriculador consolidado e ampliar os sete
destaques do relatório para Top 10.

## Regras de segurança

- O ciclo Set-Nov continua em acompanhamento, com `ranking_habilitado = false`.
- Nunca usar Outubro ou Novembro antes de chegarem; o recorte direto continua
  limitado a `current_date`.
- A referência mensal apenas preenche a exibição da presença quando o recorte
  aberto não é publicável; ela permanece fora da nota.
- Snapshots fechados e fórmulas/pesos vigentes não serão reescritos.

## Verificação

- [ ] Regressão PostgreSQL: referência de setembro entra no ciclo bloqueado e
      um snapshot de outubro não entra.
- [ ] Regressão de texto: cada bloco por indicador contém no máximo 10 nomes.
- [ ] Corrigir o leitor consolidado de matrículas por unidade.
- [ ] Regerar os quatro retratos Set-Nov e provar a tela autenticada.
