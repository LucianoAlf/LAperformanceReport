# UX das metas segmentadas do Health Score V3

## Objetivo

Tornar explícito o ciclo de edição das metas por unidade, curso e modalidade, sem alterar o contrato governado de rascunho, simulação e ativação.

## Decisões aprovadas

- Não haverá salvamento automático.
- A edição local mostrará imediatamente `Regra ausente`, `Pronta para salvar`, `Revisar valores`, `Salva no rascunho` ou `Não ofertado`.
- O preenchimento de qualquer meta inicia automaticamente a configuração da linha; o usuário não precisa escolher um estado antes.
- `Não ofertado nesta unidade` é a única exceção explícita ao preenchimento das três metas.
- O botão principal será `Salvar alterações`, acompanhado da quantidade de linhas alteradas.
- Depois do salvamento, a matriz será recarregada do servidor e a situação mudará para `Salva no rascunho`.
- A origem `Catálogo Emusys` será informação secundária, separada da situação da regra.
- A conciliação usará ações de negócio: `Confirmar vínculo`, `Corrigir modalidade`, `Desativar vínculo` e `Desfazer escolha`.

## Limites

- Nenhuma migration.
- Nenhuma alteração na identidade canônica de unidade, curso ou modalidade.
- Nenhuma ativação automática da configuração.
- Nenhum preenchimento inventado para metas ainda ausentes.

## Verificação

- Testes puros dos estados da linha.
- Testes de contrato do frontend.
- Build completo.
- Validação visual e comportamental no navegador.
