# P0.1U - Renovacoes Antecipadas por Competencia Efetiva

Data: 2026-06-09

## Decisao de negocio

A competencia efetiva de uma renovacao antecipada e o mes da data da primeira aula do novo ciclo.

Exemplo: uma renovacao capturada em junho, mas com primeira aula do novo ciclo em julho, aparece em junho como renovacao antecipada e so conta como renovacao da competencia de julho.

## O que foi implementado

- Nova classificacao de renovacoes por competencia efetiva.
- Nova aba no Administrativo: `Renovacoes antecipadas`.
- Renovacoes antecipadas deixam de contaminar a taxa de renovacao do mes em que foram capturadas.
- Renovacoes antecipadas podem ser validadas com o mesmo fluxo operacional das renovacoes pendentes.
- Relatorio administrativo automatico foi ajustado no codigo para separar renovacoes antecipadas.
- Automacao `processar-matricula-emusys` foi ajustada no codigo para gravar competencia efetiva, status operacional e flag de antecipacao.

## Migration aplicada

Migration aplicada no projeto Supabase `ouqwbbermlzqqvtqwlul`:

- `supabase/migrations/20260609_p01u_renovacoes_antecipadas_competencia.sql`

Campos adicionados em `movimentacoes_admin`:

- `competencia_referencia`
- `renovacao_primeira_aula_novo_ciclo`
- `renovacao_antecipada`
- `renovacao_status`

## Validacao executada

- Helper de classificacao validado com `tsx`.
- `deno check` executado para:
  - `processar-matricula-emusys`
  - `relatorio-admin-whatsapp`
- `npm run build` executado com sucesso.
- Validacao visual local via Chrome/Playwright em `http://127.0.0.1:4176`.

## Evidencia visual

No Administrativo / Detalhamento do Mes:

- Aba `Renovacoes antecipadas` aparece.
- As renovacoes capturadas em junho com competencia futura aparecem separadas.
- A aba deixa claro que elas so contam na competencia da primeira aula do novo ciclo.

## Bloqueio de deploy

O deploy das Edge Functions nao foi concluido pela CLI local porque o token/usuario Supabase disponivel nao possui permissao no projeto `ouqwbbermlzqqvtqwlul`.

Resultado observado:

- `supabase functions deploy ... --project-ref ouqwbbermlzqqvtqwlul` retornou 403.
- O token local lista outros projetos, mas nao lista `ouqwbbermlzqqvtqwlul`.

Funcoes remotas continuam na versao anterior ate deploy autorizado:

- `processar-matricula-emusys`
- `relatorio-admin-whatsapp`

## Comandos pendentes para concluir deploy

Executar com conta/token Supabase que tenha permissao no projeto `ouqwbbermlzqqvtqwlul`:

```bash
supabase functions deploy processar-matricula-emusys --project-ref ouqwbbermlzqqvtqwlul
supabase functions deploy relatorio-admin-whatsapp --project-ref ouqwbbermlzqqvtqwlul
```

## Risco enquanto o deploy nao ocorrer

- O frontend local e a estrutura de banco ja entendem renovacoes antecipadas.
- O relatorio automatico WhatsApp remoto ainda pode sair pela regra antiga.
- Novas renovacoes vindas do Emusys ainda podem ser gravadas pela Edge Function antiga ate o deploy.

## Proxima validacao apos deploy

1. Disparar/validar um caso de renovacao antecipada real ou controlado.
2. Confirmar que ela entra em `Renovacoes antecipadas` no mes de captura.
3. Confirmar que ela nao entra em `Renovacoes` nem na taxa de renovacao do mes de captura.
4. Confirmar que o relatorio automatico separa a secao de renovacoes antecipadas.
5. Confirmar que na competencia efetiva ela passa a contar corretamente conforme status operacional.
