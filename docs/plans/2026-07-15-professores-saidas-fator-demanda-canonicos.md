# Plano de implementacao

1. Criar testes de contrato para RPC v3, saidas, fator, modal e reparo Erick.
2. Criar migration aditiva com helpers internos, RPC v3 e detalhe seguro.
3. Migrar o cliente de KPIs para a v3, preservando os campos antigos.
4. Trocar a coluna `Evasoes` por `Saidas` e explicitar o subconjunto de score.
5. Remover leitura direta de `vw_fator_demanda_professor`.
6. Migrar o modal para o detalhe canonico de saidas.
7. Rodar testes, build e verificacoes SQL antes de aplicar a migration remota.
8. Aplicar no projeto `ouqwbbermlzqqvtqwlul`, comparar contagens e validar a UI.
