# Mapa do banco

| Arquivo | O que é | Quem escreve |
|---|---|---|
| [`TABELAS.gerado.md`](TABELAS.gerado.md) | Uma linha por tabela/view: domínio, colunas, linhas, RLS, FKs, `COMMENT` | script |
| [`FUNCOES.gerado.md`](FUNCOES.gerado.md) | Uma linha por função: estado, segurança e quem chama | script |
| [`detalhe/<dominio>.md`](detalhe/) | Colunas, tipos, defaults, FKs, índices únicos e triggers | script |
| [`NOTAS.md`](NOTAS.md) | Armadilhas e achados que nenhum script descobre | pessoas |

## Regenerar

```bash
npm run mapa:banco
```

Lê o Postgres pelas credenciais `SUPABASE_DB_*` do `.env.local` (conexão direta,
com fallback no pooler; em worktree, procura o `.env.local` do repositório
principal). **Rodar depois de toda migration.**

O gerador só reescreve arquivo cujo corpo mudou, então o `git diff` mostra
exatamente o que o banco ganhou ou perdeu — e a data no cabeçalho é a da última
mudança real, não a da última execução.

Objeto novo sem classificação cai no domínio `outros` **e o gerador avisa** com o
nome. Nesse caso, acrescente a regra em [`scripts/mapa-banco/areas.json`](../../scripts/mapa-banco/areas.json)
e rode de novo. Não existe sumiço silencioso.

## Os oito domínios

O mesmo vocabulário do [mapa de sistema](../MAPA-SISTEMA.md): `aluno`,
`comercial`, `professor`, `financeiro`, `gestao`, `operacao`, `plataforma`,
`integracao`.

## Como ler os estados de função

| Estado | Significa |
|---|---|
| **ATIVA** | tem consumidor vivo (front, edge, cron, trigger ou view) |
| **SÓ-INTERNA** | só é chamada por outra função — não é ponto de entrada |
| **ÓRFÃ** | nenhum consumidor conhecido |
| **LEGADO** | existe versão maior do mesmo nome-base |
| 🔓 **anon** | executável por `anon`, ou seja, por qualquer um com a chave pública |

🔴 **`ÓRFÃ` é sinal, não veredito.** O gerador não enxerga n8n, scripts das VPS
nem chamada direta ao PostgREST. Antes de apagar, confirme fora do repo.

## O que o gerador não cobre

- **Semântica.** Que `alunos.aluno_id` é matrícula e não pessoa está no
  `CLAUDE.md`, não aqui.
- **Produção versus repo.** O catálogo reflete o banco; edge function deployada
  e workflow n8n podem divergir do que está versionado.
- **Migrations.** O que existe hoje é o que vale; o histórico está em
  `supabase/migrations/`.
