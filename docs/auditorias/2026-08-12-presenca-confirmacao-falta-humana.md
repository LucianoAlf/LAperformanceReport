# Checkpoint — confirmação de registro respeita falta humana

**Data:** 12/08/2026  
**Projeto Supabase principal:** `ouqwbbermlzqqvtqwlul`  
**Migration aplicada:**
`20260812175508_presenca_canonica_confirmacao_respeita_falta_humana`

## Achado

`fn_materializar_presenca_padrao` transformava toda fatia sem campo de
presença em `presente` durante a confirmação do registro. A intenção aprovada
permanece: confirmar e gravar uma aula é uma declaração humana de que ela
ocorreu. Porém, a implementação não consultava uma falta humana já registrada
por secretaria, professor ou Fábio; ela podia gravar conteúdo para um aluno
que já estava marcado como ausente.

## Regra aplicada

- abrir, autosalvar, copiar ou duplicar rascunho não escreve `aluno_presenca`;
- confirmar/gravar continua promovendo a presença sem decisão humana contrária;
- se a linha canônica da mesma aula/aluno tem origem humana forte e
  `falta`/`falta_justificada`, a fatia recebe `presenca='ausente'`;
- a confirmação então pula o conteúdo desse aluno e o núcleo canônico conserva
  a falta, a origem e o espelhamento existente;
- uma ausência bruta do Emusys continua inconclusiva e pode ser promovida a
  presença pela confirmação humana final.

Não foi criado dado sintético nem houve escrita de presença durante a prova.

## Evidência

- teste de contrato novo em `tests/presencaCanonicaContrato.test.mjs`;
- suíte do Report: **36 testes aprovados**;
- função remota inspecionada após aplicação: consulta `aluno_presenca` sob lock
  compartilhado e chama `fn_presenca_e_forte` antes de preservar a falta;
- ACL da helper interna: `anon=false`, `authenticated=false`,
  `service_role=false` para `EXECUTE`.

## Próximo passo

A ficha manual continua em worktree Git independente. Ela só poderá chamar a
confirmação final existente depois de seu contrato de rascunho, versão,
autosave/offline e cópia dentro do roster ser implementado e testado. Não há
branch Supabase para esta frente.
