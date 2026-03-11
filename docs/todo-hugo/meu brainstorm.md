# Perguntas:

- essa parte de detalhamento do funil nada mais nada menos que é a mesma tabela leads, certo? a diferença é que as etapas atualizam as informaçoes do lead.

acho que o que realmente importa é:

- caso o consultor esteja manalmente tentando inserir um lead que ainda nao existe na tabela de leads, ja marcando uma experimental (pode acontecer), atualmente o lead é criado ja com a etapa de aula experimental, certo? se o numero do lead ja existir, o sistema nao vai permitir o cadastro do lead, informando que ja existe um lead com este nome, isso é o correto. 

- Talvez o ideal seria primeiro exibir o modal de numero, onde o consultor coloca manualmente, o sistema vai procurar o lead correspondente, se houver, usuario clica no lead e começa a preencher o resto do formulario, acho que isso pode acontecer para o resto das etapas, caso possa ocorrer problemas, voce deve me informar.

- Caso realmente nao ocorra lead correspondente com o numero informado, e o usuario esteja tentando inserir um lead em uma etapa diferente de novos leads, o sistema deve avisa-lo antes que nao existe lead com esse telefone e que ira cria-lo.

# Alunos (JA EXECUTADO)

- Sera que faria sentido criar um calendario na parte de alunos>sucesso do cliente, criar mais uma tab alo para mostrar a presença deles? quando a api fizer o fetch, ela vai registrar a presença deles e marcaria no calendario. Teria um campo de busca por nome, onde poderiamos ver com detalhe o calendario de presença de cada aluno.

- Este endpoint do emusys de aulas registram faltas e presenças?

# Skills

- Voce conseguiria criar um esquema de skills self heal? da forma que eu for atualizando o sistema sobre as novas regras de negocio, voce automativamente e proativamente atualiza a skill?



# Como estou pensando em modificar o sistema de cadastro de leads.

**Objetivo:** Evitar a confusão do preenchimento manual, deixando mais direto e intuitivo o avanço de etapa.

**Importante:** Não faça commits e push ainda, apenas modifique.

- remover o modal nos cards, de experimental e etc, sendo possivel apenas cadastrar um novo leads.
- Dentro da tabela de detalhamento do funil, deve ter uma funcionalidade de mover etapa, ao mover etapa, deve ter as informaçoes necessárias que precisam(se houver) para ser preenchida. A ideia é que cada etapa seja um avanço mesmo, evitando o usuário de ter o retrabalho de digitar informaçoes, caso ele queira editar, ele pode editar no inline que tem nas tabelas.


configurar o webhook de leads do emusys para ir tambem para o nocodb, ele ainda nao esta indo, por isso tem essa disparidade entre o nocodb e o emusys.


- colocar os filtros globais que filtram todas as etapas do detalhamento do funil.

- Colocar nos logs de automacao de alunos quando o sistema nao encontra nenhum professor para vincular, dessa forma fica mais facil de saber o que aconteceu.