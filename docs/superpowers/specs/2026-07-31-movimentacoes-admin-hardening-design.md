# Hardening de `movimentacoes_admin` — Design

**Status:** aprovado para planejamento; não executar neste momento

**Prioridade:** depois da homologação do Plano A e antes do Subprojeto C

**Projeto Supabase de produção auditado:** `ouqwbbermlzqqvtqwlul`
**Data da fotografia:** 31/07/2026

## 1. Contexto

`public.movimentacoes_admin` é a fonte canônica de renovação, não renovação,
aviso, evasão e trancamento. A tabela possui 1.623 registros na fotografia
auditada e é consumida diretamente por mais de 20 arquivos do frontend.

A segurança atual é incompatível com esse papel:

- policy `Permitir acesso total para usuários autenticados`, comando `ALL`,
  `USING (true)` e `WITH CHECK (true)`;
- grants amplos de tabela para `authenticated`;
- policy `lume_readonly_select`, `SELECT USING (true)`, para
  `sol_acesso_restrito`;
- campos operacionais e de contato ficam disponíveis sem escopo de unidade.

O problema é preexistente. Ele não bloqueia a homologação do Plano A porque uma
revogação apressada quebraria consumidores administrativos, retenção e
dashboards que não pertencem à pesquisa de evasão.

Há, porém, um efeito novo que precisa ser tratado com precisão: o trigger do
Plano A passa a preencher `telefone_snapshot` nas novas saídas. Na fotografia
de 180 dias, somente 3 de 385 saídas tinham esse snapshot. Portanto, o Plano A
aumenta a densidade futura do dado pessoal numa tabela hoje ampla. Antes do
rollout produtivo, esse risco exige hardening concluído ou aceite explícito
registrado.

## 2. Objetivo

Substituir o acesso bruto e global a `movimentacoes_admin` por contratos
governados:

- leitura por unidade e finalidade;
- escrita por operações explícitas;
- campos pessoais mínimos por consumidor;
- trilha de auditoria;
- compatibilidade comprovada com a pesquisa de evasão.

## 3. Fora do escopo

- mudar a taxonomia de movimentações;
- alterar o timing de disparo D+X ou política de lembrete do Subprojeto C;
- reclassificar dados históricos;
- dar respostas privadas de `pesquisa_evasao` à Sol, Mila ou outros agentes;
- refatorar todos os módulos de retenção em uma única entrega.

## 4. Inventário obrigatório

Antes do primeiro DDL, gerar uma matriz dos 20+ consumidores reais do frontend.
Para cada arquivo, registrar:

| Campo | Descrição |
|---|---|
| Consumidor | caminho e componente/hook |
| Operação | SELECT, INSERT, UPDATE ou DELETE |
| Tipos usados | evasão, renovação, trancamento etc. |
| Colunas necessárias | allowlist exata |
| Escopo | unidade, consolidado ou administrativo |
| Permissão | código granular necessário |
| Contrato de destino | view `security_invoker`, RPC ou Edge |
| Teste de regressão | cenário observável |

O inventário deve distinguir consultas agregadas, listas nominais, formulários
de escrita e integrações server-side. Nenhum `select('*')` entra nos contratos
novos.

## 5. Modelo de acesso

### 5.1 Leituras humanas

- usuário operacional lê somente unidades para as quais possui permissão
  explícita;
- consolidado multiunidade exige permissão correspondente em cada linha;
- `p_unidade_id = NULL` significa “todas as unidades autorizadas”, nunca acesso
  global;
- telefone, observações e snapshots aparecem apenas nos contratos cuja
  finalidade exige esses campos;
- dashboards recebem agregados sem telefone ou texto livre.

### 5.2 Escritas

INSERT, UPDATE e DELETE diretos pelo navegador serão substituídos por RPCs ou
Edge Functions com:

- JWT válido;
- usuário interno ativo e único;
- permissão específica na unidade da movimentação;
- validação de transição de estado;
- auditoria de autor, instante e alteração;
- idempotência onde houver integração externa.

### 5.3 Agentes

A policy `lume_readonly_select` da Sol será revisada à luz do §13.2 da spec da
Pesquisa de Evasão V2. A Sol não receberá leitura nominal irrestrita por ser um
agente administrativo. Cada agente consumirá read model próprio e mínimo:

- Sol: administrativo, sem respostas privadas da pesquisa;
- Lia: sucesso do aluno por contrato governado;
- Fábio: professor/coordenação, sem telefone ou resposta privada bruta.

## 6. Estratégia de migração

1. congelar o inventário dos consumidores e seus testes;
2. criar read models/RPCs em paralelo ao acesso legado;
3. migrar consumidores em lotes por finalidade;
4. comparar contagens e resultados entre legado e contrato novo;
5. retirar mutações diretas;
6. substituir `ALL ... true` por RLS por unidade;
7. revisar/remover `lume_readonly_select`;
8. revogar grants brutos excedentes;
9. executar regressão completa;
10. manter rollback por lote até o fechamento.

A revogação final só ocorre quando a busca por consumidores diretos retornar
zero e os testes comportamentais estiverem verdes.

## 7. Compatibilidade obrigatória com a pesquisa de evasão

O hardening deve garantir que a pesquisa de evasão continua funcionando:

- as duas overloads legadas e a RPC v2 listam somente saídas canônicas
  autorizadas;
- `stats_pesquisa_evasao` mantém os mesmos totais por unidade;
- a Edge service-role continua resolvendo a movimentação depois de autenticar e
  autorizar o operador;
- o trigger de `telefone_snapshot` não abre leitura do snapshot a usuários sem
  finalidade;
- modo teste continua fora de `movimentacoes_admin`;
- nenhum dos seis registros legados de teste alimenta indicador ou ação.

## 8. Testes de segurança

A homologação do projeto precisa provar:

- usuário de uma unidade não lê nem altera outra;
- usuário multiunidade agrega somente vínculos autorizados;
- `authenticated` não executa SELECT/INSERT/UPDATE/DELETE bruto;
- Sol não lê telefone, motivo livre ou snapshot por
  `lume_readonly_select`;
- RPCs rejeitam usuário inativo, unidade nula indevida e tentativa de ampliar
  escopo;
- service-role não substitui a autorização humana em fluxos iniciados pelo
  navegador;
- respostas privadas permanecem governadas exclusivamente por
  `pesquisa_evasao` e tabelas filhas.

## 9. Definition of Done

- inventário dos 20+ consumidores revisado e versionado;
- todos os consumidores migrados para contratos com allowlist de colunas;
- RLS por unidade substitui a policy `ALL ... true`;
- `lume_readonly_select` removida ou reduzida a read model mínimo coerente com
  o §13.2;
- grants brutos de roles cliente revogados;
- fluxo da pesquisa de evasão sem regressão;
- testes SQL, Node, build e smoke test de homologação verdes;
- diff e rollback revisados;
- project ref reconfirmado antes de qualquer migração ou deploy.

## 10. Sequência

Este projeto começa depois da homologação do Plano A. Ele termina antes do
Subprojeto C, para que timing e lembretes sejam construídos sobre a fonte
canônica já governada. Auditorias somente leitura da VPS podem continuar em
paralelo.
