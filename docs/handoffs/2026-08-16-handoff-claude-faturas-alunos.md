# Handoff para o Claude — página Faturas de Alunos e consumo canônico

Data: 16/08/2026
Repositório LA Report: commit `068b54fd` em `main` (backend canônico base: `847efdf4`)
Supabase: `ouqwbbermlzqqvtqwlul`
Design aprovado: A+C

## Prompt para copiar e enviar ao Claude

```text
Claude, implemente no LA Report o subprojeto “Faturas de Alunos” conforme:

docs/superpowers/specs/2026-08-16-faturas-alunos-a-c-design.md
docs/superpowers/plans/2026-08-16-faturas-alunos-a-c.md

Decisão de produto já aprovada: A+C. A é a página dedicada
/app/faturas, com a UI do mockup aprovado. C são atalhos contextuais em Alunos,
Comercial e na ficha do aluno. A página dedicada é a fonte da experiência; os
atalhos não devem criar painéis ou consultas paralelas.

O backend canônico já existe. Para a lista operacional, consuma somente:

public.get_inadimplencia_canonica(p_unidade_id uuid, p_as_of_date date)

Use a sessão autenticada do Supabase no navegador. Não coloque service_role,
token do Emusys ou segredo em frontend, bundle, log, URL ou prompt.

O payload é schema_version=3. Obedeça:

- collection_allowed e fresh_until são o gate real;
- status=partial libera apenas items confirmados;
- status=stale, incomplete ou error não libera lista acionável;
- source_missing não significa pago e só aparece na área de reconciliação;
- invalid_identity_invoice_count também fica fora dos itens e totais;
- não faça fallback para sync_run_items, emusys_faturas,
  inadimplente_emusys, status_pagamento, nome, telefone ou emusys_student_id;
- não recalcule valor_original, valor_atualizado, juros ou totais no componente;
- preserve data de corte, frescor, competência, unidade e IDs exatos da fatura.

Regras de negócio já fechadas:

- janela operacional = mês atual + dois meses anteriores;
- em 16/08/2026 = junho, julho e agosto;
- fatura = status aberta + vencimento anterior à data de corte;
- pessoa atual = matrícula Emusys ativa na mesma unidade;
- trancado e evadido ficam fora da cobrança principal e permanecem apenas no
  histórico/reconciliação;
- ex-aluno sem matrícula atual não entra na lista operacional;
- cobrança amigável é D+2 no consumidor da Sol, não na verdade D+0 da UI;
- valor atualizado já vem do canônico pela regra contratual 2% + 1% ao mês pro
  rata die, perda do desconto e arredondamento por fatura.

Entregue:

1. src/lib/faturasAlunosCanonicas.ts e tipos/testes do adaptador;
2. src/components/App/FaturasAlunos/FaturasAlunosPage.tsx;
3. rota lazy /app/faturas em src/router.tsx;
4. entrada no AppSidebar;
5. atalhos em Alunos, Comercial e ModalFichaAluno;
6. cards Confirmadas D+0, Cobrança D+2, Valor atualizado e Reconciliação;
7. filtros por unidade, competência, situação, aluno e curso;
8. tabela por fatura canônica e drawer de detalhe;
9. estados loading, ok, partial, stale, incomplete, error e empty;
10. testes e prova visual autenticada após reload.

A tabela deve ter aluno, unidade, curso, competência, vencimento, dias de
atraso, situação, valor original, valor atualizado, matrícula e detalhe. O
detalhe deve mostrar fatura, matrícula, contrato, data de corte, frescor e o
vínculo exato usado.

Na situação partial, o usuário precisa ver a lista confirmada e, em bloco
separado, quantas faturas aguardam reconciliação e quantas têm identidade
inválida. Nunca chame isso de “pago” e nunca permita ação de cobrança nessas
linhas.

Não implemente ainda o histórico completo de ex-alunos. A API do Emusys permite
consulta de faturas por matrícula/aluno/contrato, mas essa camada precisa de
endpoint backend seguro, paginação e auditoria. Não simule esse histórico com o
snapshot de três competências; deixe uma área “Em breve” ou faça apenas o
recorte canônico documentado.

Não altere migrations, RPCs de caixa da Sol, worker de sync, regras de presença
ou LA Teacher. A Sol continua consumindo a RPC operacional
public.sol_caixa_inadimplentes no backend, com service_role, e não deve criar
sync próprio. A nova página do LA Report consome get_inadimplencia_canonica;
ela não chama sol_caixa_inadimplentes diretamente do browser.

Antes de concluir, rode testes/build, faça browser proof para Campo Grande,
Recreio, Barra e consolidado autorizado, confira console e reload, e devolva:

- commit e arquivos alterados;
- origem exata dos números;
- resultado de cada estado do contrato;
- screenshots ou evidência de browser;
- pendências que ficaram deliberadamente fora.
```

## Estado atual para não haver falsa conclusão

### Já concluído no LA Report

- contrato canônico v3 e leitura parcial segura publicados;
- fila única do sync Emusys com backoff e worker ativo;
- julho tratado para 429 e identificador inválido em `matricula_id`;
- janela antiga incluída no sync;
- `source_missing` isolado, sem ser interpretado como pagamento;
- consumidores operacionais ajustados para consumir o canônico;
- tela atual de Alunos liberando apenas o conjunto confirmado;
- Campo Grande conferido item a item e por competência;
- regra operacional publicada: somente aluno ativo; trancado e evadido ficam
  fora da cobrança principal e permanecem na reconciliação/histórico;
- vínculo determinístico da Manuela reparado por unidade + matrícula única,
  sem associação por nome;
- exportações oficiais de Recreio e Barra reconciliadas por competência.

### Ainda pendente

- implementação visual da página `/app/faturas`;
- atalhos A+C;
- novo sync controlado das três competências para o canônico voltar de
  `stale` a `partial` ou `ok`, com `collection_allowed = true`;
- histórico completo de faturas e carteira separada de ex-alunos;
- prova final da página em produção e handoff final do Claude.

## Fronteira com a Sol

A Sol é consumidora da leitura canônica. Não modificar:

- `sol_caixa_lancar_recebimento`;
- `sol_caixa_abrir`;
- `sol_caixa_fechar`;
- `sol_caixa_casar_parcela`.

O Claude deve ligar a Sol somente depois do modo sombra aprovado, mantendo
`status`, `collection_allowed`, `collection_scope` e `fresh_until` na auditoria
de cada leitura.
