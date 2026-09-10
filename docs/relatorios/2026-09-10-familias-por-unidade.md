> **RELATÓRIO SUBSTITUÍDO — NÃO UTILIZAR.** Esta versão contou ativos genéricos e não aplicou integralmente a regra de aluno pagante sem aviso prévio. O arquivo válido é `outputs/familias-pagantes-2026-09-10/familias-pagantes-sem-aviso-previo-2026-09-10.xlsx`.

# Levantamento de Famílias por Unidade

**Data da extração:** 2026-09-10
**Fonte:** tabela `alunos` (status = `ativo`), banco de produção — consulta SELECT-only.
**Base:** 987 pessoas com ao menos uma matrícula ativa (Barra 252 · Campo Grande 398 · Recreio 337).
Pessoa = nome + unidade (identidade canônica); quem faz 2 cursos conta 1 vez.
Fora da base: trancados, aviso prévio, evadidos e inativos.

## Resumo

| Unidade | Famílias | Pessoas em famílias | % dos ativos | 2 membros | 3 membros | 4 membros |
|---|---|---|---|---|---|---|
| Barra | 41 | 93 | 36,9% | 32 | 7 | 2 |
| Campo Grande | 30 | 63 | 15,8% | 27 | 3 | 0 |
| Recreio | 46 | 100 | 29,7% | 39 | 6 | 1 |
| **Total** | **117** | **256** | **25,9%** | **98** | **16** | **3** |

## Critério de parentesco (o que foi considerado "família")

Grupo de 2+ pessoas na mesma unidade ligadas por **qualquer um** destes sinais (a união dos três forma o grupo):

1. **Mesmo sobrenome composto completo** (ex.: "Brivio do Nascimento", "Cordeiro Sobrinho");
2. **Mesmo telefone de responsável** no cadastro (irmãos quase sempre compartilham);
3. **Pai/mãe também é aluno(a)** — o nome do responsável cadastrado é outro aluno ativo da mesma unidade.

Sobrenome comum de um token só (Silva, Oliveira, Costa...) **não** forma família sozinho — exige confirmação por telefone ou responsável, para não agrupar pessoas sem parentesco.

## Ressalvas

- **Campo Grande:** "Alice Medeiros da Silveira" e "Alice Medeiros Silveira" têm altíssima chance de ser a **mesma pessoa cadastrada duas vezes** (não uma família de 2). Se confirmado, CG passa a 29 famílias / 61 pessoas.
- Irmãos cadastrados com **sobrenomes diferentes** e sem responsável/telefone compartilhado não são detectados (limite do método).
- Telefone compartilhado identifica o **núcleo familiar (mesma casa)**, o que inclui casais e padrastos — em casos raros pode ligar não-parentes por erro de cadastro de telefone.
- Não foi feito GET na API do Emusys: o cadastro local (nome, responsável e telefone) foi suficiente para o cruzamento.

---

## Barra — 41 famílias (93 pessoas)

### 4 membros (2)
1. Ana Paula dos Santos Lima de Oliveira · Carlos Roberto de Oliveira · Renan Hozumi Barbieri · Roberta Alanna dos Santos Lima de Oliveira
2. Marcela Isolani Tavares · Denys Estanho · Davi Isolani Tavares Estanho Flavio · Manuela Isolani Tavares Estanho Flavio

### 3 membros (7)
3. Arthur Moreno Godinho · Bella Moreno Godinho · Pedro Henrique Moreno Godinho
4. Thais Ferreira · Athos Ferreira · Joao Ferreira
5. Bento Cordeiro Sobrinho · Lucas Cordeiro Sobrinho · Mirella Cordeiro Sobrinho
6. Carlos Vitor Pinheiro da Silva · Giulia Magno Nunes Lobo · Louise Fernandes Soares Amigo
7. Marcela Gianni Botelho Egas · Flor Gianni Botelho Egas Cocco Cordovil de Macedo · Mel Gianni Botelho Egas Cocco Cordovil de Macedo
8. Lucas Brivio do Nascimento · Maria Clara Brivio do Nascimento · Miguel Brivio do Nascimento
9. Marina Vasconcellos Tourinho Garcia · Pedro Vasconcellos Tourinho Garcia · Renato Santos Tourinho

### 2 membros (32)
10. Alexandre Herd Giglio · Mariana Herd Giglio
11. Alexandre Vasconcellos de Medeiros · Karina Melo Vasconcellos de Medeiros
12. Alice de Oliveira Mansur · Felipe de Oliveira Mansur
13. Anna Luisa Peres Alves · Mayle do Nascimento Peres
14. Antonio Dias Santos · Rafael da Silva Santos
15. Antonio Henrique Segall de Noronha · Julia Segal de Noronha
16. Benicio Rosa Rodrigues · Francisco de Assis Alves Rodrigues
17. Bento Lapa Cazarim · Tito Lapa Cazarim
18. Bernardo Leal de Meirelles Bolzani · Isabela Leal de Meirelles Bolzani
19. Bernardo Reis de Carvalho · Rogerio Nascimento de Carvalho
20. Billy Paulo Vangu Junior · Elena Vangu
21. Clarissa Menezes de Carvalho · Helena Menezes de Carvalho
22. Daniel Angelo de Assis Farias · Joao d'Angelo de Assis Farias
23. Eric Santa Cruz · Fatima Santa Cruz
24. Ethan Dias Lima · Rafael Dias de Lima
25. Eva do Espirito Santo Esteves · Flavia do Espirito Santo da Silva Telles
26. Gabriel Correa Pena · Isabela Correa Pena
27. Giovana Jorge Favacho Paiva · Helena Jorge Favacho Paiva
28. Giovanna Guerrero · Sergio Guerrera
29. Hugo Rocha da Costa · Vitor Rocha da Costa
30. Jeremias Ou Yuan Ma · Juliana Mei Jin Ma
31. Joao Vitor Souza da Costa · Miguel Souza da Costa
32. Joaquim Candido Querido Ferraz Soares · Thomas Amadeo Candido
33. Laura Santos da Silva Garret · Thiago Costa Carvalho Garret
34. Levi Marinho Ferreira de Lima · Lhays Marinho de Lima
35. Lucca Martinelli Torres · Theo Martinelli Torres
36. Luiza Fuoco Rocha · Maria Carolina Fuoco Poubel Rocha
37. Marcelo Santos Calvo · Natan Pereira Calvo Demidoff
38. Marcelo Ximenes Apoliano · Rafael Kelly Ximenes Apoliano
39. Maria Lucia Vicente Lopes · Raquel Vicente Lopes
40. Matheus Fernandes da Silva · Thiago Fernandes Rios
41. Nicolas Mendes de Morais · Nicolle Mendes de Morais

---

## Campo Grande — 30 famílias (63 pessoas)

### 3 membros (3)
1. Amanda Sales Borges dos Reis · Andrea Sales Borges dos Reis · Leonardo Borges Sales dos Reis
2. Davi Tomaz Silva · Henrique Tomaz Silva · Renato Borges da Silva
3. Maria Flor Silva da Conceicao · Maria Luisa Silva da Conceicao · Maria Rita Porfirio da Conceicao

### 2 membros (27)
4. Adriana Mesquita dos Santos Vilas Boas · Joao Pedro Mesquita Vilas Boas
5. Adriana Vitor Pim · Sofia Vitor Pim
6. Aila Beatriz da Silva Campos · Sofia Elaile da Silva Campos
7. Alice Castro Figueiredo · Guilherme Castro Figueiredo
8. Alice Medeiros da Silveira · Alice Medeiros Silveira ⚠️ (provável cadastro duplicado — ver ressalvas)
9. Alice Serra de Souza Rangel Soares · Isabela Serra de Souza Rangel Soares
10. Ana Clara Teixeira Nogueira · Gabriel Teixeira Nogueira
11. Ana Mel Henrique da Silva · Joao Lucas Henrique da Silva
12. Andre Vitor Soares da Silva · Sofia Ellen Soares da Silva
13. Arthur da Hora Marinho · Daniel da Hora Marinho
14. Bento Cabral do Nascimento · Julia Cabral do Nascimento
15. Bruno Correa Bastos · Mara Lucia Argento Tinoco Bastos
16. Caroline Lima · Phelipe Rocha
17. Davi Guilherme de Souza Chaves Ribeiro · Thuanny de Souza Chaves Ribeiro
18. Diogo Gomes Santos Caffonso de Moraes · Sabrina Maria Gomes Santos
19. Gabriel Lopes Muniz · Guilherme Lopes Muniz
20. Gael de Oliveira Ferreira · Tito de Oliveira Ferreira
21. Gustavo de Almeida Correa Peres · Luciene de Almeida Correa de Souza
22. Iris Brito de Souza · Teo Brito de Souza
23. Joanna Carolina Teixeira Sampaio dos Santos Souto · Miguel Teixeira Sampaio dos Santos Souto
24. Joao Gabriel Oliveira Narciso · Ryan Oliveira Narciso
25. Joao Paulo Costa do Carmo · Millene Chris Pimentel de Matos
26. Joao Victor Ramos Coelho · Pedro Victor Ramos Coelho
27. Laura Bustamante Franca · Miguel Bustamante Franca
28. Lidiane Maria Barbosa Lima Dias · Manuela Lima Dias
29. Maria Eduarda Tonassi do Vale · Mateus Santiago Tonassi do Vale
30. Pedro Aloisio Fausto de Souza · Sofia Fausto de Souza

---

## Recreio — 46 famílias (100 pessoas)

### 4 membros (1)
1. Arthur Quinteiro Artacho · Maria Eduarda Quinteiro Artacho · Noah Ciccarelli Artacho Pincelli · Luiz Henrique Ribeiro Gomes

### 3 membros (6)
2. Amanda Ozorio de Barros · Eline Holanda Cavalcanti Garcia de Barros · Miguel Holanda Cavalcanti Martins
3. Arthur Bezerra Siqueira · Daniel Bezerra Siqueira · Lucas Bezerra Siqueira
4. Beatriz Souto Machado · Rafael Souto Machado · Marcelo Dornellas Machado
5. Christiano Lopes Silva · Henrique Dang Silva · Lucia Lai Fon Dang Silva
6. Felipe de Moura Vieira · Manuela de Moura Vieira · Flavio Ricardo Leal Vieira
7. Grace Couto de Andrade · Miguel Couto de Andrade · Nicolas Couto de Andrade

### 2 membros (39)
8. Amaia Rodriguez Merces · Sergio Roberto Rodriguez
9. Amanda Aiko Gomes Togashi · Maite Gomes Pereira
10. Barbara Victoria Moreno Ruiz · Ricardo Alfonso Moreno Ruiz
11. Benjamin Felipe Roca Ribeiro · Daniel Felipe Reis Ribeiro
12. Benjamin Lehrer Braz · Estevao Lehrer Braz
13. Bento Serpa Benitez · Isabela Serpa Benitez
14. Bernardo Lioi Santos · Caio Lioi Santos
15. Betina Gerstel · Roberto Toledo el Alam
16. Bianca Petrolongo Pinto Abreu · Catarina Petrolongo Pinto Abreu
17. Carita Pessurno Rodrigues Torres · Luca Pessurno Rodrigues Torres
18. Catarina Westin · Maria Eduarda Westin Lara Camelo
19. Ciro Eugenio da Silva de Oliveira · Robson Alves de Oliveira Sobrinho
20. Clara de Moura Borges · Luciana Lima de Moura
21. Davi Piragine Silva · Joao Piragine Silva
22. Debora Rodriguez Barbosa · Guilherme Rodriguez Machado
23. Elena Picanco Santos · Laura Picanco Santos
24. Enzo Dorileo Ewald · Otto Dorileo Ewald
25. Enzo Teixeira Menezes de Lima · Noah Teixeira Menezes de Lima
26. Fernanda Faedrich Rodrigues · Rebeca Faedrich Rodrigues
27. Flavia Santiago de Oliveira · Isabella Guinody Santiago
28. Gabriel Quintella de Macedo Mayer · Joao Francisco Quintella de Macedo Mayer
29. Giovanna Marsico da Silva · Hugo Marsico da Silva
30. Guilherme de Farias Varjao · Nicolas de Farias Varjao
31. Heloisa de Andrade Leoncio · Henrique de Andrade Leoncio
32. Herika Parreiro Amancio Galiza · Maria Alice Amancio Galiza
33. Isabel Ohana Nunes de Carvalho · Silvia Ohana Marques Coelho de Carvalho
34. Isabela Ferreira Moura · Maria Luiza Ferreira Moura
35. Joao Pedro Brizzi de Almeida · Maria Helena Brizzi de Almeida
36. Joao Victor Francisco Gomes da Silva · Vicente Gomes da Silva
37. Julia Lopes de Medeiros · Matheus Lopes de Medeiros
38. Laura Damasceno Estevez · Maria Rita Damasceno Estevez
39. Levi Freire da Silva Sousa · Lucas Freire da Silva Sousa
40. Lucas Medeiros de Albuquerque · Luisa Medeiros de Albuquerque
41. Luisa da Silva Fraga · Miguel da Silva Fraga
42. Luiz Felipe de Freitas Oliveira · Sophia de Freitas Oliveira
43. Luiza Faria Frazao de Souza · Pedro Faria Frazao de Souza
44. Luiza Quintas de Oliveira Ramos Morais · Pedro Quintas de Oliveira Ramos Morais
45. Marcio Sant'Anna · Maria Luiza Cortes Sant'Anna
46. Sophie Medeiros Rodrigues · Thomas Medeiros Rodrigues

---

*Consulta executada em modo somente-leitura (SELECT) diretamente no Postgres de produção. Nenhuma API do Emusys foi necessária.*
