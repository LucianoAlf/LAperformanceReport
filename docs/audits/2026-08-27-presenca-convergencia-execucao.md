# Execução da convergência segura de presença

## Baseline

- base revalidada da especificação: `779c360493c6d9a5ae1ad209e763128d6de87f15`
- commits remotos recebidos e revisados antes da execução: `1042f76c`, `779c3604`
- sobreposição dos commits recebidos com presença/Hugo/spec/planos: nenhuma
- Hugo `08dca49c` é ancestral: sim
- `npm test`: Deno 41/41; pré-testes Node 9/9; suíte principal 414/414
- `npm run build`: aprovado
- warnings preexistentes do build: ciclo de chunks do Recharts; importação estática e dinâmica de `presencaRecibo.ts`; chunks acima de 500 kB
- writes remotos nesta etapa: nenhum

## Fase 1 — paridade

- `main` local em fast-forward com `origin/main` no checkpoint: sim; o avanço executado foi atômico de `779c3604` para `e24175f7`, sem trocar nem tocar o checkout ativo do Hugo
- linha de corte da branch após rebases limpos: `c4906775`; os commits remotos posteriores `c0581e4e`, `3a9292f8` e `2098304d` chegaram durante a revisão, foram inspecionados como retenção/pesquisa de evasão e ficam para a integração final sobre a `main` mais recente
- documentos locais preservados byte a byte durante esse avanço; SHA-256 medidos antes/depois: `D67ABD320AB6E39049F327CFF95CF8D863ED07ADE32D6BBBA2F2DBAE37C46992` e `985FA052BB2D7592AF2ED963760A29D97DC2D47B6F59F3A434B0BA9B4714AA5C`
- WIP isolado em `codex/presenca-hardening-wip-preservado`, commit `ef05e3ac`, não publicado
- migrations versionadas: 24/24; ledger remoto: 24/24 versões, nomes, contagens e hashes conferidos
- snapshot Edge do gate: 8/8 funções e 35/35 arquivos remotos iguais às fontes locais normalizadas, selados por versão, `verify_jwt`, SHA-256 LF e tamanho em `docs/audits/2026-08-27-presenca-edge-manifest.json`; deploy executado: não
- rechecagem Edge em `2026-08-27T18:41:35.1559589-03:00`: 7/8 bundles permaneciam idênticos; `relatorio-admin-whatsapp` avançou depois do snapshot de v112 (`97463bd2…`) para v113 (`3fc1ae96…`) por mudança concorrente, com diferença apenas no entrypoint entre os 35 arquivos conferidos; essa deriva não foi sobrescrita nem atribuída ao pacote de presença
- evidência da prévia rebaixada ao contrato efetivamente provado: RPC read-only sem mutação executada; somente a classificação shadow pode ser aprovada, `reparo_aprovado=false` e `decisoes_humanas_pos_reparo_verificadas=false`
- o comentário histórico “byte-estável” permanece nos bytes imutáveis da migration já publicada `20260827031500`; ele não é aceito como evidência por nenhum script do gate e deverá ser corrigido por migration sucessora antes de qualquer reparo/cutover
- saída agregada mantém `pii_no_output=true` porque `sync_completo_motivo` passou a aceitar somente o valor canônico gerado pelo SQL; texto livre é rejeitado antes da serialização
- guard de arquivo usa a raiz física do repositório, resolve o ancestral existente contra junction/symlink, recusa sobrescrita e foi exercitado a partir de outro `cwd`
- runtime Vite alterado na Fase 1: não (`SRC_DIFF_COUNT=0`)
- locks `package-lock.json` e `deno.lock`: sem diff
- verificação backend após a segunda rodada de qualidade: Deno 4/4 e Node 78/78
- RED→GREEN da segunda rodada com Node 22.23.2: 3 falhas reproduzidas; depois 14/14 nos testes focados e 17/17 no gate combinado de paridade, prévia, PII e proteção de arquivo
- suíte integral: Deno 43/43; pretest Node 9/9; suíte principal com Node 22.23.2: duas confirmações finais consecutivas 430/430, sem skips
- variância observada: uma execução intermediária terminou 422/430, com 1 falha e 7 skips sem bloco de erro preservado; a causa não foi confirmada e as duas repetições imediatas passaram 430/430 e 430/430
- build direto na linha de corte com Node 22.23.2 e Vite 6.4.1: 4.832 módulos, aprovado em 14,46 s
- warnings não bloqueantes já conhecidos: chunks circulares do Recharts, `presencaRecibo` estático e dinâmico e chunks acima de 500 kB
- writes remotos da Fase 1: nenhum; nenhuma migration aplicada, Edge deploy, push ou deploy Vercel neste gate
