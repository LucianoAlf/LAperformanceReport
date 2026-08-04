# Projeto futuro — adoção do histórico canônico de migrations

Data da decisão: 2026-08-04
Estado: **adiado; fora da correção imediata das seis colisões**

## Motivo

O histórico completo é grande demais para uma substituição segura na janela atual:

- 1.260 migrations recuperadas do histórico remoto;
- 495 arquivos SQL no conjunto local atual;
- 834 registros remotos sem par local comprovado no manifesto;
- 109 arquivos locais canônicos não equivalentes textualmente;
- 14 arquivos locais canônicos sem evidência suficiente de equivalência.

O conjunto recuperado também contém uma credencial real do Quepasa. Portanto, não pode ser copiado ou commitado como está.

## Dependência obrigatória

A adoção integral só pode começar depois da decisão e rotação da credencial registrada em `2026-08-04-seguranca-token-quepasa.md`.

## Escopo futuro sugerido

1. neutralizar credenciais presentes no histórico recuperado sem falsificar o que foi executado;
2. revisar os 109 casos não equivalentes e os 14 sem evidência;
3. decidir como preservar comentários locais sem alterar o conjunto canônico usado pelo CLI;
4. montar ensaio descartável com o histórico candidato;
5. provar que `supabase db push --dry-run` não tenta reaplicar DDL já existente;
6. adotar o conjunto em mudança própria, revisável e reversível no Git.

## Regra operacional desde já

Migration versionada deve ser aplicada por `supabase db push`. Não usar `apply_migration` do MCP para migrations versionadas, pois o MCP registra a versão pelo horário real da execução e cria divergência entre o arquivo e o histórico remoto.

Não usar `migration repair`, não reaplicar DDL e não editar o histórico de produção sem plano e autorização específicos.
