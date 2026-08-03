# Health Score V3 e grão da carteira — desenho aprovado

## Objetivo

Fazer a tela de professores declarar corretamente o grão dos dados e permitir que uma alteração de pesos da configuração vigente seja salva, simulada e aplicada pelo fluxo governado já existente.

## Decisões

1. O total exibido na aba Carteira é a soma de vínculos professor–aluno das carteiras canônicas. Ele não será apresentado como quantidade global de pessoas únicas.
2. As linhas de cada professor continuam mostrando alunos distintos dentro da carteira daquele professor.
3. Para a revisão do ciclo aberto Jun–Ago/2026, a interface usará as RPCs específicas de criação e ativação de revisão do ciclo aberto.
4. Para configurações fora desse ciclo, o fluxo versionado genérico permanece inalterado.
5. Salvar não altera a nota. Simular não altera a nota. Somente Aplicar configuração troca a versão ativa.
6. A ativação continua bloqueada quando houver snapshot oficial fechado, simulação desatualizada ou inconsistência de configuração.
7. Depois da aplicação, a configuração e os consumidores consultam novamente o servidor; nenhuma nota é recalculada no navegador.

## Critérios de aceite

- O cartão não chama a soma de carteiras de pessoas canônicas.
- A edição da configuração ativa de Jun–Ago cria uma revisão do mesmo ciclo sem conflito de vigência.
- A aplicação usa a ativação auditável de revisão do ciclo aberto.
- Os fluxos genéricos continuam disponíveis para outras vigências.
- Testes direcionados e build passam.
