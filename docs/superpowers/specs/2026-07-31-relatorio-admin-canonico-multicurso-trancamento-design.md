# Relatorio administrativo canonico: multicurso e trancamentos

**Data:** 2026-07-31

## Objetivo

Unificar o relatorio administrativo diario automatico e o relatorio gerado pelo botao em uma unica fonte canonica, corrigindo a contagem de pessoas, matriculas adicionais e trancamentos.

## Regras aprovadas

- Uma pessoa ativa conta uma unica vez em `Alunos ativos`, mesmo que tenha dois ou tres cursos.
- Uma pessoa conta como pagante se possuir ao menos uma matricula ativa, paga e nao classificada como banda ou bolsa.
- Cada curso ativo conta como uma matricula ativa.
- Uma matricula trancada deixa de contar como matricula ativa e financeira.
- Se a pessoa tiver uma matricula ativa paga e outra trancada, continua sendo pessoa ativa e pagante; somente a matricula trancada sai dos totais ativos.
- Banda e bolsa nao tornam a pessoa pagante.
- Banda fica separada das matriculas academicas adicionais.
- O relatorio informa quantas pessoas possuem exatamente dois cursos, exatamente tres cursos e quatro ou mais cursos.
- O relatorio lista cada matricula trancada com aluno, curso, inicio, tempo decorrido, previsao de retorno, motivo e faixa da politica.
- Politica de trancamento: primeiro mes contratual, segundo mes por extensao gerencial e, acima de dois meses, fora da politica. Inicio ausente vira alerta de qualidade de dados.

## Diagnostico

O RPC vigente deriva a identidade de pessoa pelo nome normalizado e considera uma matricula adicional apenas quando `is_segundo_curso=true` e `tipo_codigo <> 'REGULAR'`. Essa combinacao:

1. permite colisao entre homonimos;
2. exclui matriculas adicionais validas classificadas como `REGULAR`;
3. mistura quantidade de pessoas com quantidade de vinculos;
4. nao representa corretamente uma pessoa com um curso ativo e outro trancado.

No Recreio, a base viva possui 343 pessoas ativas e 429 matriculas ativas: 343 matriculas-base, 59 de banda e 27 matriculas adicionais. O filtro incorreto reduz as adicionais para 24 e o total para 426.

O relatorio automatico e o relatorio do botao tambem possuem dois formatadores independentes. Isso permite divergencias mesmo quando consultam dados semelhantes.

## Desenho

### 1. Identidade e graos

O calculo passa a trabalhar com dois graos explicitos:

- `pessoa`: identificada pelo ID estavel do aluno no Emusys, sempre dentro da unidade;
- `matricula`: identificada pela linha/vinculo operacional e pelo ID da matricula no Emusys.

A identidade Emusys e resolvida, em ordem, pelo campo materializado em `alunos`, pelo estado atual da matricula e pela jornada de matricula/disciplina. Nomes nunca sao usados para unir pessoas. Quando nao houver identidade estavel, a linha recebe uma chave local unica e a cobertura e exposta como alerta, evitando tanto fusao de homonimos quanto descarte silencioso.

### 2. KPIs administrativos

Uma migracao aditiva substitui o corpo de `get_kpis_alunos_admin_operacional` mantendo sua assinatura e campos legados. Os novos campos incluem:

- `alunos_com_exatamente_2_cursos`;
- `alunos_com_exatamente_3_cursos`;
- `alunos_com_4_ou_mais_cursos`;
- `matriculas_trancadas`;
- cobertura e pendencias de identidade estavel.

`matriculas_2_curso` permanece como campo de compatibilidade e passa a significar todas as matriculas academicas adicionais ativas, inclusive terceiro e cursos posteriores. Sua classificacao depende de `is_segundo_curso`, e nao do tipo financeiro.

### 3. Trancamentos

Um RPC protegido retorna somente trancamentos atuais, no grao de matricula. O estado e as datas vem do estado operacional atual do Emusys. O motivo usa o estado atual e, quando ausente, a movimentacao administrativa mais recente da mesma matricula e unidade.

As faixas sao calculadas por meses-calendario a partir do inicio:

- ate `inicio + 1 mes`: contratual;
- acima de um e ate `inicio + 2 meses`: extensao gerencial;
- acima de dois meses: fora da politica;
- sem inicio: data ausente.

### 4. Produtor unico de texto

`relatorio-admin-whatsapp` permanece como produtor do relatorio automatico e passa a ser tambem o produtor do preview do botao. O modo `dry_run`:

- exige usuario autenticado;
- valida permissao administrativa na unidade;
- aceita a data de referencia selecionada;
- chama os mesmos RPCs e o mesmo formatador usados pelo cron;
- retorna o texto final sem enviar ou enfileirar.

O frontend deixa de montar localmente o relatorio diario e apenas exibe/copia o texto devolvido pelo produtor canonico.

### 5. Ingresso futuro

O webhook de matricula passa a persistir `emusys_student_id` nas novas linhas primarias e adicionais. Para matriculas adicionais, resolve tambem o tipo `SEGUNDO_CURSO` por codigo, sem ID fixo. O relatorio continua usando `is_segundo_curso` como verdade estrutural; o tipo permanece uma classificacao financeira.

Nao havera backfill nem reescrita remota de linhas historicas nesta mudanca. A leitura canonica resolve os IDs ja existentes a partir do estado atual/jornada.

## Seguranca

- O preview administrativo nao podera mais ser chamado anonimamente.
- A autorizacao sera validada por funcao `SECURITY DEFINER`, com escopo de unidade e permissao `administrativo.ver`.
- O RPC de detalhes de trancamento aplicara a mesma autorizacao.
- `public` e `anon` nao receberao permissao de execucao.

## Validacao

- Testes SQL/contrato para multicurso, homonimos e pessoa com curso ativo + curso trancado.
- Testes do formatador para dois, tres e quatro ou mais cursos e para todas as faixas de trancamento.
- Teste que prova que o botao chama o mesmo Edge produtor do cron.
- Verificacao de tipos, build, suites existentes e `git diff --check`.
- Consulta somente leitura apos aplicacao para conferir os invariantes por unidade.

