# Emusys: identidade por CPF HMAC e faturas futuras

## Objetivo

Permitir que o Super Folha associe um CPF de pagador Pix a alunos do Emusys sem persistir ou exportar CPF em claro, e ampliar o espelho de faturas abertas para os tres meses seguintes ao mes corrente.

## Identidade por CPF

- O `GET /matriculas` continua sendo a fonte. Para cada matricula, o sync le `aluno.cpf` e `responsavel.cpf` apenas em memoria.
- O CPF e normalizado para onze digitos e enviado de forma transitoria a uma RPC restrita a `service_role`. A RPC le `emusys_cpf_hmac_key_v1` do Vault, calcula HMAC-SHA256 e grava somente o digest hexadecimal.
- A chave nunca fica em tabela, log, export ou codigo. O mesmo valor e instalado no Vault do LA Report e do Super Folha.
- O vinculo privado tem grao `unidade + matricula + papel`, em que `papel` e `aluno` ou `responsavel`. Ele tambem guarda os IDs locais/Emusys necessarios para reencontrar o aluno, sem guardar o documento.
- A sincronizacao substitui os papeis da matricula recebida. Assim, uma correcao ou remocao de CPF invalida o digest anterior.
- Uma funcao HTTP autenticada pelo segredo servidor-servidor ja usado pelo financeiro recebe um hash de 64 caracteres e devolve os vinculos encontrados: papel do CPF, aluno, responsavel, matricula e unidade. Ela nao devolve o hash, a chave nem CPF.

## Remocao do passivo e barreiras

- A migration deriva os HMACs dos snapshots existentes antes de remover as chaves de CPF, na mesma transacao.
- A limpeza e recursiva em `emusys_matriculas_estado_atual`, `emusys_api_payload`, `matriculas_emusys_decisoes_canonicas` e nos JSONs de logs que podem receber payload Emusys.
- O sync e o webhook removem campos de CPF antes de qualquer snapshot ou log.
- Triggers no banco repetem a limpeza nos pontos de entrada. Um chamador antigo, portanto, tambem nao consegue reintroduzir CPF em claro.
- Tabelas e RPCs de escrita/consulta do digest nao sao acessiveis a `anon` nem `authenticated`; a Edge de consulta usa `service_role` depois de validar o segredo compartilhado.

## Faturas futuras

- O backlog recorrente passa a incluir mes corrente, mes anterior e os proximos tres meses.
- O coletor continua usando o snapshot completo de `/faturas`; faturas abertas futuras ficam disponiveis e uma fatura paga antecipadamente nao desaparece por causa de um filtro parcial.
- A fila, o mutex, o rate limit, o formato de `emusys_faturas` e o export existente permanecem iguais.

## Aceite

- Nenhuma coluna JSON auditada contem chave de CPF em claro depois da migration.
- Todo digest persistido tem 64 caracteres hexadecimais e esta ligado a unidade e matricula.
- A consulta por um digest conhecido devolve os vinculos corretos sem CPF ou hash na resposta; hash invalido e rejeitado.
- `anon` e `authenticated` nao executam as RPCs privadas nem leem a tabela de vinculos.
- O backlog cria as competencias +1, +2 e +3 inclusive na virada do ano, e a fila conclui as tres unidades sem jobs em erro.

\n