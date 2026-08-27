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
- linha de corte da branch após rebases limpos: `c4906775`; os commits remotos posteriores `c0581e4e` e `3a9292f8` chegaram durante a revisão, foram inspecionados como retenção/pesquisa de evasão e ficam para a integração final sobre a `main` mais recente
- documentos locais preservados byte a byte durante esse avanço; SHA-256 medidos antes/depois: `D67ABD320AB6E39049F327CFF95CF8D863ED07ADE32D6BBBA2F2DBAE37C46992` e `985FA052BB2D7592AF2ED963760A29D97DC2D47B6F59F3A434B0BA9B4714AA5C`
- WIP isolado em `codex/presenca-hardening-wip-preservado`, commit `ef05e3ac`, não publicado
- migrations versionadas: 24/24; ledger remoto: 24/24 versões, nomes, contagens e hashes conferidos
- Edge sources: 8/8 funções e 35/35 arquivos remotos iguais às fontes locais normalizadas; deploy executado: não
- runtime Vite alterado na Fase 1: não (`SRC_DIFF_COUNT=0`)
- locks `package-lock.json` e `deno.lock`: sem diff
- testes backend: Deno 4/4 e Node 75/75
- paridade com Node 22.23.2: 3/3
- suíte integral: Deno 43/43; pretest Node 9/9; suíte principal com Node 22.23.2: duas confirmações finais consecutivas 430/430, sem skips
- variância observada: uma execução intermediária terminou 422/430, com 1 falha e 7 skips sem bloco de erro preservado; a causa não foi confirmada e as duas repetições imediatas passaram 430/430 e 430/430
- build direto na linha de corte com Node 22.23.2 e Vite 6.4.1: 4.832 módulos, aprovado em 14,46 s
- warnings não bloqueantes já conhecidos: chunks circulares do Recharts, `presencaRecibo` estático e dinâmico e chunks acima de 500 kB
- writes remotos da Fase 1: nenhum; nenhuma migration aplicada, Edge deploy, push ou deploy Vercel neste gate
