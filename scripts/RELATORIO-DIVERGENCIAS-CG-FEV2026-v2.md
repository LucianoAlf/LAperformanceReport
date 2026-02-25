================================================
           RELATORIO DE DIVERGENCIAS
           Campo Grande - Fev/2026
================================================

## RESUMO QUANTITATIVO

| Fonte              | Alunos Unicos | Total Registros |
|--------------------|---------------|-----------------|
| CRM (Excel)        |           479 |             479 |
| Supabase DB        |           508 |             575 |
| Faltantes no DB    |            11 |                 |
| Status errado DB   |            15 |                 |
| Faltantes no CRM   |            15 |                 |
| Dif. de Cursos     |           129 |                 |
| Duplicatas DB      |             6 |                 |
| Classif. Errada    |             2 |                 |
| 2o Curso Orfao     |             1 |                 |
| Curso NULL         |             4 |                 |

## ALUNOS ATIVOS NO CRM MAS COM STATUS ERRADO NO DB (precisam ser reativados)

  - Alice Viana de Carvalho | Status DB: aviso_previo | Cursos CRM: Piano / Teclado | Cursos DB: Piano | IDs: 18
  - Andressa Gabriele Louren├ºo Vasconcelos de Souza | Status DB: aviso_previo | Cursos CRM: Canto | Cursos DB: Canto | IDs: 28
  - Anne Krissya Cordeiro da Silva No├® | Status DB: evadido | Cursos CRM: Canto / Minha Banda Para Sempre / Piano / Teclado | Cursos DB: Canto / Minha Banda Para Sempre / Piano | IDs: 31, 1317, 1412
  - Camila Oliveira da Rocha | Status DB: evadido | Cursos CRM: Canto / Contrabaixo / Minha Banda Para Sempre | Cursos DB: Contrabaixo | IDs: 62
  - Ester Santos do Amaral | Status DB: trancado | Cursos CRM: Canto | Cursos DB: Canto | IDs: 112
  - Jasmim Fortunato Monteiro Bernardo | Status DB: trancado | Cursos CRM: Canto / Piano / Teclado | Cursos DB: Canto | IDs: 182
  - Jonatas Viana Carvalho | Status DB: trancado | Cursos CRM: Canto | Cursos DB: Canto | IDs: 198
  - Lara Carvalho Torres | Status DB: aviso_previo | Cursos CRM: Musicaliza├º├úo Infantil | Cursos DB: Musicaliza├º├úo Infantil | IDs: 218
  - Laura Costa Figueira | Status DB: evadido | Cursos CRM: Musicaliza├º├úo para Beb├¬s | Cursos DB: Musicaliza├º├úo para Beb├¬s | IDs: 222
  - Lucas Marinho da Silva | Status DB: evadido | Cursos CRM: Guitarra / Minha Banda Para Sempre | Cursos DB: Guitarra / Minha Banda Para Sempre | IDs: 248, 1427
  - Luiza Mazeliah do Nascimento | Status DB: evadido | Cursos CRM: Canto / Guitarra / Minha Banda Para Sempre | Cursos DB: Canto / Minha Banda Para Sempre | IDs: 263, 1420
  - Miguel Santos Borges | Status DB: evadido | Cursos CRM: Piano / SAX / Teclado | Cursos DB: Teclado | IDs: 323
  - Paulo Modesto Ferreira | Status DB: evadido | Cursos CRM: Bateria / Power Kids | Cursos DB: Bateria / Power Kids | IDs: 345, 1443
  - Renan de Souza Corr├¬a | Status DB: trancado | Cursos CRM: Bateria | Cursos DB: Bateria | IDs: 365
  - Samuel do Nascimento Alcantara Botelho | Status DB: aviso_previo | Cursos CRM: Guitarra | Cursos DB: Guitarra | IDs: 373

## ALUNOS NO CRM MAS INEXISTENTES NO DB (cadastrar do zero)

  - Ana J├║lia de Oliveira Gomes | Cursos: Bateria / Contrabaixo / Minha Banda Para Sempre
  - Anna Clara de Souza Iorio Sales Silva | Cursos: Piano / Teclado
  - Bruna Pereira Monteiro Carregosa Maciel | Cursos: Canto
  - Caroline Salvaterra C├ómara de Miranda | Cursos: Canto
  - ├ìtalo Roque Machado Castilho Corval | Cursos: Musicaliza├º├úo Infantil
  - Lucas Keyne Pereira Souza | Cursos: Piano / Teclado
  - Maite de Oliveira Gomes Simoes | Cursos: Musicaliza├º├úo Infantil
  - Marcos (Marquinhos) da Silva Saturnino | Cursos: Violino
  - Maria Eduarda Pery Braga da Natividade | Cursos: Canto
  - Pedro Henrique Celestino de Oliveira | Cursos: Bateria
  - Rayane Bianca dos Santos Stoianof Leite | Cursos: Canto

## ALUNOS NO DB MAS NAO NO CRM (possivel evasao nao registrada)

  - Ana Julia de Oliveira Gomes | Cursos DB: Minha Banda Para Sempre
  - Anna Clara de Souza Iorio Sales | Cursos DB: Teclado
  - Arthur Souza Del Bosco | Cursos DB: Bateria
  - Bruna Pereira Monteiro Carregosa | Cursos DB: Canto
  - Caroline Salvaterra Camara de Miranda | Cursos DB: Canto
  - Clara Pereira Domingos | Cursos DB: Canto / Power Kids
  - Italo Roque Machado Castilho Corval | Cursos DB: Musicaliza├º├úo Infantil
  - Lucas Keyne Pereira | Cursos DB: Teclado
  - Maite de Oliveira Gomes | Cursos DB: Musicaliza├º├úo Infantil
  - Marcela Formaggini | Cursos DB: Bateria
  - Marcela Oliveira da Trindade | Cursos DB: Teclado
  - Marcos da Silva Saturnino | Cursos DB: Violino
  - Maria Eduarda Pery Natividade | Cursos DB: Canto
  - Pedro Henrique Celestino | Cursos DB: Bateria
  - Rayane Bianca Stoianof Leite | Cursos DB: Viol├úo

## DIFERENCAS DE CURSOS (aluno existe em ambos mas qtd de cursos difere)

  - Adriana Christine da Silva
    CRM (2): Canto / Guitarra
    DB  (1): Guitarra
  - Adriana Mesquita dos Santos Vilas Boas
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Adriana Vitor Pim
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - ├ügatha Da Silva De Souza
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Ailla Goulart Caldeira
    CRM (4): Bateria / Canto / Piano / Teclado
    DB  (1): Bateria
  - Alan Samico do Nascimento
    CRM (2): Guitarra / Minha Banda Para Sempre
    DB  (1): Minha Banda Para Sempre
  - Alexandre Ayres Filho
    CRM (3): Piano / Power Kids / Teclado
    DB  (2): Power Kids / Teclado
  - Alice Castro Figueiredo
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Alice Marques Migone Maestri
    CRM (1): Guitarra
    DB  (0): 
  - Alice Sales da Cunha Mattos
    CRM (3): Bateria / Musicaliza├º├úo Infantil / Power Kids
    DB  (1): Bateria
  - Alice Serra de Souza Rangel Soares
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Alicia Castro Santiago Gonzaga
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Ana Mel Henrique da Silva
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Ana Victoria Padiglione Rosa
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Ant├┤nio Jos├® da Silva Delgado
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Arthur Gabriel de Lima Cardoso
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Aumir Barros Correia
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Aurora Paix├úo da Costa Buarque
    CRM (1): Musicaliza├º├úo para Beb├¬s
    DB  (0): 
  - Ben├¡cio Benjamim de Jesus Filgueiras
    CRM (3): Bateria / Musicaliza├º├úo para Beb├¬s / Power Kids
    DB  (2): Bateria / Power Kids
  - Benjamim Soares Vieira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Benjamin da Silva Barbosa
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Bruna Amaral de Carvalho
    CRM (1): Guitarra
    DB  (2): Canto / Guitarra
  - Cassyo L P Silva
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Cristiano Vianna
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Daniel Valeriano Motta
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Davi Borges da Silva Nascimento
    CRM (2): Guitarra / Power Kids
    DB  (1): Guitarra
  - Davi de Matos Lopes Carvalho
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Davi Guilherme De Souza Chaves Ribeiro
    CRM (5): Bateria / Canto / Harmonia / Piano / Teclado
    DB  (4): Bateria / Canto / Harmonia / Teclado
  - David Lucca Neves do Carmo
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Eduardo da Silva Barreto
    CRM (2): Canto / Minha Banda Para Sempre
    DB  (1): Canto
  - Emanuela de Paula da Silva
    CRM (3): Canto / Piano / Teclado
    DB  (1): Canto
  - Emanuele Lemos de Oliveira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Enzo Lopes Mauro
    CRM (3): Bateria / Piano / Teclado
    DB  (1): Bateria
  - Ester Soares Gomes Christianes
    CRM (5): Guitarra / Minha Banda Para Sempre / Piano / Power Kids / Teclado
    DB  (2): Guitarra / Minha Banda Para Sempre
  - Eurivaldo Cunha
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Felipe Marques Gevezier
    CRM (3): Bateria / Piano / Teclado
    DB  (2): Bateria / Teclado
  - Felipe Robalinho de Melo
    CRM (2): Canto / Guitarra
    DB  (1): Canto
  - Gabriel Gomes Chaves
    CRM (3): Piano / Power Kids / Teclado
    DB  (2): Power Kids / Teclado
  - Gabriel Mello Leal Rabelo de Oliveira
    CRM (3): Canto / Piano / Teclado
    DB  (2): Canto / Teclado
  - Gabriel Negreiros Carvalho
    CRM (3): Piano / Teclado / Viol├úo
    DB  (2): Teclado / Viol├úo
  - Gabriel Vencesllau da Hora Rosa
    CRM (1): Canto
    DB  (0): 
  - Gabriela Nascimento Brum
    CRM (5): Bateria / Canto / Guitarra / Minha Banda Para Sempre / Power Kids
    DB  (1): Bateria
  - Gael de Oliveira Ferreira
    CRM (2): Bateria / Musicaliza├º├úo para Beb├¬s
    DB  (1): Bateria
  - Gael Zine Nascimento Paes Leme
    CRM (2): Piano / Teclado
    DB  (1): Musicaliza├º├úo Infantil
  - Giane Apoliana Albino de Oliveira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Giovanna Branco rodrigues
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Giovanna Neves Coelho Guerra da Silva
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Guilherme Castro Figueiredo
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Guilherme de Oliveira Malafaia
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Guilherme Gama Clavelario Nunes
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Heitor Gomes Rocha
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Heitor Thadeu Caciano
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Heloisa Nogueira Delgado Constantino da Silva
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Hugo Sena da Cruz
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Isabela de Fatima Rocha Gomes
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Isabella Pereira Freitas de Almeida
    CRM (4): Canto / Minha Banda Para Sempre / Power Kids / Ukulel├¬
    DB  (1): Canto
  - Jean Lucas de Santana Dias Brum Ribeiro
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Jo├úo Pedro Fran├ºa Azevedo
    CRM (2): Guitarra / Viol├úo Ind
    DB  (1): Guitarra
  - Jo├úo Pedro Mesquita Vilas Boas
    CRM (3): Piano / Power Kids / Teclado
    DB  (0): 
  - Julia Pessoa Valadares Luz Pereira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Julia Silva de Freitas
    CRM (2): Canto / Power Kids
    DB  (1): Canto
  - Julia Xavier da Silva Souza Campelo
    CRM (2): Bateria / Power Kids
    DB  (1): Bateria
  - Karina Alexandra da Silva Fontes
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Laura Andrade da Silveira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Laura Bustamante Fran├ºa
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Laura Leal Mesquita
    CRM (3): Bateria / Canto / Viol├úo Ind
    DB  (1): Bateria
  - Laura Peres de Souza
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Laura Riggo Targueta Barboza
    CRM (3): Canto / Piano / Teclado
    DB  (1): Canto
  - Leamsi Guedes de Sant'Anna
    CRM (2): Bateria / Power Kids
    DB  (1): Power Kids
  - Leandro Vasconcelos dos Santos
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Leticia Fernandes Turques
    CRM (2): Bateria / Minha Banda Para Sempre
    DB  (1): Minha Banda Para Sempre
  - Lohana Leopoldo de Araujo
    CRM (4): Canto / Piano / Teclado / Viol├úo Ind
    DB  (1): Teclado
  - Lorran Alves de Lima
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Lucca Gabriel de Almeida Bispo
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Luisa Xavier Cesar
    CRM (2): Bateria / Canto
    DB  (1): Canto
  - Luiza Pimentel Oliveira Barbosa
    CRM (3): Canto / Piano / Teclado
    DB  (1): Teclado
  - Maicon Viana M├írio
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Manuela Louren├ºo Ribeiro
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Manuela Piveta Schulz
    CRM (4): Canto / Piano / Teclado / Violino
    DB  (1): Canto
  - Marcello Fernandes Junior
    CRM (5): Bateria / Contrabaixo / Minha Banda Para Sempre / Piano / Teclado
    DB  (3): Bateria / Contrabaixo / Teclado
  - Maria Eduarda de Lima Bomfim Pedro
    CRM (2): Canto / Minha Banda Para Sempre
    DB  (1): Minha Banda Para Sempre
  - Maria Eduarda Novo Novaes
    CRM (2): Home Studio / Viol├úo Ind
    DB  (1): Home Studio
  - Maria Eduarda Tonassi do Vale
    CRM (2): Bateria / Musicaliza├º├úo Infantil
    DB  (1): Bateria
  - Maria Fernanda Francisco Barros
    CRM (3): Piano / Teclado / Viol├úo Ind
    DB  (1): Viol├úo
  - Maria Flor de Carvalho Fernandes
    CRM (5): Bateria / Minha Banda Para Sempre / Piano / Power Kids / Teclado
    DB  (1): Bateria
  - Maria Flor Gomes Fazio
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Maria Lu├¡sa de Souza Ignacio
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Maria Luiza Gomes Nascimento
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Maria Luiza Nogueira Leal
    CRM (2): Canto / Power Kids
    DB  (1): Canto
  - Maria Miranda Pereira
    CRM (3): Piano / Power Kids / Teclado
    DB  (2): Power Kids / Teclado
  - Maria Rita Porfirio da Concei├º├úo
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Marina de Albuquerque Bulh├Áes Silva
    CRM (4): Canto / Piano / Power Kids / Teclado
    DB  (2): Canto / Power Kids
  - Mateus de Miranda Monteiro Balbino
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Mateus Santiago Tonassi do Vale
    CRM (2): Guitarra / Musicaliza├º├úo Infantil
    DB  (1): Guitarra
  - Melissa Gorni Dutra
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Miguel Bittencourt Costa
    CRM (4): Bateria / Canto / Harmonia / Power Kids
    DB  (3): Bateria / Harmonia / Power Kids
  - Miguel Gomes Biancamano
    CRM (3): Contrabaixo / Harmonia / Power Kids
    DB  (2): Contrabaixo / Harmonia
  - Miguel Lucas Moraes Silveira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Murilo Martellote de Assis
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Natalia Jorge Vieira
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Nilson Ribeiro do Couto
    CRM (2): Canto / Viol├úo Ind
    DB  (1): Canto
  - Olavo Pereira Wood
    CRM (2): Bateria / Musicaliza├º├úo para Beb├¬s
    DB  (1): Bateria
  - Olivia Rocha Venturi
    CRM (3): Musicaliza├º├úo Infantil / Musicaliza├º├úo para Beb├¬s / Ukulel├¬
    DB  (1): Ukulel├¬
  - Orion Dias de Oliveira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Pedro Aloisio Fausto de Souza
    CRM (3): Musicaliza├º├úo Infantil / Piano / Teclado
    DB  (1): Musicaliza├º├úo Infantil
  - Pedro Henrique Argeu Costa da Silva
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Pedro Lucas da Silva Brand├úo
    CRM (2): Guitarra / Minha Banda Para Sempre
    DB  (1): Minha Banda Para Sempre
  - Pedro Martellote de Assis
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Pedro Siqueira Guimar├úes
    CRM (2): Bateria / Power Kids
    DB  (1): Bateria
  - Pietro Bahia de Oliveira
    CRM (2): Bateria / Power Kids
    DB  (1): Bateria
  - Rebeca Val├®rio da Silva de Paulo
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Renato Vitorino Pandolpho
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Sara Racca Alves de Freitas Damasceno
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Sergio Tarsia de Almeida Junior
    CRM (3): Bateria / Piano / Teclado
    DB  (1): Bateria
  - Sofia Ellen Soares da Silva
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Sophia Reis Martins Garcia de Lima
    CRM (3): Guitarra / Piano / Teclado
    DB  (1): Guitarra
  - Th├®o D'Avila Gon├ºalves
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Tito de Oliveira Ferreira
    CRM (3): Musicaliza├º├úo Infantil / Piano / Teclado
    DB  (1): Teclado
  - Valentim Lima de Oliveira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Valentina Garcia da Silva
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Valentina Rodrigues dos Santos
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Vicente Dias Botelho
    CRM (5): Flauta Transversa / Harmonia / Piano / Power Kids / Teclado
    DB  (2): Power Kids / Teclado
  - Vin├¡cius de Andrade Teixeira
    CRM (2): Piano / Teclado
    DB  (1): Teclado
  - Vin├¡cius Lopa Mendes Rezende de Macedo
    CRM (5): Contrabaixo / Guitarra / Piano / Power Kids / Teclado
    DB  (2): Contrabaixo / Power Kids
  - Violeta de Freitas Germano Leal
    CRM (3): Musicaliza├º├úo Infantil / Piano / Teclado
    DB  (1): Teclado
  - Vitoria Vivia dos Santos Costa
    CRM (3): Bateria / Piano / Teclado
    DB  (2): Bateria / Piano
  - Wagner Amaral Mesquita Pereira
    CRM (2): Piano / Teclado
    DB  (1): Piano
  - Willer Arruda Machado
    CRM (3): Bateria / Piano / Teclado
    DB  (1): Bateria
  - William Souza Rosa
    CRM (2): Piano / Teclado
    DB  (1): Piano

## ANOMALIAS INTERNAS DO DB

### Duplicatas (mesmo aluno, mesmo curso, mesmo tipo):
  - Eduardo Fran├ºa Trist├úo Batista | Minha Banda Para Sempre | segundo=true | IDs: 1416, 1417
  - Ester Soares Gomes Christianes | Minha Banda Para Sempre | segundo=true | IDs: 1425, 1426
  - Guilherme  Lauria  Muniz | Minha Banda Para Sempre | segundo=true | IDs: 1418, 1419
  - Julia da Costa de Oliveira | Minha Banda Para Sempre | segundo=true | IDs: 1430, 1431
  - Pl├¡nio da Silva Bezerra Neto | Canto | segundo=false | IDs: 1052, 1361
  - Vin├¡cius Lopa Mendes Rezende de Macedo | Power Kids | segundo=true | IDs: 1433, 1434

### Classificacao errada (2+ primeiro_curso cursos diferentes para mesmo aluno):
  - Bruna Amaral de Carvalho: Guitarra (id:61) + Canto (id:1406)
  - Miguel Gomes Biancamano: Harmonia (id:320) + Contrabaixo (id:1064)

### Segundo curso orfao (sem primeiro_curso):
  - Clara Pereira Domingos | Cursos: Power Kids

### Alunos com curso_id NULL:
  - Alice Marques Migone Maestri (id: 985)
  - Aurora Paix├úo da Costa Buarque (id: 996)
  - Gabriel Vencesllau da Hora Rosa (id: 1405)
  - Jo├úo Pedro Mesquita Vilas Boas (id: 1065)

================================================
  FIM DO RELATORIO - Nenhuma alteracao foi feita
================================================
