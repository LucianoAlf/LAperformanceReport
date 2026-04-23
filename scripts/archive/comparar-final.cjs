const fs = require('fs');

// Ler CSV
const csv = fs.readFileSync('data/cg/matricula_cg.csv', 'utf-8');
const regex = /"([^"]+)","(\d{2}\/\d{2}\/\d{4})","([^"]+)","([^"]+)","(\d+)"/g;
const alunosCSV = {};
let m;
while ((m = regex.exec(csv)) !== null) {
  const nome = m[4].trim();
  const curso = m[3].trim();
  if (!alunosCSV[nome]) alunosCSV[nome] = [];
  alunosCSV[nome].push(curso);
}

// Base de dados - qtd de registros por aluno
const baseQtd = {
  "Anne Krissya Cordeiro da Silva Noé": 2,
  "Antônio Villa Barros": 2,
  "Carlos Eduardo Garcia do Nascimento": 2,
  "Daniela Beiriz Moura": 2,
  "Davi Guilherme De Souza Chaves Ribeiro": 4,
  "Felipe  Marques Gevezier": 2,
  "Gabriel Mello Leal Rabelo de Oliveira": 2,
  "Gabriel Negreiros Carvalho": 2,
  "Israel Gonçalves Monteiro": 3,
  "João Paulo Costa do Carmo": 2,
  "Kamilly Azevedo da Silva": 2,
  "Lis Dal Mora Mello": 2,
  "Marcello Fernandes Junior": 3,
  "Miguel Bittencourt Costa": 2,
  "Miguel Gomes Biancamano": 2,
  "Pedro Alves Pereira": 2,
  "Pedro Gabriel da França Rocha Pinto": 2,
  "Plínio da Silva Bezerra Neto": 2,
  "Teodora Queiroz Peixoto": 2,
  "Thallyson Victor silva de Aguiar": 2,
  "Thiago Sandes": 2,
  "Vitoria Vivia dos Santos Costa": 2,
  "Willer Arruda Machado": 2,
  "Yuri Gabriel dos Santos Rodrigues": 2
};

// Lista de nomes na base (471 únicos)
const baseNomes = [
  "Adriana Christine da Silva","Adriana Mesquita dos Santos Vilas Boas","Adriana Vitor Pim","Ágatha Da Silva De Souza","Águedha Silva Furtado","Ailla Goulart Caldeira","Alexandre Ayres Filho","Alexandre Ribeiro de Oliveira","Alexandre Wallace Bispo Oliveira","Alice Cardoso de Farias","Alice Castro Figueiredo","Alice dos Anjos Nogueira","Alice Marques Migone Maestri","Alice Rodrigues de Santana","Alice Roza Baltar","Alice Sales da Cunha Mattos","Alice Serra de Souza Rangel Soares","Alice Viana de Carvalho","Alicia Castro Santiago Gonzaga","Amanda de Souza Rogemonte","Amanda Sales Borges dos Reis","Ana Beatriz Da Conceição Pereira","Ana Clara Lima Santos Pinto","Ana Clara Teixeira Nogueira","Ana Mel Henrique da Silva","Ana Victoria Padiglione Rosa","Anderson Cherem de Mello","André Luiz Rodrigues Marques","André Vitor Soares da Silva","Andréa Sales Borges dos Reis","Andressa Dávila de Canha Pontes","Andressa Gabriele Lourenço Vasconcelos de Souza","Anna Clara Ferreira Brito","Anna Klara de Abreu Coutinho","Anne Krissya Cordeiro da Silva Noé","Anthony de Andrade Vasques","Antonia Scudio Guidi da Rocha","Antonia Simone Lima Alves","Antônio Carlos Romero Andrade","Antônio José da Silva Delgado","Antonio Thales da Silva Maria","Antônio Villa Barros","Arthur Da Hora Marinho","Arthur De Jesus Lindo Braga","Arthur Ennes Sarto Amorim","Arthur Felipe de Mattos","Arthur Gabriel de Lima Cardoso","Arthur Lee Cardozo Dias","Arthur Martins de Oliveira","Arthur Rocha de Almeida","Arthur Serpa Arcoverde","Arthur Souza Del Bosco","Aurora Paixão da Costa Buarque","Ayres Nishio Da Silva Junior","Barbara Ribeiro Alves","Beatriz Arruda de Azevedo","Beatriz Azevedo Teixeira Frossard","Beatriz Cardoso Schmitz","Beatriz Rodrigues de Sá","Beatriz Souza","Bella da Silva Lins","Benício Benjamim de Jesus Filgueiras","Benício de Souza Amaral Costa","Benjamim Soares Vieira","Benjamin da Silva Barbosa","Bento Cabral do Nascimento","Bernardo Ferreira Bittencourt","Bernardo Xavier Veras Mascarenhas de Castro","Brenda Pereira Dias","Bruna Amaral de Carvalho","Camila Oliveira da Rocha","Camille Bazet marinho","Carlos Eduardo Garcia do Nascimento","Carlos Mamede Tiburcio","Cássia Santos","Cassyo L P Silva","Catarina Marx Feitosa","Catia dos Santos Machado","Cauan Gabriel Couto Monteiro","Cecília Cavalcante de Aguiar","Clara da Costa Corval","Clarisse Maria Vignerom Lira","Claudia Alves da Fonseca","Claudio do Nascimento","Claudio Roberto da Silva Lopes Cabral","Conrado de Jesus dos Santos Silva","Cristiano Vianna","Crystian Henrique de Souza Lima Rinaldi","Daniel Da Hora Marinho","Daniel Oliveira dos Santos","Daniel Teixeira de Mello","Daniel Valeriano Motta","Daniel Victor Coutinho de Andrade Santos","Daniel Victor de Oliveira Malafaia","Daniela Beiriz Moura","Danilo Melo Pavão","Davi Borges da Silva Nascimento","Davi Branco Rodrigues","Davi de Matos Lopes Carvalho","Davi Gabriel de Souza Apolinário","Davi Guilherme De Souza Chaves Ribeiro","Davi Lucas de Souza Araújo de Andrade","Davi Lucas Gabry Losik","Davi Lucca de Carvalho Gomes","Davi Paulo Vieira","Davi Rosendo Chaves Vieira","Davi Tomaz Silva","David Lucca Neves do Carmo","Edio Gino da Silva Junior","Eduardo da Silva Barreto","Eduardo França Tristão Batista","Eduardo Knupp Gomes","Elisa Juliace Rodrigues","Elisa Knupp Gomes","Emanuel Davi Costa Marcelino","Emanuela de Paula da Silva","Emanuele Lemos de Oliveira","Emilly Souza de Oliveira","Emmanuel de Oliveira Carrari","Enzo Lopes Mauro","Erica Batista de Castro","Erika Brito de Sousa","Ester de Souza Rosa","Ester Santos do Amaral","Ester Soares Gomes Christianes","Eurivaldo Cunha","Evandro Andrade da Silva","Fabiana Mendonça Puime Paiva","Fábio Moreira de Carvalho","Fabrício Ravi Ramos Medeiros","Felipe  Marques Gevezier","Felipe Robalinho de Melo","Flávio Esteves Ferreira","Francis Araújo Linhares Lira de Melo","Francisco Carlos de Oliveira Sales","Francisco José Sgarbi Moreira Alves","Gabriel Abreu da Cruz Carvalho","Gabriel dos Santos Santana Cavalcanti","Gabriel Gomes Chaves","Gabriel Jeronimo Barbosa","Gabriel Lucas Silva Sales","Gabriel Mello Leal Rabelo de Oliveira","Gabriel Negreiros Carvalho","Gabriel Pereira Morais","Gabriel Teixeira Nogueira","Gabriel Walace lima de Souza","Gabriela da Silva Vieira","Gabriela Nascimento Brum","Gael de Oliveira Ferreira","Gael Zine Nascimento Paes Leme","Gean da Silva Souza","Georgie Jefferson de Mello Basílio da Silva","Geovanna Farias Rodrigues Alves","Giane Apoliana Albino de Oliveira","Giovana da Cruz Stancato","Giovana de Oliveira Salgueiro","Giovanna Branco rodrigues","Giovanna Neves Coelho Guerra da Silva","Giulia de Souza Pereira","Gohan Lucca Santos da Silva","Guilherme  Lauria  Muniz","Guilherme Castro Figueiredo","Guilherme de Oliveira Malafaia","Guilherme Dias da Silva","Guilherme Gama Clavelario Nunes","Guilherme Martins Santos","Guilherme Mendes Guidi Da Rocha","Gustavo Chagas Lima","Gustavo Concurd Santos","Gustavo de Almeida Correa Peres","Gustavo Wood Lisboa","Heitor Alves da Rocha","Heitor Cariuz Gino","Heitor de Freitas Delou","Heitor de Freitas Soares Amaral","Heitor Dias Berriel Abreu","Heitor Fernandes Teixeira de Farias","Heitor Gomes Rocha","Heitor Lima Coutinho Xavier","Heitor Pereira Ramos","Heitor Silva Braga","Heitor Thadeu Caciano","Heloisa Nogueira Delgado Constantino da Silva","Henrique Rangel Mascarenhas Moraes","Henrique Tomaz Silva","Hugo Leonardo Ramos Guimarães","Hugo Sena da Cruz","Íris Brito de Souza","Isaac Gomes Francisco Ribeiro","Isabela de Fatima Rocha Gomes","Isabela Paixão Figueiredo","Isabela Serra de Souza Rangel Soares","Isabella Christina Pereira dos Santos","Isabella Cruz Rustichelli","Isabella da Silva Batista","Isabella Pereira Freitas de Almeida","Isabelle da Costa Lima","Isaque dos Santos Lico","Israel Gonçalves Monteiro","Ivy Correia Arena Salvador da Silva","Jaqueline Rosendo da Silva","Jasmim Fortunato Monteiro Bernardo","Jean Lucas de Santana Dias Brum Ribeiro","Jean Marcel Silva da Costa Jacques","Jefte Wesley Vilar Custódio","Joanna Carolina Teixeira Sampaio dos Santos Souto","João Bernardes de Castro","João Gabriel Oliveira Narciso","João Lucas Henrique da Silva","João Machado Martins","João Miguel da Cunha Alves Ferreira","João Paulo Costa do Carmo","João Pedro França Azevedo","João Pedro Machado rosa","João Pedro Mesquita Vilas Boas","Joao Pedro Moreira de Oliva","João Victor Costa Barboza","João Vitor Da Silva De Oliveira","Joaquim do Espirito Santo Teixeira","Joaquim Isaac da Cunha Cal","Jonatas Viana Carvalho","Jonathan Carlos Souza Junior","Jonathan de Lima Santos","Jorge Leon Sant' Anna Siqueira Simas da Silva","José Carlos Nazário","José Demétrio de Oliveira Accioly Cordeiro","Juan Pablo Santiago Bonicenha","Julia Cabral do Nascimento","Julia da Costa de Oliveira","Júlia Lençone Plaza","Julia Pessoa Valadares Luz Pereira","Julia Silva de Freitas","Julia Xavier da Silva Souza Campelo","Juliana Carrati Fagundes","Juliana Fonseca Fortes","Júlio César da Silva Vidal","Jullya Victoria Gomes da Silva","Kamille Heringer de Moura Santos","Kamilly Azevedo da Silva","Karina Alexandra da Silva Fontes","Kauã Rocha Barreto","Kayque Vinicius Da Costa Mallet de Oliveira","Klaus Magno Viana Silva","Lara Carvalho Torres","Larissa Mendes Paiva","Laura Andrade da Silveira","Laura Bustamante França","Laura Costa Figueira","Laura de Aguiar Pombo","Laura Leal Mesquita","Laura Peres de Souza","Laura Riggo Targueta Barboza","Laura Turques Tavares","Lavínia Lyrio Ferreira","Lavynea dos Anjos Silva Guimarães","Leandro Vasconcelos dos Santos","Leona Patrícia da Cruz Martins","Leonardo Borges Sales dos Reis","Letícia Neves Coelho Guerra da Silva","Letícia Passos de Souza","Levi de Freitas Simões","Levi Jorge Leite Oliveira","Lidiane Maria Barbosa Lima Dias","Lilian de Souza","Lis Dal Mora Mello","Liz Azevedo Frossard","Lohana Leopoldo de Araujo","Lorena Barreto Campos Dias","Lorena Dos Santos Villas","Lorenzo Felipe Nicolau da Silva","Lorenzo Rodrigues Trovisco","Lorrane da Silva Azevedo","Luan Gomes de Faria","Luana Ferreira de Souza","Lucas Azevedo de Barros","Lucas Barreira dos Santos","Lucas dos Santos Basilio","Lucas Marinho da Silva","Lucas Reis Marques","Lucas Souza dos Santos","Lucca da Silva  Batista","Lucca Gabriel de Almeida Bispo","Luci Machado Viegas","Luciano Carvalho Christianes","Luciano da Silva Bernardino","Luciano Peres de Souza","Luciene de Almeida Correa de  Souza","Luis Lyan da Silveira Ribeiro Miranda","Luís Rafael Sousa dos Santos","Luisa Celano Laurentino Silva","Luísa Oliveira de Andrade Assunção","Luisa Xavier Cesar","Luiz Eduardo Passos Cunha","Luiz Eduardo Philippsen","Luiza Mazeliah do Nascimento","Luiza Pereira dos Santos","Luiza Pimentel Oliveira Barbosa","Maicon Viana Mário","Manuela Ariston Romao","Manuela Lima Dias","Manuela Lourenço Ribeiro","Manuela Piveta Schulz","Manuela Ribeiro de Carvalho","Marcela Formaggini","Marcela Medeiros Martins Monteiro","Marcela Oliveira da Trindade","Marcela Ribeiro dos Santos Formaggini","Marcele Alcoforado Santil dos Reis","Marcelino Jorge Batista","Marcello Fernandes Junior","Marcelo da Silva Galvão","Marcio Renato Santos da Silva","Marcio Vital de Sousa","Marco Aurelio Pacheco Duarte","Maria Alice Ferreira Suzano","Maria Antônia Santos","Maria Aurora Ferreira Costa Jordão da Silva dos Anjos","Maria Eduarda Costa da Fonseca","Maria Eduarda Novo Novaes","Maria Eduarda Souto de Lima","Maria Eduarda Tonassi do Vale","Maria Fernanda Frambach da Costa","Maria Fernanda Francisco Barros","Maria Flor de Carvalho Fernandes","Maria Flor Gomes Fazio","Maria Flor Silva Da Conceiçao","Maria Laura Kalile da Silva","Maria Luísa de Souza Ignacio","Maria Luisa Silva da Conceição","Maria Luísa Uebe do Nascimento","Maria Luiza dos Santos Figueiredo","Maria Luiza Gomes Nascimento","Maria Luiza Hilária Durão","Maria Luiza Nogueira Leal","Maria Luiza Soares Maia","Maria Miranda Pereira","Maria Rita Porfirio da Conceição","Mariana Guedes da Penha","Marina de Albuquerque Bulhões Silva","Mario Dias dos Santos","Maristela Abreu Gonçalves","Mateus de Miranda Monteiro Balbino","Mateus Santiago Tonassi do Vale","Matheus de Albuquerque de Sousa","Matheus Dias Tupper","Matheus Felipe Correia Ferreira dos Santos","Matheus Keyne Pereira Souza","Matheus Roatti Amaral","Maurício Adriano P de Souza","Mauro dos Santos de Carvalho","Mel Bastos Oliveira","Meline Guinâncio Printes","Melissa Gorni Dutra","Michele Oliveira Ramalho","Miguel Abreu Melo","Miguel Alves da Rocha","Miguel Bittencourt Costa","Miguel Bustamante França","Miguel Gomes Biancamano","Miguel Gonçalves da Silva","Miguel Lucas Moraes Silveira","Miguel Santos Borges","Miguel Silva Roca","Miguel Teixeira Sampaio dos Santos Souto","Millene Chris Pimentel de Matos","Murilo  Martellote de Assis","Murilo Oliveira da Hora Dantas","Natalia Jorge Vieira","Nathan William Dos Santos Onório","Neemias Francisco dos Santos","Nico Manuci Bastos Sena","Nicolas Faria dos Santos","Nicolas Silva do Bonfim","Nikolas Carolina Damasceno","Nilson Ribeiro do Couto","Olavo Pereira Wood","Olívia de Rezende Samico","Olivia Rocha Venturi","Olivia Ventura Martins","Orion Dias de Oliveira","Pablo Henrique Costa de Oliveira","Paloma Barreto Campos Dias","Patric Silva de Oliveira","Paulo Gabriel chelinho de Andrade","Paulo Leandro Costa felizardo","Paulo Modesto Ferreira","Pedro Alexandre Lopes Santiago Girardi","Pedro Aloisio Fausto de Souza","Pedro Alves Pereira","Pedro Arouca Lucas Marçal","Pedro de Oliveira Vargas","Pedro Faria de Oliveira","Pedro Gabriel da França Rocha Pinto","Pedro Gusmão Morgado","Pedro Henrique Argeu Costa da Silva","Pedro Martellote de Assis","Pedro Siqueira Guimarães","Pérola Reis da Cunha Silva Santos","Pietro Bahia de Oliveira","Plínio da Silva Bezerra Neto","Priscila Amaro da Silva","Raffael Pietro Coutinho Agostinho","Raul Fonseca Silva","Raul Luis Castro Costa Pereira","Raul Rodrigues Aguiar","Rebeca dos Santos Gregório Pinto","Rebeca Valério da Silva de Paulo","Renan de Souza Corrêa","Renato Vitorino Pandolpho","Rhajan Rodrigues Amorim","Ricardo Nunes Hacar","Robson Dias Pereira","Rodrigo Wanderley da Silva","Ronald Oliveira Rodrigues Fernandes","Ruan Luis de Oliveira Martellote","Ryan Fagundes Coimbra","Ryan Oliveira Narciso","Samuel do Nascimento Alcantara Botelho","Samuel Souza Coelho","Sandro Ribeiro da Silva","Sara Racca Alves de Freitas Damasceno","Sarah Mendes Gomes","Senair José da Silva Pinto","Sirley Jorge Martins Dantas","Sofia Alves Vedoi","Sofia Borges Aquino da Silva","Sofia Cardoso de Lima","Sofia Ellen Soares da Silva","Sofia Fausto de Souza","Sofia Vitor Pim","Sophia Alves","Sophia Maciel Magalhaes","Sophia Mallet Molnar Silveira Torres","Sophia Reis Martins Garcia de Lima","Soraia da Silveira Duarte","Talyta Modesto Ferreira","Tarcilio Araújo Brito","Téo Brito de Souza","Teodora Queiroz Peixoto","Thallyson Victor silva de Aguiar","Théo D'Avila Gonçalves","Théo de Souza Alves","Theo de Souza Pereira","Theo dos Santos Figueiredo","Thiago Sandes","Thuanny de Souza Chaves Ribeiro","Tito  de Oliveira Ferreira","Valdemir De Vargas Junior","Valentim Lima de Oliveira","Valentina Garcia da Silva","Valentina Rodrigues dos Santos","Valentina Santiago Santos Poubel de Araújo","Veronica Nascimento da Silva","Vicente Dias Botelho","Victor Caputo Cerillo Andrade","Vinícius Cantarino Vieira","Vinícius de Andrade Teixeira","Vinícius de Souza de Oliveira","Vinícius Lopa Mendes Rezende de Macedo","Violeta de Freitas Germano Leal","Vitoria Vivia dos Santos Costa","Wagner Amaral Mesquita Pereira","Wagner Siqueira de Almeida","Willer Arruda Machado","William Souza Rosa","Wylla Cristina Carvalho de Almeida","Yan Andrade Barreto","Yasmin P. Ignez Moraes","Yuri Gabriel dos Santos Rodrigues","Yuri Maia Gonçalves Dias","Zaion Ferraz Simões"
];

// Normalizar nome
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const baseNorm = new Set(baseNomes.map(norm));

// 1. Alunos faltantes na base
console.log('=== ALUNOS COMPLETAMENTE FALTANTES NA BASE ===\n');
const faltantes = [];
Object.keys(alunosCSV).forEach(nome => {
  if (!baseNorm.has(norm(nome))) {
    faltantes.push({ nome, cursos: alunosCSV[nome] });
  }
});
console.log('Total:', faltantes.length);
faltantes.forEach((a, i) => {
  console.log((i+1) + '. ' + a.nome);
  console.log('   Cursos: ' + a.cursos.join(', '));
});

// 2. Segundos cursos faltantes
console.log('\n\n=== SEGUNDOS/TERCEIROS CURSOS FALTANTES ===\n');
const segundosFaltantes = [];
Object.keys(alunosCSV).forEach(nome => {
  if (baseNorm.has(norm(nome))) {
    const qtdCSV = alunosCSV[nome].length;
    const qtdBase = baseQtd[nome] || 1;
    if (qtdCSV > qtdBase) {
      segundosFaltantes.push({
        nome,
        cursos: alunosCSV[nome],
        qtdCSV,
        qtdBase,
        faltam: qtdCSV - qtdBase
      });
    }
  }
});

console.log('Total de alunos com cursos faltantes:', segundosFaltantes.length);
let totalRegistrosFaltantes = 0;
segundosFaltantes.forEach((a, i) => {
  totalRegistrosFaltantes += a.faltam;
  console.log((i+1) + '. ' + a.nome);
  console.log('   CSV: ' + a.qtdCSV + ' cursos | Base: ' + a.qtdBase + ' registros | Faltam: ' + a.faltam);
  console.log('   Cursos no CSV: ' + a.cursos.join(', '));
});

console.log('\n\n=== RESUMO ===');
console.log('Alunos completamente faltantes:', faltantes.length);
console.log('Alunos com cursos extras faltantes:', segundosFaltantes.length);
console.log('Total de registros de segundo curso faltantes:', totalRegistrosFaltantes);
console.log('TOTAL de registros a inserir:', faltantes.length + totalRegistrosFaltantes);
