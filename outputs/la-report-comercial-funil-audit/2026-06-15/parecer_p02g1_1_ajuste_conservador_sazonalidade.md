# Parecer P02.G1.1 - Ajuste conservador da Sazonalidade

Data: 2026-06-15

## Contexto

O P02.G2 concluiu que a distribuicao de `matriculas_comerciais_principais` por unidade ainda nao pode ser publicada como performance comercial por unidade.

Motivos principais:

- `alunos.unidade_id` cobre 73/73, mas mede unidade cadastral/atual do aluno.
- Lead/origem cobre 1/73.
- Experimental cobre 0/73.
- Historico cobre 3/73.
- Turma/curso cobre 0/73.
- Primeira presenca cobre 52/73, mas e operacional e muitas vezes em 2026.
- A regra atual de 2025 e praticamente `valor_passaporte > 0`, com preenchimento desigual entre unidades.

## Decisao aplicada

Ajuste conservador no PR #4 para nao publicar a distribuicao de matriculas comerciais por unidade.

## Escopo alterado

Arquivo de codigo alterado:

- `src/components/Comercial/ComercialSazonalidade.tsx`

Arquivos mantidos sem alteracao intencional:

- `src/hooks/useComercialSeriesMensaisV2.ts`
- `src/components/App/Layout/AppSidebar.tsx`
- RPC v2
- Supabase
- Dashboard
- Analytics
- `/app/comercial`
- demais componentes comerciais

## O que mudou na UI

- Mantem `Leads Entrantes` como metrica principal.
- Remove a linha de `Matriculas Comerciais` do grafico.
- Remove o toggle `Leads Entrantes / Matriculas Comerciais`.
- Remove o heatmap de matriculas comerciais por unidade.
- Mantem apenas um card consolidado diagnostico:
  - `Matriculas comerciais - criterio atual em validacao`
- Adiciona copy curta:
  - `Distribuicao de matriculas por unidade em validacao semantica. Leads ja usam fonte canonica v2.`

## O que nao mudou

- Nao alterou banco.
- Nao rodou SQL.
- Nao alterou RPC.
- Nao alterou fonte v2.
- Nao migrou outro consumidor.
- Nao fez merge/deploy.

## Risco restante

O total consolidado de matriculas comerciais ainda vem do criterio atual da RPC v2. Ele fica exibido como diagnostico, nao como distribuicao por unidade e nao como performance comercial canonica.

## Recomendacao

Manter o PR #4 em draft ate revisao visual do P02.G1.1.

Se a validacao visual passar, o PR #4 pode ser reconsiderado como patch conservador de Sazonalidade focado em `Leads Entrantes`, com matriculas comerciais apenas em diagnostico consolidado.
