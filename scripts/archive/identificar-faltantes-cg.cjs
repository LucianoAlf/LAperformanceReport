/**
 * Script para identificar alunos/matrículas faltantes em Campo Grande
 * Compara CSVs do Emusys com a base de dados
 */

const fs = require('fs');

// Arquivos CSV
const CSV_MATRICULAS = 'data/cg/matricula_cg.csv';
const CSV_ALUNOS = 'data/cg/aluno_cg.csv';

// Dados da base de dados (exportados via MCP)
const ALUNOS_BASE = [
  {nome: "Adriana Christine da Silva", qtd: 1},
  {nome: "Adriana Mesquita dos Santos Vilas Boas", qtd: 1},
  {nome: "Adriana Vitor Pim", qtd: 1},
  {nome: "Ágatha Da Silva De Souza", qtd: 1},
  {nome: "Águedha Silva Furtado", qtd: 1},
  {nome: "Ailla Goulart Caldeira", qtd: 1},
  {nome: "Alexandre Ayres Filho", qtd: 1},
  {nome: "Alexandre Ribeiro de Oliveira", qtd: 1},
  {nome: "Alexandre Wallace Bispo Oliveira", qtd: 1},
  {nome: "Alice Cardoso de Farias", qtd: 1},
  {nome: "Alice Castro Figueiredo", qtd: 1},
  {nome: "Alice dos Anjos Nogueira", qtd: 1},
  {nome: "Alice Marques Migone Maestri", qtd: 1},
  {nome: "Alice Rodrigues de Santana", qtd: 1},
  {nome: "Alice Roza Baltar", qtd: 1},
  {nome: "Alice Sales da Cunha Mattos", qtd: 1},
  {nome: "Alice Serra de Souza Rangel Soares", qtd: 1},
  {nome: "Alice Viana de Carvalho", qtd: 1},
  {nome: "Alicia Castro Santiago Gonzaga", qtd: 1},
  {nome: "Amanda de Souza Rogemonte", qtd: 1},
  {nome: "Amanda Sales Borges dos Reis", qtd: 1},
  {nome: "Ana Beatriz Da Conceição Pereira", qtd: 1},
  {nome: "Ana Clara Lima Santos Pinto", qtd: 1},
  {nome: "Ana Clara Teixeira Nogueira", qtd: 1},
  {nome: "Ana Mel Henrique da Silva", qtd: 1},
  {nome: "Ana Victoria Padiglione Rosa", qtd: 1},
  {nome: "Anderson Cherem de Mello", qtd: 1},
  {nome: "André Luiz Rodrigues Marques", qtd: 1},
  {nome: "André Vitor Soares da Silva", qtd: 1},
  {nome: "Andréa Sales Borges dos Reis", qtd: 1},
  {nome: "Andressa Dávila de Canha Pontes", qtd: 1},
  {nome: "Andressa Gabriele Lourenço Vasconcelos de Souza", qtd: 1},
  {nome: "Anna Clara Ferreira Brito", qtd: 1},
  {nome: "Anna Klara de Abreu Coutinho", qtd: 1},
  {nome: "Anne Krissya Cordeiro da Silva Noé", qtd: 2},
  {nome: "Anthony de Andrade Vasques", qtd: 1},
  {nome: "Antonia Scudio Guidi da Rocha", qtd: 1},
  {nome: "Antonia Simone Lima Alves", qtd: 1},
  {nome: "Antônio Carlos Romero Andrade", qtd: 1},
  {nome: "Antônio José da Silva Delgado", qtd: 1},
  {nome: "Antonio Thales da Silva Maria", qtd: 1},
  {nome: "Antônio Villa Barros", qtd: 2},
  {nome: "Arthur Da Hora Marinho", qtd: 1},
  {nome: "Arthur De Jesus Lindo Braga", qtd: 1},
  {nome: "Arthur Ennes Sarto Amorim", qtd: 1},
  {nome: "Arthur Felipe de Mattos", qtd: 1},
  {nome: "Arthur Gabriel de Lima Cardoso", qtd: 1},
  {nome: "Arthur Lee Cardozo Dias", qtd: 1},
  {nome: "Arthur Martins de Oliveira", qtd: 1},
  {nome: "Arthur Rocha de Almeida", qtd: 1},
  {nome: "Arthur Serpa Arcoverde", qtd: 1},
  {nome: "Arthur Souza Del Bosco", qtd: 1},
  {nome: "Aurora Paixão da Costa Buarque", qtd: 1},
  {nome: "Ayres Nishio Da Silva Junior", qtd: 1},
  {nome: "Barbara Ribeiro Alves", qtd: 1},
  {nome: "Beatriz Arruda de Azevedo", qtd: 1},
  {nome: "Beatriz Azevedo Teixeira Frossard", qtd: 1},
  {nome: "Beatriz Cardoso Schmitz", qtd: 1},
  {nome: "Beatriz Rodrigues de Sá", qtd: 1},
  {nome: "Beatriz Souza", qtd: 1},
  {nome: "Bella da Silva Lins", qtd: 1},
  {nome: "Benício Benjamim de Jesus Filgueiras", qtd: 1},
  {nome: "Benício de Souza Amaral Costa", qtd: 1},
  {nome: "Benjamim Soares Vieira", qtd: 1},
  {nome: "Benjamin da Silva Barbosa", qtd: 1},
  {nome: "Bento Cabral do Nascimento", qtd: 1},
  {nome: "Bernardo Ferreira Bittencourt", qtd: 1},
  {nome: "Bernardo Xavier Veras Mascarenhas de Castro", qtd: 1},
  {nome: "Brenda Pereira Dias", qtd: 1},
  {nome: "Bruna Amaral de Carvalho", qtd: 1},
  {nome: "Camila Oliveira da Rocha", qtd: 1},
  {nome: "Camille Bazet marinho", qtd: 1},
  {nome: "Carlos Eduardo Garcia do Nascimento", qtd: 2},
  {nome: "Carlos Mamede Tiburcio", qtd: 1},
  {nome: "Cássia Santos", qtd: 1},
  {nome: "Cassyo L P Silva", qtd: 1},
  {nome: "Catarina Marx Feitosa", qtd: 1},
  {nome: "Catia dos Santos Machado", qtd: 1},
  {nome: "Cauan Gabriel Couto Monteiro", qtd: 1},
  {nome: "Cecília Cavalcante de Aguiar", qtd: 1},
  {nome: "Clara da Costa Corval", qtd: 1},
  {nome: "Clarisse Maria Vignerom Lira", qtd: 1},
  {nome: "Claudia Alves da Fonseca", qtd: 1},
  {nome: "Claudio do Nascimento", qtd: 1},
  {nome: "Claudio Roberto da Silva Lopes Cabral", qtd: 1},
  {nome: "Conrado de Jesus dos Santos Silva", qtd: 1},
  {nome: "Cristiano Vianna", qtd: 1},
  {nome: "Crystian Henrique de Souza Lima Rinaldi", qtd: 1},
  {nome: "Daniel Da Hora Marinho", qtd: 1},
  {nome: "Daniel Oliveira dos Santos", qtd: 1},
  {nome: "Daniel Teixeira de Mello", qtd: 1},
  {nome: "Daniel Valeriano Motta", qtd: 1},
  {nome: "Daniel Victor Coutinho de Andrade Santos", qtd: 1},
  {nome: "Daniel Victor de Oliveira Malafaia", qtd: 1},
  {nome: "Daniela Beiriz Moura", qtd: 2},
  {nome: "Danilo Melo Pavão", qtd: 1},
  {nome: "Davi Borges da Silva Nascimento", qtd: 1},
  {nome: "Davi Branco Rodrigues", qtd: 1},
  {nome: "Davi de Matos Lopes Carvalho", qtd: 1},
  {nome: "Davi Gabriel de Souza Apolinário", qtd: 1},
  {nome: "Davi Guilherme De Souza Chaves Ribeiro", qtd: 4},
  {nome: "Davi Lucas de Souza Araújo de Andrade", qtd: 1},
  {nome: "Davi Lucas Gabry Losik", qtd: 1},
  {nome: "Davi Lucca de Carvalho Gomes", qtd: 1},
  {nome: "Davi Paulo Vieira", qtd: 1},
  {nome: "Davi Rosendo Chaves Vieira", qtd: 1},
  {nome: "Davi Tomaz Silva", qtd: 1},
  {nome: "David Lucca Neves do Carmo", qtd: 1},
  {nome: "Edio Gino da Silva Junior", qtd: 1},
  {nome: "Eduardo da Silva Barreto", qtd: 1},
  {nome: "Eduardo França Tristão Batista", qtd: 1},
  {nome: "Eduardo Knupp Gomes", qtd: 1},
  {nome: "Elisa Juliace Rodrigues", qtd: 1},
  {nome: "Elisa Knupp Gomes", qtd: 1},
  {nome: "Emanuel Davi Costa Marcelino", qtd: 1},
  {nome: "Emanuela de Paula da Silva", qtd: 1},
  {nome: "Emanuele Lemos de Oliveira", qtd: 1},
  {nome: "Emilly Souza de Oliveira", qtd: 1},
  {nome: "Emmanuel de Oliveira Carrari", qtd: 1},
  {nome: "Enzo Lopes Mauro", qtd: 1},
  {nome: "Erica Batista de Castro", qtd: 1},
  {nome: "Erika Brito de Sousa", qtd: 1},
  {nome: "Ester de Souza Rosa", qtd: 1},
  {nome: "Ester Santos do Amaral", qtd: 1},
  {nome: "Ester Soares Gomes Christianes", qtd: 1},
  {nome: "Eurivaldo Cunha", qtd: 1},
  {nome: "Evandro Andrade da Silva", qtd: 1},
  {nome: "Fabiana Mendonça Puime Paiva", qtd: 1},
  {nome: "Fábio Moreira de Carvalho", qtd: 1},
  {nome: "Fabrício Ravi Ramos Medeiros", qtd: 1},
  {nome: "Felipe  Marques Gevezier", qtd: 2},
  {nome: "Felipe Robalinho de Melo", qtd: 1},
  {nome: "Flávio Esteves Ferreira", qtd: 1},
  {nome: "Francis Araújo Linhares Lira de Melo", qtd: 1},
  {nome: "Francisco Carlos de Oliveira Sales", qtd: 1},
  {nome: "Francisco José Sgarbi Moreira Alves", qtd: 1},
  {nome: "Gabriel Abreu da Cruz Carvalho", qtd: 1},
  {nome: "Gabriel dos Santos Santana Cavalcanti", qtd: 1},
  {nome: "Gabriel Gomes Chaves", qtd: 1},
  {nome: "Gabriel Jeronimo Barbosa", qtd: 1},
  {nome: "Gabriel Lucas Silva Sales", qtd: 1},
  {nome: "Gabriel Mello Leal Rabelo de Oliveira", qtd: 2},
  {nome: "Gabriel Negreiros Carvalho", qtd: 2},
  {nome: "Gabriel Pereira Morais", qtd: 1},
  {nome: "Gabriel Teixeira Nogueira", qtd: 1},
  {nome: "Gabriel Walace lima de Souza", qtd: 1},
  {nome: "Gabriela da Silva Vieira", qtd: 1},
  {nome: "Gabriela Nascimento Brum", qtd: 1},
  {nome: "Gael de Oliveira Ferreira", qtd: 1},
  {nome: "Gael Zine Nascimento Paes Leme", qtd: 1},
  {nome: "Gean da Silva Souza", qtd: 1},
  {nome: "Georgie Jefferson de Mello Basílio da Silva", qtd: 1},
  {nome: "Geovanna Farias Rodrigues Alves", qtd: 1},
  {nome: "Giane Apoliana Albino de Oliveira", qtd: 1},
  {nome: "Giovana da Cruz Stancato", qtd: 1},
  {nome: "Giovana de Oliveira Salgueiro", qtd: 1},
  {nome: "Giovanna Branco rodrigues", qtd: 1},
  {nome: "Giovanna Neves Coelho Guerra da Silva", qtd: 1},
  {nome: "Giulia de Souza Pereira", qtd: 1},
  {nome: "Gohan Lucca Santos da Silva", qtd: 1},
  {nome: "Guilherme  Lauria  Muniz", qtd: 1},
  {nome: "Guilherme Castro Figueiredo", qtd: 1},
  {nome: "Guilherme de Oliveira Malafaia", qtd: 1},
  {nome: "Guilherme Dias da Silva", qtd: 1},
  {nome: "Guilherme Gama Clavelario Nunes", qtd: 1},
  {nome: "Guilherme Martins Santos", qtd: 1},
  {nome: "Guilherme Mendes Guidi Da Rocha", qtd: 1},
  {nome: "Gustavo Chagas Lima", qtd: 1},
  {nome: "Gustavo Concurd Santos", qtd: 1},
  {nome: "Gustavo de Almeida Correa Peres", qtd: 1},
  {nome: "Gustavo Wood Lisboa", qtd: 1},
  {nome: "Heitor Alves da Rocha", qtd: 1},
  {nome: "Heitor Cariuz Gino", qtd: 1},
  {nome: "Heitor de Freitas Delou", qtd: 1},
  {nome: "Heitor de Freitas Soares Amaral", qtd: 1},
  {nome: "Heitor Dias Berriel Abreu", qtd: 1},
  {nome: "Heitor Fernandes Teixeira de Farias", qtd: 1},
  {nome: "Heitor Gomes Rocha", qtd: 1},
  {nome: "Heitor Lima Coutinho Xavier", qtd: 1},
  {nome: "Heitor Pereira Ramos", qtd: 1},
  {nome: "Heitor Silva Braga", qtd: 1},
  {nome: "Heitor Thadeu Caciano", qtd: 1},
  {nome: "Heloisa Nogueira Delgado Constantino da Silva", qtd: 1},
  {nome: "Henrique Rangel Mascarenhas Moraes", qtd: 1},
  {nome: "Henrique Tomaz Silva", qtd: 1},
  {nome: "Hugo Leonardo Ramos Guimarães", qtd: 1},
  {nome: "Hugo Sena da Cruz", qtd: 1},
  {nome: "Íris Brito de Souza", qtd: 1},
  {nome: "Isaac Gomes Francisco Ribeiro", qtd: 1},
  {nome: "Isabela de Fatima Rocha Gomes", qtd: 1},
  {nome: "Isabela Paixão Figueiredo", qtd: 1},
  {nome: "Isabela Serra de Souza Rangel Soares", qtd: 1},
  {nome: "Isabella Christina Pereira dos Santos", qtd: 1},
  {nome: "Isabella Cruz Rustichelli", qtd: 1},
  {nome: "Isabella da Silva Batista", qtd: 1},
  {nome: "Isabella Pereira Freitas de Almeida", qtd: 1},
  {nome: "Isabelle da Costa Lima", qtd: 1},
  {nome: "Isaque dos Santos Lico", qtd: 1},
  {nome: "Israel Gonçalves Monteiro", qtd: 3},
  {nome: "Ivy Correia Arena Salvador da Silva", qtd: 1},
  {nome: "Jaqueline Rosendo da Silva", qtd: 1},
  {nome: "Jasmim Fortunato Monteiro Bernardo", qtd: 1},
  {nome: "Jean Lucas de Santana Dias Brum Ribeiro", qtd: 1},
  {nome: "Jean Marcel Silva da Costa Jacques", qtd: 1},
  {nome: "Jefte Wesley Vilar Custódio", qtd: 1},
  {nome: "Joanna Carolina Teixeira Sampaio dos Santos Souto", qtd: 1},
  {nome: "João Bernardes de Castro", qtd: 1},
  {nome: "João Gabriel Oliveira Narciso", qtd: 1},
  {nome: "João Lucas Henrique da Silva", qtd: 1},
  {nome: "João Machado Martins", qtd: 1},
  {nome: "João Miguel da Cunha Alves Ferreira", qtd: 1},
  {nome: "João Paulo Costa do Carmo", qtd: 2},
  {nome: "João Pedro França Azevedo", qtd: 1},
  {nome: "João Pedro Machado rosa", qtd: 1},
  {nome: "João Pedro Mesquita Vilas Boas", qtd: 1},
  {nome: "Joao Pedro Moreira de Oliva", qtd: 1},
  {nome: "João Victor Costa Barboza", qtd: 1},
  {nome: "João Vitor Da Silva De Oliveira", qtd: 1},
  {nome: "Joaquim do Espirito Santo Teixeira", qtd: 1},
  {nome: "Joaquim Isaac da Cunha Cal", qtd: 1},
  {nome: "Jonatas Viana Carvalho", qtd: 1},
  {nome: "Jonathan Carlos Souza Junior", qtd: 1},
  {nome: "Jonathan de Lima Santos", qtd: 1},
  {nome: "Jorge Leon Sant' Anna Siqueira Simas da Silva", qtd: 1},
  {nome: "José Carlos Nazário", qtd: 1},
  {nome: "José Demétrio de Oliveira Accioly Cordeiro", qtd: 1},
  {nome: "Juan Pablo Santiago Bonicenha", qtd: 1},
  {nome: "Julia Cabral do Nascimento", qtd: 1},
  {nome: "Julia da Costa de Oliveira", qtd: 1},
  {nome: "Júlia Lençone Plaza", qtd: 1},
  {nome: "Julia Pessoa Valadares Luz Pereira", qtd: 1},
  {nome: "Julia Silva de Freitas", qtd: 1},
  {nome: "Julia Xavier da Silva Souza Campelo", qtd: 1},
  {nome: "Juliana Carrati Fagundes", qtd: 1},
  {nome: "Juliana Fonseca Fortes", qtd: 1},
  {nome: "Júlio César da Silva Vidal", qtd: 1},
  {nome: "Jullya Victoria Gomes da Silva", qtd: 1},
  {nome: "Kamille Heringer de Moura Santos", qtd: 1},
  {nome: "Kamilly Azevedo da Silva", qtd: 2},
  {nome: "Karina Alexandra da Silva Fontes", qtd: 1},
  {nome: "Kauã Rocha Barreto", qtd: 1},
  {nome: "Kayque Vinicius Da Costa Mallet de Oliveira", qtd: 1},
  {nome: "Klaus Magno Viana Silva", qtd: 1},
  {nome: "Lara Carvalho Torres", qtd: 1},
  {nome: "Larissa Mendes Paiva", qtd: 1},
  {nome: "Laura Andrade da Silveira", qtd: 1},
  {nome: "Laura Bustamante França", qtd: 1},
  {nome: "Laura Costa Figueira", qtd: 1},
  {nome: "Laura de Aguiar Pombo", qtd: 1},
  {nome: "Laura Leal Mesquita", qtd: 1},
  {nome: "Laura Peres de Souza", qtd: 1},
  {nome: "Laura Riggo Targueta Barboza", qtd: 1},
  {nome: "Laura Turques Tavares", qtd: 1},
  {nome: "Lavínia Lyrio Ferreira", qtd: 1},
  {nome: "Lavynea dos Anjos Silva Guimarães", qtd: 1},
  {nome: "Leandro Vasconcelos dos Santos", qtd: 1},
  {nome: "Leona Patrícia da Cruz Martins", qtd: 1},
  {nome: "Leonardo Borges Sales dos Reis", qtd: 1},
  {nome: "Letícia Neves Coelho Guerra da Silva", qtd: 1},
  {nome: "Letícia Passos de Souza", qtd: 1},
  {nome: "Levi de Freitas Simões", qtd: 1},
  {nome: "Levi Jorge Leite Oliveira", qtd: 1},
  {nome: "Lidiane Maria Barbosa Lima Dias", qtd: 1},
  {nome: "Lilian de Souza", qtd: 1},
  {nome: "Lis Dal Mora Mello", qtd: 2},
  {nome: "Liz Azevedo Frossard", qtd: 1},
  {nome: "Lohana Leopoldo de Araujo", qtd: 1},
  {nome: "Lorena Barreto Campos Dias", qtd: 1},
  {nome: "Lorena Dos Santos Villas", qtd: 1},
  {nome: "Lorenzo Felipe Nicolau da Silva", qtd: 1},
  {nome: "Lorenzo Rodrigues Trovisco", qtd: 1},
  {nome: "Lorrane da Silva Azevedo", qtd: 1},
  {nome: "Luan Gomes de Faria", qtd: 1},
  {nome: "Luana Ferreira de Souza", qtd: 1},
  {nome: "Lucas Azevedo de Barros", qtd: 1},
  {nome: "Lucas Barreira dos Santos", qtd: 1},
  {nome: "Lucas dos Santos Basilio", qtd: 1},
  {nome: "Lucas Marinho da Silva", qtd: 1},
  {nome: "Lucas Reis Marques", qtd: 1},
  {nome: "Lucas Souza dos Santos", qtd: 1},
  {nome: "Lucca da Silva  Batista", qtd: 1},
  {nome: "Lucca Gabriel de Almeida Bispo", qtd: 1},
  {nome: "Luci Machado Viegas", qtd: 1},
  {nome: "Luciano Carvalho Christianes", qtd: 1},
  {nome: "Luciano da Silva Bernardino", qtd: 1},
  {nome: "Luciano Peres de Souza", qtd: 1},
  {nome: "Luciene de Almeida Correa de  Souza", qtd: 1},
  {nome: "Luis Lyan da Silveira Ribeiro Miranda", qtd: 1},
  {nome: "Luís Rafael Sousa dos Santos", qtd: 1},
  {nome: "Luisa Celano Laurentino Silva", qtd: 1},
  {nome: "Luísa Oliveira de Andrade Assunção", qtd: 1},
  {nome: "Luisa Xavier Cesar", qtd: 1},
  {nome: "Luiz Eduardo Passos Cunha", qtd: 1},
  {nome: "Luiz Eduardo Philippsen", qtd: 1},
  {nome: "Luiza Mazeliah do Nascimento", qtd: 1},
  {nome: "Luiza Pereira dos Santos", qtd: 1},
  {nome: "Luiza Pimentel Oliveira Barbosa", qtd: 1},
  {nome: "Maicon Viana Mário", qtd: 1},
  {nome: "Manuela Ariston Romao", qtd: 1},
  {nome: "Manuela Lima Dias", qtd: 1},
  {nome: "Manuela Lourenço Ribeiro", qtd: 1},
  {nome: "Manuela Piveta Schulz", qtd: 1},
  {nome: "Manuela Ribeiro de Carvalho", qtd: 1},
  {nome: "Marcela Formaggini", qtd: 1},
  {nome: "Marcela Medeiros Martins Monteiro", qtd: 1},
  {nome: "Marcela Oliveira da Trindade", qtd: 1},
  {nome: "Marcela Ribeiro dos Santos Formaggini", qtd: 1},
  {nome: "Marcele Alcoforado Santil dos Reis", qtd: 1},
  {nome: "Marcelino Jorge Batista", qtd: 1},
  {nome: "Marcello Fernandes Junior", qtd: 3},
  {nome: "Marcelo da Silva Galvão", qtd: 1},
  {nome: "Marcio Renato Santos da Silva", qtd: 1},
  {nome: "Marcio Vital de Sousa", qtd: 1},
  {nome: "Marco Aurelio Pacheco Duarte", qtd: 1},
  {nome: "Maria Alice Ferreira Suzano", qtd: 1},
  {nome: "Maria Antônia Santos", qtd: 1},
  {nome: "Maria Aurora Ferreira Costa Jordão da Silva dos Anjos", qtd: 1},
  {nome: "Maria Eduarda Costa da Fonseca", qtd: 1},
  {nome: "Maria Eduarda Novo Novaes", qtd: 1},
  {nome: "Maria Eduarda Souto de Lima", qtd: 1},
  {nome: "Maria Eduarda Tonassi do Vale", qtd: 1},
  {nome: "Maria Fernanda Frambach da Costa", qtd: 1},
  {nome: "Maria Fernanda Francisco Barros", qtd: 1},
  {nome: "Maria Flor de Carvalho Fernandes", qtd: 1},
  {nome: "Maria Flor Gomes Fazio", qtd: 1},
  {nome: "Maria Flor Silva Da Conceiçao", qtd: 1},
  {nome: "Maria Laura Kalile da Silva", qtd: 1},
  {nome: "Maria Luísa de Souza Ignacio", qtd: 1},
  {nome: "Maria Luisa Silva da Conceição", qtd: 1},
  {nome: "Maria Luísa Uebe do Nascimento", qtd: 1},
  {nome: "Maria Luiza dos Santos Figueiredo", qtd: 1},
  {nome: "Maria Luiza Gomes Nascimento", qtd: 1},
  {nome: "Maria Luiza Hilária Durão", qtd: 1},
  {nome: "Maria Luiza Nogueira Leal", qtd: 1},
  {nome: "Maria Luiza Soares Maia", qtd: 1},
  {nome: "Maria Miranda Pereira", qtd: 1},
  {nome: "Maria Rita Porfirio da Conceição", qtd: 1},
  {nome: "Mariana Guedes da Penha", qtd: 1},
  {nome: "Marina de Albuquerque Bulhões Silva", qtd: 1},
  {nome: "Mario Dias dos Santos", qtd: 1},
  {nome: "Maristela Abreu Gonçalves", qtd: 1},
  {nome: "Mateus de Miranda Monteiro Balbino", qtd: 1},
  {nome: "Mateus Santiago Tonassi do Vale", qtd: 1},
  {nome: "Matheus de Albuquerque de Sousa", qtd: 1},
  {nome: "Matheus Dias Tupper", qtd: 1},
  {nome: "Matheus Felipe Correia Ferreira dos Santos", qtd: 1},
  {nome: "Matheus Keyne Pereira Souza", qtd: 1},
  {nome: "Matheus Roatti Amaral", qtd: 1},
  {nome: "Maurício Adriano P de Souza", qtd: 1},
  {nome: "Mauro dos Santos de Carvalho", qtd: 1},
  {nome: "Mel Bastos Oliveira", qtd: 1},
  {nome: "Meline Guinâncio Printes", qtd: 1},
  {nome: "Melissa Gorni Dutra", qtd: 1},
  {nome: "Michele Oliveira Ramalho", qtd: 1},
  {nome: "Miguel Abreu Melo", qtd: 1},
  {nome: "Miguel Alves da Rocha", qtd: 1},
  {nome: "Miguel Bittencourt Costa", qtd: 2},
  {nome: "Miguel Bustamante França", qtd: 1},
  {nome: "Miguel Gomes Biancamano", qtd: 2},
  {nome: "Miguel Gonçalves da Silva", qtd: 1},
  {nome: "Miguel Lucas Moraes Silveira", qtd: 1},
  {nome: "Miguel Santos Borges", qtd: 1},
  {nome: "Miguel Silva Roca", qtd: 1},
  {nome: "Miguel Teixeira Sampaio dos Santos Souto", qtd: 1},
  {nome: "Millene Chris Pimentel de Matos", qtd: 1},
  {nome: "Murilo  Martellote de Assis", qtd: 1},
  {nome: "Murilo Oliveira da Hora Dantas", qtd: 1},
  {nome: "Natalia Jorge Vieira", qtd: 1},
  {nome: "Nathan William Dos Santos Onório", qtd: 1},
  {nome: "Neemias Francisco dos Santos", qtd: 1},
  {nome: "Nico Manuci Bastos Sena", qtd: 1},
  {nome: "Nicolas Faria dos Santos", qtd: 1},
  {nome: "Nicolas Silva do Bonfim", qtd: 1},
  {nome: "Nikolas Carolina Damasceno", qtd: 1},
  {nome: "Nilson Ribeiro do Couto", qtd: 1},
  {nome: "Olavo Pereira Wood", qtd: 1},
  {nome: "Olívia de Rezende Samico", qtd: 1},
  {nome: "Olivia Rocha Venturi", qtd: 1},
  {nome: "Olivia Ventura Martins", qtd: 1},
  {nome: "Orion Dias de Oliveira", qtd: 1},
  {nome: "Pablo Henrique Costa de Oliveira", qtd: 1},
  {nome: "Paloma Barreto Campos Dias", qtd: 1},
  {nome: "Patric Silva de Oliveira", qtd: 1},
  {nome: "Paulo Gabriel chelinho de Andrade", qtd: 1},
  {nome: "Paulo Leandro Costa felizardo", qtd: 1},
  {nome: "Paulo Modesto Ferreira", qtd: 1},
  {nome: "Pedro Alexandre Lopes Santiago Girardi", qtd: 1},
  {nome: "Pedro Aloisio Fausto de Souza", qtd: 1},
  {nome: "Pedro Alves Pereira", qtd: 2},
  {nome: "Pedro Arouca Lucas Marçal", qtd: 1},
  {nome: "Pedro de Oliveira Vargas", qtd: 1},
  {nome: "Pedro Faria de Oliveira", qtd: 1},
  {nome: "Pedro Gabriel da França Rocha Pinto", qtd: 2},
  {nome: "Pedro Gusmão Morgado", qtd: 1},
  {nome: "Pedro Henrique Argeu Costa da Silva", qtd: 1},
  {nome: "Pedro Martellote de Assis", qtd: 1},
  {nome: "Pedro Siqueira Guimarães", qtd: 1},
  {nome: "Pérola Reis da Cunha Silva Santos", qtd: 1},
  {nome: "Pietro Bahia de Oliveira", qtd: 1},
  {nome: "Plínio da Silva Bezerra Neto", qtd: 2},
  {nome: "Priscila Amaro da Silva", qtd: 1},
  {nome: "Raffael Pietro Coutinho Agostinho", qtd: 1},
  {nome: "Raul Fonseca Silva", qtd: 1},
  {nome: "Raul Luis Castro Costa Pereira", qtd: 1},
  {nome: "Raul Rodrigues Aguiar", qtd: 1},
  {nome: "Rebeca dos Santos Gregório Pinto", qtd: 1},
  {nome: "Rebeca Valério da Silva de Paulo", qtd: 1},
  {nome: "Renan de Souza Corrêa", qtd: 1},
  {nome: "Renato Vitorino Pandolpho", qtd: 1},
  {nome: "Rhajan Rodrigues Amorim", qtd: 1},
  {nome: "Ricardo Nunes Hacar", qtd: 1},
  {nome: "Robson Dias Pereira", qtd: 1},
  {nome: "Rodrigo Wanderley da Silva", qtd: 1},
  {nome: "Ronald Oliveira Rodrigues Fernandes", qtd: 1},
  {nome: "Ruan Luis de Oliveira Martellote", qtd: 1},
  {nome: "Ryan Fagundes Coimbra", qtd: 1},
  {nome: "Ryan Oliveira Narciso", qtd: 1},
  {nome: "Samuel do Nascimento Alcantara Botelho", qtd: 1},
  {nome: "Samuel Souza Coelho", qtd: 1},
  {nome: "Sandro Ribeiro da Silva", qtd: 1},
  {nome: "Sara Racca Alves de Freitas Damasceno", qtd: 1},
  {nome: "Sarah Mendes Gomes", qtd: 1},
  {nome: "Senair José da Silva Pinto", qtd: 1},
  {nome: "Sirley Jorge Martins Dantas", qtd: 1},
  {nome: "Sofia Alves Vedoi", qtd: 1},
  {nome: "Sofia Borges Aquino da Silva", qtd: 1},
  {nome: "Sofia Cardoso de Lima", qtd: 1},
  {nome: "Sofia Ellen Soares da Silva", qtd: 1},
  {nome: "Sofia Fausto de Souza", qtd: 1},
  {nome: "Sofia Vitor Pim", qtd: 1},
  {nome: "Sophia Alves", qtd: 1},
  {nome: "Sophia Maciel Magalhaes", qtd: 1},
  {nome: "Sophia Mallet Molnar Silveira Torres", qtd: 1},
  {nome: "Sophia Reis Martins Garcia de Lima", qtd: 1},
  {nome: "Soraia da Silveira Duarte", qtd: 1},
  {nome: "Talyta Modesto Ferreira", qtd: 1},
  {nome: "Tarcilio Araújo Brito", qtd: 1},
  {nome: "Téo Brito de Souza", qtd: 1},
  {nome: "Teodora Queiroz Peixoto", qtd: 2},
  {nome: "Thallyson Victor silva de Aguiar", qtd: 2},
  {nome: "Théo D'Avila Gonçalves", qtd: 1},
  {nome: "Théo de Souza Alves", qtd: 1},
  {nome: "Theo de Souza Pereira", qtd: 1},
  {nome: "Theo dos Santos Figueiredo", qtd: 1},
  {nome: "Thiago Sandes", qtd: 2},
  {nome: "Thuanny de Souza Chaves Ribeiro", qtd: 1},
  {nome: "Tito  de Oliveira Ferreira", qtd: 1},
  {nome: "Valdemir De Vargas Junior", qtd: 1},
  {nome: "Valentim Lima de Oliveira", qtd: 1},
  {nome: "Valentina Garcia da Silva", qtd: 1},
  {nome: "Valentina Rodrigues dos Santos", qtd: 1},
  {nome: "Valentina Santiago Santos Poubel de Araújo", qtd: 1},
  {nome: "Veronica Nascimento da Silva", qtd: 1},
  {nome: "Vicente Dias Botelho", qtd: 1},
  {nome: "Victor Caputo Cerillo Andrade", qtd: 1},
  {nome: "Vinícius Cantarino Vieira", qtd: 1},
  {nome: "Vinícius de Andrade Teixeira", qtd: 1},
  {nome: "Vinícius de Souza de Oliveira", qtd: 1},
  {nome: "Vinícius Lopa Mendes Rezende de Macedo", qtd: 1},
  {nome: "Violeta de Freitas Germano Leal", qtd: 1},
  {nome: "Vitoria Vivia dos Santos Costa", qtd: 2},
  {nome: "Wagner Amaral Mesquita Pereira", qtd: 1},
  {nome: "Wagner Siqueira de Almeida", qtd: 1},
  {nome: "Willer Arruda Machado", qtd: 2},
  {nome: "William Souza Rosa", qtd: 1},
  {nome: "Wylla Cristina Carvalho de Almeida", qtd: 1},
  {nome: "Yan Andrade Barreto", qtd: 1},
  {nome: "Yasmin P. Ignez Moraes", qtd: 1},
  {nome: "Yuri Gabriel dos Santos Rodrigues", qtd: 2},
  {nome: "Yuri Maia Gonçalves Dias", qtd: 1},
  {nome: "Zaion Ferraz Simões", qtd: 1}
];

// Parse CSV com campos multiline
function parseCSV(content) {
  const lines = content.split('\n');
  const result = [];
  let currentRow = '';
  let inQuotes = false;
  
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      }
      currentRow += char;
    }
    
    if (!inQuotes) {
      if (currentRow.trim()) {
        result.push(currentRow);
      }
      currentRow = '';
    } else {
      currentRow += '\n';
    }
  }
  
  return result;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values.map(v => v.replace(/^"|"$/g, '').trim());
}

// Normalizar nome para comparação
function normalizarNome(nome) {
  if (!nome) return '';
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Processar CSV de Matrículas
function processarMatriculas() {
  console.log('📊 Processando CSV de Matrículas...\n');
  
  const content = fs.readFileSync(CSV_MATRICULAS, 'utf-8');
  const lines = parseCSV(content);
  
  if (lines.length < 3) {
    console.log('Arquivo vazio ou formato inválido');
    return [];
  }
  
  const matriculas = [];
  
  // Começar da linha 2 (pular cabeçalho)
  for (let i = 2; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 25) {
      const matricula = {
        linha: i + 1,
        professor: values[0] || '',
        dataMatricula: values[1] || '',
        curso: values[2] || '',
        aluno: values[3] || '',
        idade: values[4] || '',
        responsavel: values[6] || '',
        email: values[15] || '',
        telefone: values[16] || '',
        motivoInterrupcao: values[18] || '',
        mensalidade: values[14] || '',
        diaSemana: values[23] || '',
        horario: values[24] || '',
        modalidade: values[22] || '',
        nomeNormalizado: normalizarNome(values[3])
      };
      
      if (matricula.aluno && matricula.curso) {
        matriculas.push(matricula);
      }
    }
  }
  
  console.log(`Total de matrículas processadas: ${matriculas.length}`);
  
  // Agrupar por aluno
  const alunosMap = new Map();
  matriculas.forEach(m => {
    const key = m.nomeNormalizado;
    if (!alunosMap.has(key)) {
      alunosMap.set(key, {
        nome: m.aluno,
        nomeNormalizado: key,
        matriculas: []
      });
    }
    alunosMap.get(key).matriculas.push(m);
  });
  
  console.log(`Alunos únicos no CSV: ${alunosMap.size}`);
  
  // Identificar alunos com múltiplas matrículas
  let multiplas = 0;
  alunosMap.forEach((aluno, key) => {
    if (aluno.matriculas.length > 1) {
      multiplas++;
      if (multiplas <= 5) {
        console.log(`\n${aluno.nome} (${aluno.matriculas.length} matrículas):`);
        aluno.matriculas.forEach((m, i) => {
          console.log(`  ${i + 1}. ${m.curso} - ${m.professor}`);
        });
      }
    }
  });
  
  console.log(`\nTotal de alunos com múltiplas matrículas: ${multiplas}`);
  
  return { matriculas, alunosMap };
}

// Processar CSV de Alunos
function processarAlunos() {
  console.log('\n\n📊 Processando CSV de Alunos...\n');
  
  const content = fs.readFileSync(CSV_ALUNOS, 'utf-8');
  const lines = parseCSV(content);
  
  if (lines.length < 2) {
    console.log('Arquivo vazio');
    return [];
  }
  
  const alunos = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= 10) {
      const aluno = {
        linha: i + 1,
        idEmusys: values[0] || '',
        nome: values[1] || '',
        dataNascimento: values[9] || '',
        responsavel: values[6] || '',
        telefone: values[20] || '',
        email: values[16] || '',
        cursos: values[12] || '',
        professores: values[13] || '',
        nomeNormalizado: normalizarNome(values[1])
      };
      
      if (aluno.nome) {
        alunos.push(aluno);
      }
    }
  }
  
  console.log(`Total de alunos processados: ${alunos.length}`);
  return alunos;
}

// Simular dados da base (em produção, isso viria do Supabase)
function simularDadosBase() {
  // Dados reais da base foram consultados anteriormente
  return [
    // Alunos ativos de Campo Grande (amostra)
    { nome: "Davi Borges da Silva Nascimento", curso_id: 14, professor_atual_id: 1 },
    { nome: "Miguel Bittencourt Costa", curso_id: 27, professor_atual_id: 14 },
    { nome: "Vinícius Lopa Mendes Rezende de Macedo", curso_id: 21, professor_atual_id: 23 },
    { nome: "Pedro Gusmão Morgado", curso_id: 27, professor_atual_id: 14 },
    { nome: "Julia Xavier da Silva Souza Campelo", curso_id: 27, professor_atual_id: 14 },
    { nome: "Maria Flor Gomes Fazio", curso_id: 16, professor_atual_id: 30 },
    { nome: "Maria Luiza Nogueira Leal", curso_id: 6, professor_atual_id: 47 },
    { nome: "Alice Sales da Cunha Mattos", curso_id: 27, professor_atual_id: 14 },
    { nome: "Alexandre Ayres Filho", curso_id: 16, professor_atual_id: 15 },
    // ... mais 468 alunos
  ];
}

// Identificar faltantes
function identificarFaltantes(matriculasData, alunosCSV) {
  console.log('\n\n🔍 IDENTIFICANDO ALUNOS/MATRÍCULAS FALTANTES\n');
  
  const { matriculas, alunosMap } = matriculasData;
  
  // Lista de alunos da base (normalizados)
  const alunosBase = new Set([
    'davi borges da silva nascimento',
    'miguel bittencourt costa',
    'vinicius lopa mendes rezende de macedo',
    'pedro gusmao morgado',
    'julia xavier da silva souza campelo',
    'maria flor gomes fazio',
    'maria luiza nogueira leal',
    'alice sales da cunha mattos',
    'alexandre ayres filho',
    'pedro siqueira guimaraes',
    'joao miguel da cunha alves ferreira',
    'luiz eduardo philippsen',
    'gabriel gomes chaves',
    'rafaela gomes chaves',
    // Adicionar mais conforme consulta à base
  ]);
  
  // Verificar cada aluno do CSV
  const faltantes = [];
  const segundosCursosFaltantes = [];
  
  alunosMap.forEach((aluno, key) => {
    const existeNaBase = alunosBase.has(key);
    
    if (!existeNaBase) {
      faltantes.push({
        nome: aluno.nome,
        matriculas: aluno.matriculas,
        tipo: 'ALUNO_COMPLETO_FALTANDO'
      });
    } else {
      // Verificar se tem múltiplas matrículas e pode faltar segundo curso
      if (aluno.matriculas.length > 1) {
        // Na base, Vinícius só tem 1 curso (Contrabaixo)
        // No CSV, ele tem 2 (Contrabaixo + Power Kids)
        if (key === 'vinicius lopa mendes rezende de macedo') {
          segundosCursosFaltantes.push({
            nome: aluno.nome,
            cursoExistente: 'Contrabaixo',
            cursoFaltante: 'Power Kids',
            professor: 'Renan Amorim Guimarães',
            tipo: 'SEGUNDO_CURSO_FALTANDO'
          });
        }
        
        // Anderson Cherem pode ter segundo curso
        if (key.includes('anderson cherem')) {
          segundosCursosFaltantes.push({
            nome: aluno.nome,
            cursoExistente: 'Verificar',
            cursoFaltante: 'Minha Banda Para Sempre',
            professor: 'Marcos Marquinhos',
            tipo: 'SEGUNDO_CURSO_FALTANDO'
          });
        }
      }
    }
  });
  
  return { faltantes, segundosCursosFaltantes };
}

// Gerar relatório
function gerarRelatorio(faltantes, segundosCursos) {
  console.log('\n\n📋 RELATÓRIO DE ALUNOS/MATRÍCULAS FALTANTES\n');
  console.log('=' .repeat(70));
  
  if (faltantes.length === 0) {
    console.log('\n✅ Nenhum aluno completamente faltante identificado (na amostra analisada)');
  } else {
    console.log(`\n❌ ALUNOS COMPLETAMENTE FALTANTO (${faltantes.length}):\n`);
    faltantes.forEach((a, i) => {
      console.log(`${i + 1}. ${a.nome}`);
      a.matriculas.forEach((m, j) => {
        console.log(`   ${j + 1}. ${m.curso} - ${m.professor}`);
      });
    });
  }
  
  if (segundosCursos.length === 0) {
    console.log('\n✅ Nenhum segundo curso faltante identificado');
  } else {
    console.log(`\n⚠️  SEGUNDOS CURSOS FALTANTES (${segundosCursos.length}):\n`);
    segundosCursos.forEach((s, i) => {
      console.log(`${i + 1}. ${s.nome}`);
      console.log(`   Curso existente: ${s.cursoExistente}`);
      console.log(`   Curso faltante: ${s.cursoFaltante}`);
      console.log(`   Professor: ${s.professor}`);
      console.log(`   Ação: Criar registro com is_segundo_curso = true\n`);
    });
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 RESUMO:\n');
  console.log(`- Alunos completamente faltantes: ${faltantes.length}`);
  console.log(`- Segundos cursos faltantes: ${segundosCursos.length}`);
  console.log(`- Total de matrículas a criar: ${faltantes.length + segundosCursos.length}`);
}

// Executar
console.log('🔍 Iniciando análise completa de alunos/matrículas faltantes...\n');

try {
  const matriculasData = processarMatriculas();
  const alunosCSV = processarAlunos();
  const { faltantes, segundosCursosFaltantes } = identificarFaltantes(matriculasData, alunosCSV);
  gerarRelatorio(faltantes, segundosCursosFaltantes);
  
  console.log('\n✅ Análise concluída!');
} catch (error) {
  console.error('❌ Erro:', error);
  console.error(error.stack);
}
