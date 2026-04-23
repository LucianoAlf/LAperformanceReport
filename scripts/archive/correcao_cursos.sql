-- ═══════════════════════════════════════════════════════════════
-- CORREÇÃO DE CURSOS - LA Music
-- Gerado em: 2026-02-14T01:07:35.220Z
-- Base: CSV original LA_MUSIC_ALUNOS_CONSOLIDADO.csv
-- Estratégia: todos os alunos → variante T (Turma)
-- Escopo: apenas alunos importados em 09/01/2026
-- ═══════════════════════════════════════════════════════════════

-- IMPORTANTE: Executar dentro de uma transação!
BEGIN;

  -- Adriana Christine da Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Adriana Christine da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Adriana Mesquita dos Santos Vilas Boas | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Adriana Mesquita dos Santos Vilas Boas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Adriana Vitor Pim | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Adriana Vitor Pim' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Ágatha Da Silva De Souza | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Ágatha Da Silva De Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Águedha Silva Furtado | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Águedha Silva Furtado' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Ailla Goulart Caldeira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Ailla Goulart Caldeira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Alexandre Ayres Filho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alexandre Ayres Filho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Alexandre Ribeiro de Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Alexandre Ribeiro de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Alexandre Wallace Bispo Oliveira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Alexandre Wallace Bispo Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Alice Cardoso de Farias | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Alice Cardoso de Farias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Alice Castro Figueiredo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alice Castro Figueiredo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Alice dos Anjos Nogueira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Alice dos Anjos Nogueira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Alice Rodrigues de Santana | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Alice Rodrigues de Santana' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Alice Sales da Cunha Mattos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Alice Sales da Cunha Mattos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Alice Serra de Souza Rangel Soares | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alice Serra de Souza Rangel Soares' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Alice Viana de Carvalho | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Alice Viana de Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Alicia Castro Santiago Gonzaga | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alicia Castro Santiago Gonzaga' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Ana Beatriz Da Conceição Pereira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Ana Beatriz Da Conceição Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ana Clara Lima Santos Pinto | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Ana Clara Lima Santos Pinto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ana Mel Henrique da Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Ana Mel Henrique da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Ana Victoria Padiglione Rosa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Ana Victoria Padiglione Rosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Anderson Cherem de Mello | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Anderson Cherem de Mello' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- André Luiz Rodrigues Marques | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'André Luiz Rodrigues Marques' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- André Vitor Soares da Silva | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'André Vitor Soares da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Andressa Dávila de Canha Pontes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Andressa Dávila de Canha Pontes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Andressa Gabriele Lourenço Vasconcelos de Souza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Andressa Gabriele Lourenço Vasconcelos de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Anna Clara Ferreira Brito | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Anna Clara Ferreira Brito' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Anna Klara de Abreu Coutinho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Anna Klara de Abreu Coutinho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Anne Krissya Cordeiro da Silva Noé | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Anne Krissya Cordeiro da Silva Noé' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Anthony de Andrade Vasques | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Anthony de Andrade Vasques' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Antonia Scudio Guidi da Rocha | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Antonia Scudio Guidi da Rocha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Antonia Simone Lima Alves | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Antonia Simone Lima Alves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Antônio Carlos Romero Andrade | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Antônio Carlos Romero Andrade' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Antônio José da Silva Delgado | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Antônio José da Silva Delgado' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Antonio Thales da Silva Maria | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Antonio Thales da Silva Maria' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Antônio Villa Barros | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Antônio Villa Barros' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Arthur Da Hora Marinho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Da Hora Marinho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur De Jesus Lindo Braga | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Arthur De Jesus Lindo Braga' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Arthur Ennes Sarto Amorim | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Arthur Ennes Sarto Amorim' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Arthur Felipe de Mattos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Felipe de Mattos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Gabriel de Lima Cardoso | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Arthur Gabriel de Lima Cardoso' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Arthur Lee Cardozo Dias | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Arthur Lee Cardozo Dias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Arthur Rocha de Almeida | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Rocha de Almeida' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Serpa Arcoverde | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Serpa Arcoverde' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Souza Del Bosco | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Souza Del Bosco' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Ayres Nishio Da Silva Junior | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Ayres Nishio Da Silva Junior' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Barbara Ribeiro Alves | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Barbara Ribeiro Alves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Beatriz Arruda de Azevedo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Beatriz Arruda de Azevedo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Beatriz Azevedo Teixeira Frossard | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Beatriz Azevedo Teixeira Frossard' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Beatriz Cardoso Schmitz | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Beatriz Cardoso Schmitz' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Beatriz Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Beatriz Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Benício Benjamim de Jesus Filgueiras | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Benício Benjamim de Jesus Filgueiras' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Benício de Souza Amaral Costa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Benício de Souza Amaral Costa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Benjamim Soares Vieira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Benjamim Soares Vieira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Benjamin da Silva Barbosa | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Benjamin da Silva Barbosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Bento Cabral do Nascimento | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bento Cabral do Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bernardo Ferreira Bittencourt | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bernardo Ferreira Bittencourt' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bernardo Xavier Veras Mascarenhas de Castro | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bernardo Xavier Veras Mascarenhas de Castro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bruna Amaral de Carvalho | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Bruna Amaral de Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Camila Oliveira da Rocha | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Camila Oliveira da Rocha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Carlos Eduardo Garcia do Nascimento | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Carlos Eduardo Garcia do Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Carlos Mamede Tiburcio | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Carlos Mamede Tiburcio' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Catarina Marx Feitosa | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Catarina Marx Feitosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Catia dos Santos Machado | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Catia dos Santos Machado' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Cecília Cavalcante de Aguiar | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Cecília Cavalcante de Aguiar' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Clara da Costa Corval | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Clara da Costa Corval' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Clara Pereira Domingos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Clara Pereira Domingos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Clarisse Maria Vignerom Lira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Clarisse Maria Vignerom Lira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Claudia Alves da Fonseca | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Claudia Alves da Fonseca' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Claudio do Nascimento | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Claudio do Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Claudio Roberto da Silva Lopes Cabral | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Claudio Roberto da Silva Lopes Cabral' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Conrado de Jesus dos Santos Silva | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Conrado de Jesus dos Santos Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Cristiano Vianna | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Cristiano Vianna' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Crystian Henrique de Souza Lima Rinaldi | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Crystian Henrique de Souza Lima Rinaldi' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Daniel Da Hora Marinho | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Daniel Da Hora Marinho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Daniel Oliveira dos Santos | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Daniel Oliveira dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Daniel Teixeira de Mello | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Daniel Teixeira de Mello' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Daniel Valeriano Motta | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Daniel Valeriano Motta' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Daniel Victor Coutinho de Andrade Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Victor Coutinho de Andrade Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel Victor de Oliveira Malafaia | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Victor de Oliveira Malafaia' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniela Beiriz Moura | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniela Beiriz Moura' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Danilo Melo Pavão | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Danilo Melo Pavão' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Borges da Silva Nascimento | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Davi Borges da Silva Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Davi Branco Rodrigues | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Branco Rodrigues' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi de Matos Lopes Carvalho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Davi de Matos Lopes Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Davi Gabriel de Souza Apolinário | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Gabriel de Souza Apolinário' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Guilherme De Souza Chaves Ribeiro | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Guilherme De Souza Chaves Ribeiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Lucas de Souza Araújo de Andrade | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Davi Lucas de Souza Araújo de Andrade' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Davi Lucas Gabry Losik | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Lucas Gabry Losik' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Lucca de Carvalho Gomes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Lucca de Carvalho Gomes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Paulo Vieira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Davi Paulo Vieira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Davi Rosendo Chaves Vieira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Davi Rosendo Chaves Vieira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Davi Tomaz Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Tomaz Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- David Lucca Neves do Carmo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'David Lucca Neves do Carmo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Edio Gino da Silva Junior | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Edio Gino da Silva Junior' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Eduardo da Silva Barreto | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Eduardo da Silva Barreto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Eduardo França Tristão Batista | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Eduardo França Tristão Batista' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Eduardo Knupp Gomes | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Eduardo Knupp Gomes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Elisa Juliace Rodrigues | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Elisa Juliace Rodrigues' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Elisa Knupp Gomes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Elisa Knupp Gomes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Emanuel Davi Costa Marcelino | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Emanuel Davi Costa Marcelino' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Emanuela de Paula da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Emanuela de Paula da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Emanuele Lemos de Oliveira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Emanuele Lemos de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Emilly Souza de Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Emilly Souza de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Emmanuel de Oliveira Carrari | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Emmanuel de Oliveira Carrari' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Enzo Lopes Mauro | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Enzo Lopes Mauro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Erica Batista de Castro | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Erica Batista de Castro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Erika Brito de Sousa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Erika Brito de Sousa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ester de Souza Rosa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Ester de Souza Rosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ester Santos do Amaral | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Ester Santos do Amaral' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ester Soares Gomes Christianes | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Ester Soares Gomes Christianes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Evandro Andrade da Silva | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Evandro Andrade da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Fabiana Mendonça Puime Paiva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Fabiana Mendonça Puime Paiva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Fábio Moreira de Carvalho | CSV: Flauta Transversal | Correto: Flauta Transversa (37)
  UPDATE alunos SET curso_id = 37
  WHERE nome = 'Fábio Moreira de Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 37;

  -- Fabrício Ravi Ramos Medeiros | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Fabrício Ravi Ramos Medeiros' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Felipe  Marques Gevezier | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Felipe  Marques Gevezier' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Felipe Robalinho de Melo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Felipe Robalinho de Melo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Flávio Esteves Ferreira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Flávio Esteves Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Francis Araújo Linhares Lira de Melo | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Francis Araújo Linhares Lira de Melo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Francisco Carlos de Oliveira Sales | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Francisco Carlos de Oliveira Sales' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Francisco José Sgarbi Moreira Alves | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Francisco José Sgarbi Moreira Alves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gabriel Abreu da Cruz Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Gabriel Abreu da Cruz Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Gabriel dos Santos Santana Cavalcanti | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Gabriel dos Santos Santana Cavalcanti' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Gabriel Gomes Chaves | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriel Gomes Chaves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gabriel Jeronimo Barbosa | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Gabriel Jeronimo Barbosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gabriel Lucas Silva Sales | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Gabriel Lucas Silva Sales' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gabriel Mello Leal Rabelo de Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Gabriel Mello Leal Rabelo de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Gabriel Negreiros Carvalho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriel Negreiros Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gabriel Pereira Morais | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gabriel Pereira Morais' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gabriel Walace lima de Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gabriel Walace lima de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gabriela da Silva Vieira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Gabriela da Silva Vieira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Gabriela Nascimento Brum | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gabriela Nascimento Brum' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gael de Oliveira Ferreira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gael de Oliveira Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gael Zine Nascimento Paes Leme | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Gael Zine Nascimento Paes Leme' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Georgie Jefferson de Mello Basílio da Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Georgie Jefferson de Mello Basílio da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Geovanna Farias Rodrigues Alves | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Geovanna Farias Rodrigues Alves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Giovana da Cruz Stancato | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Giovana da Cruz Stancato' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Giovana de Oliveira Salgueiro | CSV: Ukulele | Correto: Ukulelê T (8)
  UPDATE alunos SET curso_id = 8
  WHERE nome = 'Giovana de Oliveira Salgueiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 8;

  -- Giovanna Branco rodrigues | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Giovanna Branco rodrigues' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Giovanna Neves Coelho Guerra da Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Giovanna Neves Coelho Guerra da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Giulia de Souza Pereira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Giulia de Souza Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gohan Lucca Santos da Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gohan Lucca Santos da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Guilherme  Lauria  Muniz | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Guilherme  Lauria  Muniz' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Guilherme Castro Figueiredo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Guilherme Castro Figueiredo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Guilherme de Oliveira Malafaia | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Guilherme de Oliveira Malafaia' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Guilherme Dias da Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Guilherme Dias da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Guilherme Gama Clavelario Nunes | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Guilherme Gama Clavelario Nunes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Guilherme Martins Santos | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Guilherme Martins Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Guilherme Mendes Guidi Da Rocha | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Guilherme Mendes Guidi Da Rocha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gustavo Chagas Lima | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Gustavo Chagas Lima' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gustavo Concurd Santos | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Gustavo Concurd Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gustavo de Almeida Correa Peres | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Gustavo de Almeida Correa Peres' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Gustavo Wood Lisboa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gustavo Wood Lisboa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor Alves da Rocha | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Heitor Alves da Rocha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Heitor Cariuz Gino | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Heitor Cariuz Gino' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor de Freitas Delou | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Heitor de Freitas Delou' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Heitor de Freitas Soares Amaral | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Heitor de Freitas Soares Amaral' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Heitor Dias Berriel Abreu | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Heitor Dias Berriel Abreu' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor Fernandes Teixeira de Farias | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Heitor Fernandes Teixeira de Farias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Heitor Gomes Rocha | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Heitor Gomes Rocha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Heitor Pereira Ramos | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Heitor Pereira Ramos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Heitor Silva Braga | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Heitor Silva Braga' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor Thadeu Caciano | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Heitor Thadeu Caciano' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Heloisa Nogueira Delgado Constantino da Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Heloisa Nogueira Delgado Constantino da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Henrique Tomaz Silva | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Henrique Tomaz Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Hugo Leonardo Ramos Guimarães | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Hugo Leonardo Ramos Guimarães' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Hugo Sena da Cruz | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Hugo Sena da Cruz' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Íris Brito de Souza | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Íris Brito de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Isaac Gomes Francisco Ribeiro | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Isaac Gomes Francisco Ribeiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Isabela de Fatima Rocha Gomes | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Isabela de Fatima Rocha Gomes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Isabela Paixão Figueiredo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabela Paixão Figueiredo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabela Serra de Souza Rangel Soares | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Isabela Serra de Souza Rangel Soares' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Isabella Christina Pereira dos Santos | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Isabella Christina Pereira dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Isabella Cruz Rustichelli | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Isabella Cruz Rustichelli' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Isabella da Silva Batista | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabella da Silva Batista' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabella Pereira Freitas de Almeida | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabella Pereira Freitas de Almeida' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabelle da Costa Lima | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabelle da Costa Lima' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isaque dos Santos Lico | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Isaque dos Santos Lico' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Israel Gonçalves Monteiro | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Israel Gonçalves Monteiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Jasmim Fortunato Monteiro Bernardo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Jasmim Fortunato Monteiro Bernardo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Jean Lucas de Santana Dias Brum Ribeiro | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Jean Lucas de Santana Dias Brum Ribeiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Jean Marcel Silva da Costa Jacques | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Jean Marcel Silva da Costa Jacques' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Jefte Wesley Vilar Custódio | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Jefte Wesley Vilar Custódio' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Joanna Carolina Teixeira Sampaio dos Santos Souto | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Joanna Carolina Teixeira Sampaio dos Santos Souto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- João Bernardes de Castro | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'João Bernardes de Castro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- João Gabriel Oliveira Narciso | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'João Gabriel Oliveira Narciso' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- João Lucas Henrique da Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'João Lucas Henrique da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- João Machado Martins | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'João Machado Martins' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- João Miguel da Cunha Alves Ferreira | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'João Miguel da Cunha Alves Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- João Paulo Costa do Carmo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'João Paulo Costa do Carmo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- João Pedro Machado rosa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'João Pedro Machado rosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Joao Pedro Moreira de Oliva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Joao Pedro Moreira de Oliva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- João Victor Costa Barboza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'João Victor Costa Barboza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- João Vitor Da Silva De Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'João Vitor Da Silva De Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Joaquim do Espirito Santo Teixeira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Joaquim do Espirito Santo Teixeira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Jonatas Viana Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Jonatas Viana Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Jonathan Carlos Souza Junior | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Jonathan Carlos Souza Junior' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Jonathan de Lima Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Jonathan de Lima Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Jorge Leon Sant' Anna Siqueira Simas da Silva | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Jorge Leon Sant'' Anna Siqueira Simas da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- José Carlos Nazário | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'José Carlos Nazário' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- José Demétrio de Oliveira Accioly Cordeiro | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'José Demétrio de Oliveira Accioly Cordeiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Julia Cabral do Nascimento | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Julia Cabral do Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Julia da Costa de Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Julia da Costa de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Júlia Lençone Plaza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Júlia Lençone Plaza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Julia Pessoa Valadares Luz Pereira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Julia Pessoa Valadares Luz Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Julia Silva de Freitas | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Julia Silva de Freitas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Julia Xavier da Silva Souza Campelo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Julia Xavier da Silva Souza Campelo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Juliana Carrati Fagundes | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Juliana Carrati Fagundes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Juliana Fonseca Fortes | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Juliana Fonseca Fortes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Júlio César da Silva Vidal | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Júlio César da Silva Vidal' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Jullya Victoria Gomes da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Jullya Victoria Gomes da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Kamilly Azevedo da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Kamilly Azevedo da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Karina Alexandra da Silva Fontes | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Karina Alexandra da Silva Fontes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Kayque Vinicius Da Costa Mallet de Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Kayque Vinicius Da Costa Mallet de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Klaus Magno Viana Silva | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Klaus Magno Viana Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lara Carvalho Torres | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lara Carvalho Torres' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Larissa Mendes Paiva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Larissa Mendes Paiva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Laura Andrade da Silveira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Laura Andrade da Silveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Laura Bustamante França | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Laura Bustamante França' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Laura Costa Figueira | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Laura Costa Figueira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Laura Leal Mesquita | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Laura Leal Mesquita' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Laura Peres de Souza | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Laura Peres de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Laura Riggo Targueta Barboza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Laura Riggo Targueta Barboza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Laura Turques Tavares | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Laura Turques Tavares' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Lavínia Lyrio Ferreira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Lavínia Lyrio Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Lavynea dos Anjos Silva Guimarães | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Lavynea dos Anjos Silva Guimarães' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Leandro Vasconcelos dos Santos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Leandro Vasconcelos dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Leona Patrícia da Cruz Martins | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Leona Patrícia da Cruz Martins' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Letícia Neves Coelho Guerra da Silva | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Letícia Neves Coelho Guerra da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Letícia Passos de Souza | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Letícia Passos de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Levi de Freitas Simões | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Levi de Freitas Simões' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Levi Jorge Leite Oliveira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Levi Jorge Leite Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lidiane Maria Barbosa Lima Dias | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lidiane Maria Barbosa Lima Dias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lilian de Souza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Lilian de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Lohana Leopoldo de Araujo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lohana Leopoldo de Araujo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Lorena Barreto Campos Dias | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Lorena Barreto Campos Dias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Lorena Dos Santos Villas | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Lorena Dos Santos Villas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Lorenzo Felipe Nicolau da Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lorenzo Felipe Nicolau da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lorenzo Rodrigues Trovisco | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lorenzo Rodrigues Trovisco' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lorrane da Silva Azevedo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Lorrane da Silva Azevedo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Luan Gomes de Faria | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Luan Gomes de Faria' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Luana Ferreira de Souza | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Luana Ferreira de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Lucas Azevedo de Barros | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Azevedo de Barros' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Barreira dos Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Barreira dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas dos Santos Basilio | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas dos Santos Basilio' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Marinho da Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Lucas Marinho da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Lucas Reis Marques | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Reis Marques' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Souza dos Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Souza dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucca da Silva  Batista | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucca da Silva  Batista' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucca Gabriel de Almeida Bispo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lucca Gabriel de Almeida Bispo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Luci Machado Viegas | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Luci Machado Viegas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Luciano Carvalho Christianes | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Luciano Carvalho Christianes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Luciano Peres de Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Luciano Peres de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Luciene de Almeida Correa de  Souza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luciene de Almeida Correa de  Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Luis Lyan da Silveira Ribeiro Miranda | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Luis Lyan da Silveira Ribeiro Miranda' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Luís Rafael Sousa dos Santos | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Luís Rafael Sousa dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Luisa Celano Laurentino Silva | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Luisa Celano Laurentino Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Luisa Xavier Cesar | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luisa Xavier Cesar' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Luiz Eduardo Passos Cunha | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Luiz Eduardo Passos Cunha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Luiz Eduardo Philippsen | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Luiz Eduardo Philippsen' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Luiza Mazeliah do Nascimento | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luiza Mazeliah do Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Luiza Pereira dos Santos | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Luiza Pereira dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Luiza Pimentel Oliveira Barbosa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luiza Pimentel Oliveira Barbosa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maicon Viana Mário | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Maicon Viana Mário' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Manuela Ariston Romao | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Manuela Ariston Romao' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Manuela Lima Dias | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Manuela Lima Dias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Manuela Lourenço Ribeiro | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Manuela Lourenço Ribeiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Manuela Piveta Schulz | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Manuela Piveta Schulz' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Manuela Ribeiro de Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Manuela Ribeiro de Carvalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Marcela Medeiros Martins Monteiro | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Marcela Medeiros Martins Monteiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Marcela Oliveira da Trindade | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Marcela Oliveira da Trindade' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Marcele Alcoforado Santil dos Reis | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Marcele Alcoforado Santil dos Reis' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Marcelino Jorge Batista | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Marcelino Jorge Batista' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Marcello Fernandes Junior | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Marcello Fernandes Junior' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Marcelo da Silva Galvão | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Marcelo da Silva Galvão' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Marcio Renato Santos da Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Marcio Renato Santos da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Marcio Vital de Sousa | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Marcio Vital de Sousa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Marco Aurelio Pacheco Duarte | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Marco Aurelio Pacheco Duarte' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Maria Alice Ferreira Suzano | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Maria Alice Ferreira Suzano' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Maria Antônia Santos | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Maria Antônia Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Maria Aurora Ferreira Costa Jordão da Silva dos Anjos | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Maria Aurora Ferreira Costa Jordão da Silva dos Anjos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Maria Eduarda Costa da Fonseca | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Eduarda Costa da Fonseca' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Eduarda Novo Novaes | CSV: Produção Musical | Correto: Home Studio (36)
  UPDATE alunos SET curso_id = 36
  WHERE nome = 'Maria Eduarda Novo Novaes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 36;

  -- Maria Eduarda Souto de Lima | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Maria Eduarda Souto de Lima' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Maria Eduarda Tonassi do Vale | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Eduarda Tonassi do Vale' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Fernanda Frambach da Costa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Fernanda Frambach da Costa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Fernanda Francisco Barros | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Maria Fernanda Francisco Barros' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Maria Flor de Carvalho Fernandes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Flor de Carvalho Fernandes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Flor Gomes Fazio | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Flor Gomes Fazio' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Flor Silva Da Conceiçao | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Flor Silva Da Conceiçao' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Laura Kalile da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Laura Kalile da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Luísa de Souza Ignacio | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Luísa de Souza Ignacio' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Luisa Silva da Conceição | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Maria Luisa Silva da Conceição' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Maria Luiza dos Santos Figueiredo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Luiza dos Santos Figueiredo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Luiza Gomes Nascimento | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Maria Luiza Gomes Nascimento' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Maria Luiza Hilária Durão | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Luiza Hilária Durão' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Luiza Nogueira Leal | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Luiza Nogueira Leal' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Miranda Pereira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Miranda Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Rita Porfirio da Conceição | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Rita Porfirio da Conceição' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Mariana Guedes da Penha | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Mariana Guedes da Penha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Marina de Albuquerque Bulhões Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Marina de Albuquerque Bulhões Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Mario Dias dos Santos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Mario Dias dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maristela Abreu Gonçalves | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maristela Abreu Gonçalves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Mateus Santiago Tonassi do Vale | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Mateus Santiago Tonassi do Vale' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Matheus de Albuquerque de Sousa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Matheus de Albuquerque de Sousa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Matheus Dias Tupper | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Matheus Dias Tupper' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Matheus Felipe Correia Ferreira dos Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Matheus Felipe Correia Ferreira dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Matheus Keyne Pereira Souza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Matheus Keyne Pereira Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Matheus Roatti Amaral | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Matheus Roatti Amaral' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Mel Bastos Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Mel Bastos Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Meline Guinâncio Printes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Meline Guinâncio Printes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Melissa Gorni Dutra | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Melissa Gorni Dutra' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Michele Oliveira Ramalho | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Michele Oliveira Ramalho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Miguel Abreu Melo | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Miguel Abreu Melo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Miguel Alves da Rocha | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Miguel Alves da Rocha' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Miguel Bittencourt Costa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Bittencourt Costa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Bustamante França | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Bustamante França' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Gomes Biancamano | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Miguel Gomes Biancamano' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Miguel Gonçalves da Silva | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Miguel Gonçalves da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Miguel Lucas Moraes Silveira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Miguel Lucas Moraes Silveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Miguel Santos Borges | CSV: Saxofone | Correto: SAX T (31)
  UPDATE alunos SET curso_id = 31
  WHERE nome = 'Miguel Santos Borges' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 31;

  -- Miguel Silva Roca | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Silva Roca' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Teixeira Sampaio dos Santos Souto | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Teixeira Sampaio dos Santos Souto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Millene Chris Pimentel de Matos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Millene Chris Pimentel de Matos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Murilo  Martellote de Assis | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Murilo  Martellote de Assis' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Murilo Oliveira da Hora Dantas | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Murilo Oliveira da Hora Dantas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Natalia Jorge Vieira | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Natalia Jorge Vieira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Nathan William Dos Santos Onório | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Nathan William Dos Santos Onório' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Neemias Francisco dos Santos | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Neemias Francisco dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Nico Manuci Bastos Sena | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Nico Manuci Bastos Sena' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Nicolas Faria dos Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Nicolas Faria dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nicolas Silva do Bonfim | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Nicolas Silva do Bonfim' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nikolas Carolina Damasceno | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Nikolas Carolina Damasceno' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nilson Ribeiro do Couto | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Nilson Ribeiro do Couto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Olavo Pereira Wood | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Olavo Pereira Wood' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Olivia Rocha Venturi | CSV: Ukulele | Correto: Ukulelê T (8)
  UPDATE alunos SET curso_id = 8
  WHERE nome = 'Olivia Rocha Venturi' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 8;

  -- Olivia Ventura Martins | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Olivia Ventura Martins' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Orion Dias de Oliveira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Orion Dias de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Pablo Henrique Costa de Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pablo Henrique Costa de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Paloma Barreto Campos Dias | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Paloma Barreto Campos Dias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Patric Silva de Oliveira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Patric Silva de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Paulo Gabriel chelinho de Andrade | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Paulo Gabriel chelinho de Andrade' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Paulo Modesto Ferreira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Paulo Modesto Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Alexandre Lopes Santiago Girardi | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Alexandre Lopes Santiago Girardi' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Alves Pereira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pedro Alves Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Pedro Augusto Meiser Gabrielli | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pedro Augusto Meiser Gabrielli' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Pedro de Oliveira Vargas | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro de Oliveira Vargas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Faria de Oliveira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Pedro Faria de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Pedro Gabriel da França Rocha Pinto | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pedro Gabriel da França Rocha Pinto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Pedro Gusmão Morgado | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Gusmão Morgado' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Henrique Argeu Costa da Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Pedro Henrique Argeu Costa da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Pedro Martellote de Assis | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Pedro Martellote de Assis' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Pedro Siqueira Guimarães | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Siqueira Guimarães' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pérola Reis da Cunha Silva Santos | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Pérola Reis da Cunha Silva Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Pietro Bahia de Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pietro Bahia de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Priscila Amaro da Silva | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Priscila Amaro da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Raffael Pietro Coutinho Agostinho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Raffael Pietro Coutinho Agostinho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Raul Fonseca Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Raul Fonseca Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Raul Luis Castro Costa Pereira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Raul Luis Castro Costa Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Raul Rodrigues Aguiar | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Raul Rodrigues Aguiar' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Rebeca dos Santos Gregório Pinto | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Rebeca dos Santos Gregório Pinto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Rebeca Valério da Silva de Paulo | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Rebeca Valério da Silva de Paulo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Renan de Souza Corrêa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Renan de Souza Corrêa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Renato Vitorino Pandolpho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Renato Vitorino Pandolpho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Rhajan Rodrigues Amorim | CSV: Cavaquinho | Correto: Cavaquinho T (35)
  UPDATE alunos SET curso_id = 35
  WHERE nome = 'Rhajan Rodrigues Amorim' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 35;

  -- Ricardo Nunes Hacar | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Ricardo Nunes Hacar' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Rodrigo Wanderley da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Rodrigo Wanderley da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ronald Oliveira Rodrigues Fernandes | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Ronald Oliveira Rodrigues Fernandes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Ruan Luis de Oliveira Martellote | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Ruan Luis de Oliveira Martellote' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Ryan Oliveira Narciso | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Ryan Oliveira Narciso' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Samuel do Nascimento Alcantara Botelho | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Samuel do Nascimento Alcantara Botelho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Sandro Ribeiro da Silva | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Sandro Ribeiro da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Sara Racca Alves de Freitas Damasceno | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Sara Racca Alves de Freitas Damasceno' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Sarah Mendes Gomes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Sarah Mendes Gomes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Senair José da Silva Pinto | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Senair José da Silva Pinto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Sirley Jorge Martins Dantas | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Sirley Jorge Martins Dantas' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Sofia Alves Vedoi | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Sofia Alves Vedoi' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Sofia Borges Aquino da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sofia Borges Aquino da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sofia Cardoso de Lima | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sofia Cardoso de Lima' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sofia Ellen Soares da Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Sofia Ellen Soares da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Sofia Vitor Pim | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Sofia Vitor Pim' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Sophia Maciel Magalhaes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Sophia Maciel Magalhaes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Sophia Mallet Molnar Silveira Torres | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Sophia Mallet Molnar Silveira Torres' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Sophia Reis Martins Garcia de Lima | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Sophia Reis Martins Garcia de Lima' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Soraia da Silveira Duarte | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Soraia da Silveira Duarte' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Talyta Modesto Ferreira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Talyta Modesto Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Tarcilio Araújo Brito | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Tarcilio Araújo Brito' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Téo Brito de Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Téo Brito de Souza' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Thais Galdino Cavalcante | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Thais Galdino Cavalcante' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Théo D'Avila Gonçalves | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Théo D''Avila Gonçalves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Théo de Souza Alves | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Théo de Souza Alves' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Theo de Souza Pereira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Theo de Souza Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Theo dos Santos Figueiredo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Theo dos Santos Figueiredo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Thiago Sandes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Thiago Sandes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Thuanny de Souza Chaves Ribeiro | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Thuanny de Souza Chaves Ribeiro' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Tito  de Oliveira Ferreira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Tito  de Oliveira Ferreira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Valdemir De Vargas Junior | CSV: Produção Musical | Correto: Home Studio (36)
  UPDATE alunos SET curso_id = 36
  WHERE nome = 'Valdemir De Vargas Junior' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 36;

  -- Valentim Lima de Oliveira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Valentim Lima de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Valentina Garcia da Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Valentina Garcia da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Valentina Rodrigues dos Santos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Valentina Rodrigues dos Santos' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Valentina Santiago Santos Poubel de Araújo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Valentina Santiago Santos Poubel de Araújo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Veronica Nascimento da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Veronica Nascimento da Silva' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Vicente Dias Botelho | CSV: Flauta Transversal | Correto: Flauta Transversa (37)
  UPDATE alunos SET curso_id = 37
  WHERE nome = 'Vicente Dias Botelho' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 37;

  -- Victor Caputo Cerillo Andrade | CSV: Produção Musical | Correto: Home Studio (36)
  UPDATE alunos SET curso_id = 36
  WHERE nome = 'Victor Caputo Cerillo Andrade' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 36;

  -- Vinícius Cantarino Vieira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Vinícius Cantarino Vieira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Vinícius de Andrade Teixeira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Vinícius de Andrade Teixeira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Vinícius de Souza de Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Vinícius de Souza de Oliveira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Vinícius Lopa Mendes Rezende de Macedo | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Vinícius Lopa Mendes Rezende de Macedo' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Violeta de Freitas Germano Leal | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Violeta de Freitas Germano Leal' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Vitoria Vivia dos Santos Costa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Vitoria Vivia dos Santos Costa' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Wagner Amaral Mesquita Pereira | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Wagner Amaral Mesquita Pereira' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Wagner Siqueira de Almeida | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Wagner Siqueira de Almeida' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Willer Arruda Machado | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Willer Arruda Machado' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Wylla Cristina Carvalho de Almeida | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Wylla Cristina Carvalho de Almeida' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Yan Andrade Barreto | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Yan Andrade Barreto' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Yasmin P. Ignez Moraes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Yasmin P. Ignez Moraes' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Yuri Gabriel dos Santos Rodrigues | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Yuri Gabriel dos Santos Rodrigues' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Yuri Maia Gonçalves Dias | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Yuri Maia Gonçalves Dias' 
    AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Agatha de Sá Dellatorre | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Agatha de Sá Dellatorre' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Agatha Sampaio Mendes dos Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Agatha Sampaio Mendes dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Alex Mendes Silva de Souza | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Alex Mendes Silva de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Alice dos Santos Seabra | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Alice dos Santos Seabra' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Alice Marzullo Monteiro Mendes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Alice Marzullo Monteiro Mendes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Alice Mattos Jordão | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Alice Mattos Jordão' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Alisson Silva Leite | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Alisson Silva Leite' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Amanda Aiko Gomes Togashi | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Amanda Aiko Gomes Togashi' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Amanda Ozório de Barros | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Amanda Ozório de Barros' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Anna Luisa Cruz Gondim | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Anna Luisa Cruz Gondim' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Arthur Bezerra Siqueira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Arthur Bezerra Siqueira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Arthur Carvalho Lima | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Arthur Carvalho Lima' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Arthur Darzi Ferreira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Darzi Ferreira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur de Carvalho Rodrigues Frota Almeida | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Arthur de Carvalho Rodrigues Frota Almeida' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Arthur Galvão Barbosa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Galvão Barbosa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Rodriguez Machado | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Arthur Rodriguez Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Arthur Vale de Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Arthur Vale de Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Arthur Vargas Caldas | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Vargas Caldas' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Vieira Dantas Pollig | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Arthur Vieira Dantas Pollig' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Artur Carollo Barbuto | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Artur Carollo Barbuto' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Aurora Drummond e Bragança | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Aurora Drummond e Bragança' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Bárbara Victoria Moreno Ruiz | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bárbara Victoria Moreno Ruiz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Beatriz dos Santos Monteiro | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Beatriz dos Santos Monteiro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Beatriz Rabelo Cheker | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Beatriz Rabelo Cheker' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Beatriz Souto Machado | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Beatriz Souto Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Benício Cardoso Moreira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Benício Cardoso Moreira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Benjamin de Jesus Pimentel | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Benjamin de Jesus Pimentel' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Benjamin Felipe Roca Ribeiro | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Benjamin Felipe Roca Ribeiro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Benjamin Lehrer Braz | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Benjamin Lehrer Braz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bento Vieira Sindeaux | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Bento Vieira Sindeaux' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bernardo da Silva Menezes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bernardo da Silva Menezes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bernardo Guerra da Costa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Bernardo Guerra da Costa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Bernardo Lioi Santos | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Bernardo Lioi Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bernardo Martinelli | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Bernardo Martinelli' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Bernardo Neumann da Cunha | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Bernardo Neumann da Cunha' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bernardo Pereira Magalhães | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Bernardo Pereira Magalhães' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Betina Gerstel | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Betina Gerstel' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Bianca Petrolongo Pinto Abreu | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Bianca Petrolongo Pinto Abreu' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Breno Ferreira Florião | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Breno Ferreira Florião' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bruna Silva De Sá Vale | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Bruna Silva De Sá Vale' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Caetano Leao Barradas | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Caetano Leao Barradas' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Caio Gabriel da Silva Neto | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Caio Gabriel da Silva Neto' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Caio Lioi Santos | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Caio Lioi Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Caio Villela Meireles | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Caio Villela Meireles' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Caio Vinicius Vieira de Castro | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Caio Vinicius Vieira de Castro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Calebe de Moura Oliveira Ramos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Calebe de Moura Oliveira Ramos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Catarina Bahia Teodoro | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Catarina Bahia Teodoro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Catarina Petrolongo Pinto Abreu | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Catarina Petrolongo Pinto Abreu' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Clara Beatriz F de Carvalho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Clara Beatriz F de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Clara de Sá Silva Santos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Clara de Sá Silva Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Clara Marina Jorge da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Clara Marina Jorge da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Clara Martins Moura Marendaz | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Clara Martins Moura Marendaz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Daniel Bezerra Siqueira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Bezerra Siqueira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel Cardoso Poggio Contardo | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Daniel Cardoso Poggio Contardo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Daniel Castor Kuhlmann Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Castor Kuhlmann Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel Coelho Faria | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Daniel Coelho Faria' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Daniel Duque Vianna | CSV: Ukulele | Correto: Ukulelê T (8)
  UPDATE alunos SET curso_id = 8
  WHERE nome = 'Daniel Duque Vianna' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 8;

  -- Daniel Mendes Saramago | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Daniel Mendes Saramago' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Daniel Rodriguez Machado | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Rodriguez Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel sterblitch | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel sterblitch' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel Teixeira Campos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Teixeira Campos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Danielle Medeiros Da Silva Machado | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Danielle Medeiros Da Silva Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Davi do nascimento alexandre da gama mello | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Davi do nascimento alexandre da gama mello' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Davi dos Santos amaral | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Davi dos Santos amaral' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Davi dos Santos Veras | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi dos Santos Veras' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Farias dos Santos | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Davi Farias dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Davi Jorge da Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Davi Jorge da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Davi Lucas de Castro Lourenço | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Davi Lucas de Castro Lourenço' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Davi Piragine Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Davi Piragine Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- David Kayat A. Mansour | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'David Kayat A. Mansour' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Débora Rodriguez Barbosa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Débora Rodriguez Barbosa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Diogo Ribeiro Galhardo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Diogo Ribeiro Galhardo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Dom Szsentes Boyd | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Dom Szsentes Boyd' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Dylan Januzi | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Dylan Januzi' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Elena Picanço Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Elena Picanço Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Elena Ribeiro Lopes Zoletti | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Elena Ribeiro Lopes Zoletti' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Elis Tineli Gomes Cotta | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Elis Tineli Gomes Cotta' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Enrico Florenzano | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Enrico Florenzano' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Enzo Amigo Alvarez | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Enzo Amigo Alvarez' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Enzo de Castro Freitas | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Enzo de Castro Freitas' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Enzo Dorileo Ewald | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Enzo Dorileo Ewald' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Enzo Langer Peres | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Enzo Langer Peres' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Enzo Teixeira Menezes de Lima | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Enzo Teixeira Menezes de Lima' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Erik Edson Chalegre Erdmann | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Erik Edson Chalegre Erdmann' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Estevão Lehrer Braz | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Estevão Lehrer Braz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Fabiana Moriel Castela de Souza | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Fabiana Moriel Castela de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Fabio Pilar Moreira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Fabio Pilar Moreira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Felipe de Moura Vieira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Felipe de Moura Vieira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Felipe Melo Castor | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Felipe Melo Castor' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Fernanda Lehrer Turbae Amaral Braz | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Fernanda Lehrer Turbae Amaral Braz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Fernanda Maria da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Fernanda Maria da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Fernanda Moriel Castela de Souza | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Fernanda Moriel Castela de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Flavio Ricardo Leal Vieira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Flavio Ricardo Leal Vieira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Francesco de Souza Novello | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Francesco de Souza Novello' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Francisco Cardoso Aride | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Francisco Cardoso Aride' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Gabriel De Paula | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriel De Paula' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gabriel Medeiros Gonçalves Bittencourt | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gabriel Medeiros Gonçalves Bittencourt' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gabriel Miele Nunes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Gabriel Miele Nunes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Gabriel Vidal França de Carvalho | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Gabriel Vidal França de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gabriel Wandeck Campos Brito | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gabriel Wandeck Campos Brito' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gabriela da Silva Machado | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriela da Silva Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gabriela Garcia de Carvalho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriela Garcia de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gael Rodrigues Martins | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gael Rodrigues Martins' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Geovana vitória jorge da silva | CSV: Cavaquinho | Correto: Cavaquinho T (35)
  UPDATE alunos SET curso_id = 35
  WHERE nome = 'Geovana vitória jorge da silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 35;

  -- Giovanna Alves da Silva Mendonça | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Giovanna Alves da Silva Mendonça' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Giovanna Azevedo Chipitelli | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Giovanna Azevedo Chipitelli' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Giovanna Dabés Moreira de Carvalho Al Alam da Fonseca | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Giovanna Dabés Moreira de Carvalho Al Alam da Fonseca' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Giovanna Gonçalves Frias Ribeiro | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Giovanna Gonçalves Frias Ribeiro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Giovanna Marsico da Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Giovanna Marsico da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Giovanna Sant Anna de Lima Nicolela | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Giovanna Sant Anna de Lima Nicolela' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Grace Couto de Andrade | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Grace Couto de Andrade' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Guilherme de Farias Varjão | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Guilherme de Farias Varjão' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Guilherme Duque Vianna | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Guilherme Duque Vianna' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Guilherme Ferreira Muniz dos Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Guilherme Ferreira Muniz dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor Cañas Garofo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Heitor Cañas Garofo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor de Souza Lima da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Heitor de Souza Lima da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Heitor Gael Serra Araújo | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Heitor Gael Serra Araújo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Helena cardoso Roxo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Helena cardoso Roxo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Helena de Souza Lima da Silva | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Helena de Souza Lima da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Helena Neis Zavallo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Helena Neis Zavallo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Heloísa de Andrade Leôncio | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Heloísa de Andrade Leôncio' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Henrique Dang Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Henrique Dang Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Henrique de Andrade Leôncio | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Henrique de Andrade Leôncio' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Henrique Pereira Caldas Pinto de Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Henrique Pereira Caldas Pinto de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Hugo Marsico da Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Hugo Marsico da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Hugo Penedo Amorim | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Hugo Penedo Amorim' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Inaê Antunes Coelho de Sá | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Inaê Antunes Coelho de Sá' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabel Ohana Nunes de Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabel Ohana Nunes de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabela Ferreira Moura | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabela Ferreira Moura' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabella Boscardini Moreira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Isabella Boscardini Moreira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Isabella de Souza Durço | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabella de Souza Durço' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ísis Mayumi Fujiwara Lima | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Ísis Mayumi Fujiwara Lima' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Jan Sidarta stehmann de Aguiar (Ian) | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Jan Sidarta stehmann de Aguiar (Ian)' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Joachim Krull Carrez | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Joachim Krull Carrez' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- João Dal Bello Migani | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'João Dal Bello Migani' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- João Francisco Quintella de Macedo Mayer | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'João Francisco Quintella de Macedo Mayer' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- João Guilherme Couto Vargas Luiz | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'João Guilherme Couto Vargas Luiz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Joao Miguel de Araújo Jardim Tupinamba Borges | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Joao Miguel de Araújo Jardim Tupinamba Borges' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- João Pedro Brizzi de Almeida | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'João Pedro Brizzi de Almeida' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- João Pedro Cerveira Soares | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'João Pedro Cerveira Soares' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- João Pedro Fontenelle | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'João Pedro Fontenelle' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- João Piragine Silva | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'João Piragine Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- João Ribeiro Miranda do valle Magalhães | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'João Ribeiro Miranda do valle Magalhães' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Josué Salazar Nogueira Galheiro Poças | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Josué Salazar Nogueira Galheiro Poças' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Júlia Adum de Paiva Herbst | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Júlia Adum de Paiva Herbst' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Julia Alves Arantes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Julia Alves Arantes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Julia Christina Mury Messias | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Julia Christina Mury Messias' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Júlia Heil da Fonseca | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Júlia Heil da Fonseca' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Júlia Lopes de Medeiros | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Júlia Lopes de Medeiros' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Júlia Paraguassu Eizerik Machado | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Júlia Paraguassu Eizerik Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Júlia Queiroz de Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Júlia Queiroz de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Júlia Salarini Gama | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Júlia Salarini Gama' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Kaique da silva Batista | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Kaique da silva Batista' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Killian Paschuini Brito | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Killian Paschuini Brito' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lara Dias de Souza | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lara Dias de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Lara Pereira Faria | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lara Pereira Faria' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Larissa Bezerra Silva de Oliveira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Larissa Bezerra Silva de Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Laura Almada Teixeira Neto | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Laura Almada Teixeira Neto' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Laura Damasceno Estevez | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Laura Damasceno Estevez' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Laura Picanço Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Laura Picanço Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Lavinia Barreto Miranda | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lavinia Barreto Miranda' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Letícia Ferreira Vasconcelos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Letícia Ferreira Vasconcelos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Levi Freire da Silva Sousa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Levi Freire da Silva Sousa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Liah Lemos Schettino | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Liah Lemos Schettino' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Lígia de Freitas Gonçalves | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lígia de Freitas Gonçalves' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lis Alencar Rodrigues De Azevedo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lis Alencar Rodrigues De Azevedo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lohan Marques Boente | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lohan Marques Boente' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lorenzo Donni Borges | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lorenzo Donni Borges' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Luca Pessurno Rodrigues Torres | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luca Pessurno Rodrigues Torres' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Lucas Bezerra Siqueira | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Lucas Bezerra Siqueira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Lucas Cseko e Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Cseko e Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Freire da Silva Sousa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lucas Freire da Silva Sousa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Lucas Medeiros de Albuquerque | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lucas Medeiros de Albuquerque' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Luis Miguel da Silva Neto | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Luis Miguel da Silva Neto' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Luísa da Silva Fraga | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Luísa da Silva Fraga' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Luisa medeiros de Albuquerque | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luisa medeiros de Albuquerque' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Luísa Serpa Ribeiro Fleischhauer | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Luísa Serpa Ribeiro Fleischhauer' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Luiz Felipe de Castro Teixeira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Luiz Felipe de Castro Teixeira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Luiza Faria Frazão de Souza | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Luiza Faria Frazão de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Luiza Quintas de Oliveira Ramos Morais | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Luiza Quintas de Oliveira Ramos Morais' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Maitê Gomes Pereira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maitê Gomes Pereira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Malu Picerno Franco Molinaro Amaral | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Malu Picerno Franco Molinaro Amaral' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Manuela Araujo Rodrigues | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Manuela Araujo Rodrigues' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Manuela Chermont de Miranda Petersen | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Manuela Chermont de Miranda Petersen' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Manuela correia Lopes de Oliveira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Manuela correia Lopes de Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Manuela de Moura Vieira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Manuela de Moura Vieira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Manuela Souza Soares | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Manuela Souza Soares' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Manuella Weber Riedel | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Manuella Weber Riedel' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Marcela de Araújo Guimarães Dutra | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Marcela de Araújo Guimarães Dutra' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Marcelo Costa de Souza lira | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Marcelo Costa de Souza lira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Marco Antônio Barreto Sundin | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Marco Antônio Barreto Sundin' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Marcos Monteiro Leal Simões | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Marcos Monteiro Leal Simões' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Maria Clara Cunha dos Santos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Clara Cunha dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- María Clara Monteiro de Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'María Clara Monteiro de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Clara Monteiro Delgado de Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Clara Monteiro Delgado de Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Clara Wandeck Lima | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Clara Wandeck Lima' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Edith Madeira Coimbra | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Maria Edith Madeira Coimbra' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Maria Eduarda Cardoso Moreira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Eduarda Cardoso Moreira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Eduarda Oliveira Costa | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Eduarda Oliveira Costa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Eduarda Santiago de Aguiar | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Maria Eduarda Santiago de Aguiar' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Maria Esther Hadassa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Esther Hadassa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Flor Arrigoni Carneiro | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Maria Flor Arrigoni Carneiro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Maria Helena Brizzi de Almeida | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Helena Brizzi de Almeida' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Júlia Lagdem Fernandes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Júlia Lagdem Fernandes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Júlia nascimento Nóbrega | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Júlia nascimento Nóbrega' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Luiza Ferreira Moura | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Luiza Ferreira Moura' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Luiza Figueiredo Cantalice | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Luiza Figueiredo Cantalice' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Petzold Antonioli Coutinho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Petzold Antonioli Coutinho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Rita Damasceno Estevez | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Rita Damasceno Estevez' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Sousa P. dos Santos | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Maria Sousa P. dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Mariana Albuquerque Oliveira | CSV: Violino | Correto: Violino T (12)
  UPDATE alunos SET curso_id = 12
  WHERE nome = 'Mariana Albuquerque Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 12;

  -- Marília Andressa Sandeo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Marília Andressa Sandeo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Matheus Carvalho Freitas | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Matheus Carvalho Freitas' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Matheus da Mota Gomes | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Matheus da Mota Gomes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Mathias Barreto Caetano | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Mathias Barreto Caetano' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maysa Telles Reis Gonçalves | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maysa Telles Reis Gonçalves' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Miguel Antunes Tostes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Antunes Tostes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Bolais de Salles | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Bolais de Salles' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Couto de Andrade | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Miguel Couto de Andrade' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Miguel da Silva Fraga | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel da Silva Fraga' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Holanda Cavalcanti Martins | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Holanda Cavalcanti Martins' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Jorge da Silva | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Jorge da Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Masson Rocha Mendes | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Miguel Masson Rocha Mendes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Miguel Menezes Merçon dos Santos | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Miguel Menezes Merçon dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Milena Melo Lima Correa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Milena Melo Lima Correa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Natan Lança Moreira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Natan Lança Moreira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Natan Sá Justino | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Natan Sá Justino' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Natan Vitor Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Natan Vitor Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nathan Leggett de Moura | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Nathan Leggett de Moura' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nicolas Couto de Andrade | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Nicolas Couto de Andrade' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nicolas de Farias Varjão | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Nicolas de Farias Varjão' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Nicole Takeda Takenawa | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Nicole Takeda Takenawa' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Noah Carpenter Degan | CSV: Ukulele | Correto: Ukulelê T (8)
  UPDATE alunos SET curso_id = 8
  WHERE nome = 'Noah Carpenter Degan' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 8;

  -- Noah Teixeira Menezes de Lima | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Noah Teixeira Menezes de Lima' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Olivia Freire Rodrigues Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Olivia Freire Rodrigues Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Otto Dorileo Ewald | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Otto Dorileo Ewald' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Otto Santiago Mendes | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Otto Santiago Mendes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Pedro Cesquim Medeiros de Castro e Azevedo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Pedro Cesquim Medeiros de Castro e Azevedo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Pedro da Mota Gomes | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Pedro da Mota Gomes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Pedro da Silva Machado | CSV: Ukulele | Correto: Ukulelê T (8)
  UPDATE alunos SET curso_id = 8
  WHERE nome = 'Pedro da Silva Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 8;

  -- Pedro de Castro Bressane Albuquerque do Carmo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro de Castro Bressane Albuquerque do Carmo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Faria Frazão de Souza | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Pedro Faria Frazão de Souza' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Pedro Gabriel de Melo Alexandre | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pedro Gabriel de Melo Alexandre' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Pedro Henrique Almeida Capitanio | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Henrique Almeida Capitanio' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Quintas de Oliveira Ramos Morais | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Quintas de Oliveira Ramos Morais' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Philippe de Goulart Rodrigues | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Philippe de Goulart Rodrigues' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Pietra Sucena Novaes Calvo Bueno | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pietra Sucena Novaes Calvo Bueno' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Rafael Marques G dos Santos | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Rafael Marques G dos Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Rafael Souto Machado | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Rafael Souto Machado' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Rafael Villeth de Holanda | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Rafael Villeth de Holanda' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Ramires Moraes do Nascimento | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Ramires Moraes do Nascimento' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Ricardo Alfonso Moreno Ruiz | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Ricardo Alfonso Moreno Ruiz' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Roberta Rodrigues Lins Rodolfo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Roberta Rodrigues Lins Rodolfo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Roberto Toledo El Alam | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Roberto Toledo El Alam' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Rodrigo Pereira Brum | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Rodrigo Pereira Brum' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Rúbia Pimentel Duarte | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Rúbia Pimentel Duarte' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Samuel Nunes Victorino | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Samuel Nunes Victorino' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Samuel Silveira Noronha | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Samuel Silveira Noronha' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Saulo Medeiros Aride | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Saulo Medeiros Aride' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Sérgio Mauro da Silva Maia | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Sérgio Mauro da Silva Maia' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Silvia Ohana Marques Coelho de Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Silvia Ohana Marques Coelho de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sofia de Avellar Muchuli e Silva | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Sofia de Avellar Muchuli e Silva' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Sofia Gonçalves Copello Moraes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sofia Gonçalves Copello Moraes' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sofia Lima de Castro | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sofia Lima de Castro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sophia Correa Motta | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sophia Correa Motta' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sophie Medeiros Rodrigues | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sophie Medeiros Rodrigues' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Sophie Szsentes Boyd | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sophie Szsentes Boyd' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Tammy Missae dos Reis Nagashima Lira | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Tammy Missae dos Reis Nagashima Lira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Théo Arruda de Oliveira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Théo Arruda de Oliveira' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Theo Campello Bastos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Theo Campello Bastos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Theo de Souza Galdino | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Theo de Souza Galdino' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Theo Modesti da Cunha Belém | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Theo Modesti da Cunha Belém' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Thomás Giorelli de Carvalho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Thomás Giorelli de Carvalho' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Thomas Medeiros Rodrigues | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Thomas Medeiros Rodrigues' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Valentim da Silva Bond | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Valentim da Silva Bond' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Valentina Cortes Santanna | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Valentina Cortes Santanna' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Valentina Mendes Rodrigues Aleixo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Valentina Mendes Rodrigues Aleixo' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Vaner Paranhos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Vaner Paranhos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Vicente Boêta Alves | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Vicente Boêta Alves' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Vicente Pereira Costard | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Vicente Pereira Costard' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Victor Alexandre Mendes Soares | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Victor Alexandre Mendes Soares' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Victor Henrique de Sá Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Victor Henrique de Sá Santos' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Vinícius Palmieri Schmid | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Vinícius Palmieri Schmid' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Vitor Palmieri Schmid | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Vitor Palmieri Schmid' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Vitória da Silva Nobre | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Vitória da Silva Nobre' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Yuri Amador Maia | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Yuri Amador Maia' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Yuri Barros Jardim | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Yuri Barros Jardim' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Yuri de Souza Ribeiro | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Yuri de Souza Ribeiro' 
    AND unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Agatha Carias da Silva Pereira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Agatha Carias da Silva Pereira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Alana Vasconcelos de Araujo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Alana Vasconcelos de Araujo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Alberto José dos Santos | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alberto José dos Santos' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Alexandre Ferreira | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Alexandre Ferreira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Alexandre Herd Giglio | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Alexandre Herd Giglio' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Alice Cordeiro Mafra | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alice Cordeiro Mafra' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Alicia Reina | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Alicia Reina' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Aline Borges Becker Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Aline Borges Becker Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ana Paula dos Santos Souza | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Ana Paula dos Santos Souza' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Ana Paula Oliveira Cazarotti | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Ana Paula Oliveira Cazarotti' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Ana Vitória de Lima | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Ana Vitória de Lima' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Anna Luisa Peres Alves | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Anna Luisa Peres Alves' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Antonella Lara Grei Cardozo De Morais | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Antonella Lara Grei Cardozo De Morais' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Antônio Henrique Segall de Noronha | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Antônio Henrique Segall de Noronha' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Arthur Brito de Souza | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Arthur Brito de Souza' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Arthur Engelke Ludogero | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Arthur Engelke Ludogero' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Arthur Giovanni Monte Caporali | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Giovanni Monte Caporali' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Moreno Godinho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Moreno Godinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Arthur Pedro Palmerini Lomba | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Arthur Pedro Palmerini Lomba' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Arthur Titus Rego Von Bertrand | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Arthur Titus Rego Von Bertrand' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Beatriz Correa Paula dos Reis Barata | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Beatriz Correa Paula dos Reis Barata' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Beatriz Dolavale Assed | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Beatriz Dolavale Assed' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Bella Moreno Godinho | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Bella Moreno Godinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Benício Carvalho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Benício Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Benício Rosa Rodrigues | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Benício Rosa Rodrigues' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Benjamin Medeiros Paganini Agostinho | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Benjamin Medeiros Paganini Agostinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bento Cordeiro Sobrinho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Bento Cordeiro Sobrinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Bento Lapa Cazarim | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Bento Lapa Cazarim' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Bento Rebuli Paulo Gomes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bento Rebuli Paulo Gomes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bernardo Becker Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Bernardo Becker Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Bernardo Berriel | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Bernardo Berriel' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bernardo de Medeiros Lacorte Soares | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Bernardo de Medeiros Lacorte Soares' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Bernardo Leal de Meirelles Bolzani | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Bernardo Leal de Meirelles Bolzani' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Bernardo Reis de Carvalho | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Bernardo Reis de Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Billy Paulo Vangu Junior | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Billy Paulo Vangu Junior' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Caê Leal Santos | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Caê Leal Santos' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Caique Feijó de Lima Vieira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Caique Feijó de Lima Vieira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Camila Santos Renha de Oliveira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Camila Santos Renha de Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Carlos Jorge Aud | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Carlos Jorge Aud' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Carlos Vitor Pinheiro da Silva | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Carlos Vitor Pinheiro da Silva' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Cecília suhett de Oliveira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Cecília suhett de Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Clara Agostinho Roizman | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Clara Agostinho Roizman' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Clara de Souza Dantas Lapa | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Clara de Souza Dantas Lapa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Clara Paes Leme Ghanem | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Clara Paes Leme Ghanem' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Clarice Braga Soares de Mello | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Clarice Braga Soares de Mello' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Clarice Rangel Tourinho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Clarice Rangel Tourinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Clarissa Menezes de Carvalho | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Clarissa Menezes de Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Daniel Freire de Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Freire de Souza' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel Lemanski Bordallo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Daniel Lemanski Bordallo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Daniel Pires de Lima | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Daniel Pires de Lima' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Daniel Sampaio Senna Lattari | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Daniel Sampaio Senna Lattari' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Dante Custódio de Almeida Marques | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Dante Custódio de Almeida Marques' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Davi Barreto Lima | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Barreto Lima' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Davi Lima Quintarelli | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Davi Lima Quintarelli' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Eduardo Chagas Mendonça | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Eduardo Chagas Mendonça' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Enzo Ferrari | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Enzo Ferrari' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Enzo Gabriel Pacheco de Almeida | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Enzo Gabriel Pacheco de Almeida' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Esther Araújo Marques França | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Esther Araújo Marques França' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Eva do Espírito Santo Esteves | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Eva do Espírito Santo Esteves' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Felipe Alves Fontinele | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Felipe Alves Fontinele' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Filippe Carnetti Fernandes | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Filippe Carnetti Fernandes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Flávia do Espírito Santo da Silva Telles | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Flávia do Espírito Santo da Silva Telles' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Flor Gianni Botelho Egas Cocco Cordovil de Macedo | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Flor Gianni Botelho Egas Cocco Cordovil de Macedo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Francisco Thomé Godoi | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Francisco Thomé Godoi' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Gabriel Maia Tavares Darmont | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gabriel Maia Tavares Darmont' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Gabriela da Costa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriela da Costa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gabriela Dornas | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Gabriela Dornas' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Gabriela Ferreira Noritomi | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Gabriela Ferreira Noritomi' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Gael Silveira Gonzalez Martinez | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Gael Silveira Gonzalez Martinez' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- GIOVANI BREDA SILVA | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'GIOVANI BREDA SILVA' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Glauce Passos de Souza Maues | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Glauce Passos de Souza Maues' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Guilherme Dolavale Assed | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Guilherme Dolavale Assed' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Heitor Lucas Nogueira dos Santos Soares | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Heitor Lucas Nogueira dos Santos Soares' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Helena Abreu Paixão | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Helena Abreu Paixão' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Helena Menezes de Carvalho | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Helena Menezes de Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Hellena Pitrez Florentino | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Hellena Pitrez Florentino' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Isabela Leal de Meirelles Bolzani | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Isabela Leal de Meirelles Bolzani' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Isabella Florenzano | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isabella Florenzano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isabella Lopes Correa | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Isabella Lopes Correa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Isadora Florenzano Carvalho | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isadora Florenzano Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Isis Petrucio Abrantes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Isis Petrucio Abrantes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Islan Morais | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Islan Morais' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Ivan Moacyr Weiss Junior | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Ivan Moacyr Weiss Junior' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Jefferson Cândido de Souza | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Jefferson Cândido de Souza' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Jeremias Ou Yuan Ma | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Jeremias Ou Yuan Ma' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- João Gabriel Candido | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'João Gabriel Candido' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- João Pedro Proença Magalhães | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'João Pedro Proença Magalhães' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- João Vitor Pinheiro Martins | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'João Vitor Pinheiro Martins' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- João Vitor Souza da Costa | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'João Vitor Souza da Costa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Joaquim Candido Querido Ferraz Soares | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Joaquim Candido Querido Ferraz Soares' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Joaquim Toshio de Barros Lima Hara | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Joaquim Toshio de Barros Lima Hara' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Joseph Díaz Jabor | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Joseph Díaz Jabor' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Juan do Nascimento Cruz Rebello | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Juan do Nascimento Cruz Rebello' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Julia dos Santos Nadaes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Julia dos Santos Nadaes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Júlia Segal de Noronha | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Júlia Segal de Noronha' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Júlia Silva Vilardo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Júlia Silva Vilardo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Juliana de Oliveira almeida | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Juliana de Oliveira almeida' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Juliana Mei Jin Ma | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Juliana Mei Jin Ma' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Juliana Monteiro Pereira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Juliana Monteiro Pereira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Katia  Regina Goulart Trindade | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Katia  Regina Goulart Trindade' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Lana Lopes Pinheiro | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Lana Lopes Pinheiro' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Levi Barbosa Rodrigues | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Levi Barbosa Rodrigues' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Liv Ribeiro Oliveira | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Liv Ribeiro Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lívia Becker Oliveira | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Lívia Becker Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Liz de Azevedo Pacheco | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Liz de Azevedo Pacheco' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Loisi Carla Monteiro Pereira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Loisi Carla Monteiro Pereira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lorenzo Tavares Bernardino de Lima | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lorenzo Tavares Bernardino de Lima' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Luan Colucci Dias | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Luan Colucci Dias' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Antunes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Antunes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Bianchi | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lucas Bianchi' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lucas Brivio do Nascimento | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Lucas Brivio do Nascimento' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lucas Cardoso Neiva | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Lucas Cardoso Neiva' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Lucas Cordeiro Sobrinho | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Lucas Cordeiro Sobrinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Lucas de Barros Rodolpho dos Santos | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Lucas de Barros Rodolpho dos Santos' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Lucas Marques Scaldaferri | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Lucas Marques Scaldaferri' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Lucas Matos de Azevedo Fontes | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lucas Matos de Azevedo Fontes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Lucas Reis Pinna de Andrade | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Lucas Reis Pinna de Andrade' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Ludmilla Lage Gonçalves | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Ludmilla Lage Gonçalves' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Luis Carlos Gomes | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Luis Carlos Gomes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Luísa Schlinz Paz | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Luísa Schlinz Paz' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Lyanna de Faro Alves | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Lyanna de Faro Alves' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Manu Ramos Medeiros | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Manu Ramos Medeiros' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Marcela Gianni Botelho Egas | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Marcela Gianni Botelho Egas' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Marcelo Oliveira Brum Cardoso | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Marcelo Oliveira Brum Cardoso' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Marcelo Ximenes Apoliano | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Marcelo Ximenes Apoliano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Clara Brivio do Nascimento | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Clara Brivio do Nascimento' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Clara Miranda Rodrigues | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Clara Miranda Rodrigues' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Eduarda Candido | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Maria Eduarda Candido' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maria Eduarda Porciuncula Koeche de Magalhães | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Maria Eduarda Porciuncula Koeche de Magalhães' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Maria Fernanda Lima Soares de Moura | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Maria Fernanda Lima Soares de Moura' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Maria Fernanda Sellos Correa Peres | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maria Fernanda Sellos Correa Peres' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Maria Flor Silveira | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Maria Flor Silveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Mariana Herd Giglio | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Mariana Herd Giglio' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Marina Holanda Cardoso | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Marina Holanda Cardoso' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Marina Vasconcellos Tourinho Garcia | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Marina Vasconcellos Tourinho Garcia' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Martina Gomes Ferreira | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Martina Gomes Ferreira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Mateus Bernardes Galvão | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Mateus Bernardes Galvão' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Mateus Kosinov Paulino | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Mateus Kosinov Paulino' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Matheus Moura | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Matheus Moura' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Mauricio Cabral Liberato de Matos Junior | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Mauricio Cabral Liberato de Matos Junior' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Maya Kelly Ximenes Apoliano | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Maya Kelly Ximenes Apoliano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Mel Gianni Botelho Egas Cocco Cordovil de Macedo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Mel Gianni Botelho Egas Cocco Cordovil de Macedo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Melissa Milesi Barth | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Melissa Milesi Barth' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Miguel Brivio do Nascimento | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Miguel Brivio do Nascimento' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Miguel Cardozo | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Miguel Cardozo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Miguel Hayashi Dupret | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Miguel Hayashi Dupret' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Miguel Reis Pinna Mateus Leite | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Miguel Reis Pinna Mateus Leite' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Miguel Souza da Costa | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Miguel Souza da Costa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Miguel Sperandio Kevorkian | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Miguel Sperandio Kevorkian' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Mirella Cordeiro Sobrinho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Mirella Cordeiro Sobrinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Natan Pereira Calvo Demidoff | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Natan Pereira Calvo Demidoff' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Nicolas Mendes de Morais | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Nicolas Mendes de Morais' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Nicolle Mendes de Morais | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Nicolle Mendes de Morais' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Nina Aragão Velloso | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Nina Aragão Velloso' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Noah do Nascimento Barros Peres | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Noah do Nascimento Barros Peres' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Patrick Menezes Cruz | CSV: Cavaquinho | Correto: Cavaquinho T (35)
  UPDATE alunos SET curso_id = 35
  WHERE nome = 'Patrick Menezes Cruz' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 35;

  -- Paula Kelly Ximenes Apoliano | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Paula Kelly Ximenes Apoliano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Paula Tavares da Silva Samão | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Paula Tavares da Silva Samão' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Paulo César Benzi Filho | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Paulo César Benzi Filho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Paulo Roberto Lopes Filho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Paulo Roberto Lopes Filho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Bastos da Costa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pedro Bastos da Costa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Pedro Cindra Feijó | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Pedro Cindra Feijó' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Pedro de Figueiredo Vieira | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Pedro de Figueiredo Vieira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Pedro do Nascimento Cruz Rebello | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro do Nascimento Cruz Rebello' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Henrique Madeira Maturano | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Henrique Madeira Maturano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Henrique Moreno Godinho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Henrique Moreno Godinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro José Dos santos Nadaes | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro José Dos santos Nadaes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Marinho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Marinho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Oliveira Cazarotti | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Oliveira Cazarotti' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pedro Vasconcellos Tourinho Garcia | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Pedro Vasconcellos Tourinho Garcia' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Pérola Madeira Maturano | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Pérola Madeira Maturano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Pietro Matola Abreu | CSV: Contrabaixo | Correto: Contrabaixo T (21)
  UPDATE alunos SET curso_id = 21
  WHERE nome = 'Pietro Matola Abreu' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 21;

  -- Rafael Dias de Lima | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Rafael Dias de Lima' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Rafael Kelly Ximenes Apoliano | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Rafael Kelly Ximenes Apoliano' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Rafael Moura Fernandes | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Rafael Moura Fernandes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Rafael Placido | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Rafael Placido' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Raissa Arcoverde Borborema Mendes Dytz | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Raissa Arcoverde Borborema Mendes Dytz' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Raquel de Cássia Silva de Carvalho | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Raquel de Cássia Silva de Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Rodrigo de Souza Lima Hara | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Rodrigo de Souza Lima Hara' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Rogério Nascimento de Carvalho | CSV: Guitarra | Correto: Guitarra T (14)
  UPDATE alunos SET curso_id = 14
  WHERE nome = 'Rogério Nascimento de Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 14;

  -- Samara Severo Souza | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Samara Severo Souza' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Sandra Maria Gomes Carvalho | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Sandra Maria Gomes Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- Sara Gomes dos Santos | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Sara Gomes dos Santos' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Saulo Reina da Rocha | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Saulo Reina da Rocha' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Sergio Paulo Fogaça de Carvalho | CSV: Violão | Correto: Violão T (10)
  UPDATE alunos SET curso_id = 10
  WHERE nome = 'Sergio Paulo Fogaça de Carvalho' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 10;

  -- Sophia Galhanone | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Sophia Galhanone' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Stefano Luigi de Almeida Agostini | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Stefano Luigi de Almeida Agostini' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Stella Sá de Farias gomes | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Stella Sá de Farias gomes' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Tâmara Perez Lemanski Bordallo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Tâmara Perez Lemanski Bordallo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Thainá Moreira | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Thainá Moreira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Thalita Araujo Costa | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Thalita Araujo Costa' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Theo do Nascimento Barros Peres | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Theo do Nascimento Barros Peres' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Théo Dos Santos Machado Weiss | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Théo Dos Santos Machado Weiss' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Theo Marinho Cobas | CSV: Musicalização Preparatória | Correto: Musicalização Infantil T (4)
  UPDATE alunos SET curso_id = 4
  WHERE nome = 'Theo Marinho Cobas' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 4;

  -- Thoth dos Anjos de Oliveira | CSV: Musicalização para Bebês | Correto: Musicalização para Bebês T (2)
  UPDATE alunos SET curso_id = 2
  WHERE nome = 'Thoth dos Anjos de Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 2;

  -- Tito Lapa Cazarim | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Tito Lapa Cazarim' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Valentina Natividade de Sá Macedo | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Valentina Natividade de Sá Macedo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Vicente Graça Vianna | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Vicente Graça Vianna' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Victor de Azevedo Pacheco | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Victor de Azevedo Pacheco' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Vinicius Cunha Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Vinicius Cunha Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Vitor Hugo Carvalho de Castro | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'Vitor Hugo Carvalho de Castro' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

  -- Vitoria da Luz | CSV: Canto | Correto: Canto T (6)
  UPDATE alunos SET curso_id = 6
  WHERE nome = 'Vitoria da Luz' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 6;

  -- Vivian Dangelo | CSV: Teclado | Correto: Teclado T (16)
  UPDATE alunos SET curso_id = 16
  WHERE nome = 'Vivian Dangelo' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 16;

  -- Wanessa Monte Caporali | CSV: Piano | Correto: Piano T (18)
  UPDATE alunos SET curso_id = 18
  WHERE nome = 'Wanessa Monte Caporali' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 18;

  -- William Gaspar da Silva Oliveira | CSV: Bateria | Correto: Bateria T (27)
  UPDATE alunos SET curso_id = 27
  WHERE nome = 'William Gaspar da Silva Oliveira' 
    AND unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    AND created_at::date = '2026-01-09'
    AND curso_id != 27;

-- ═══════════════════════════════════════════════════════════════
-- RESUMO: 911 alunos verificados
-- Apenas alunos com curso_id diferente do correto serão atualizados
-- A cláusula "AND curso_id != X" evita updates desnecessários
-- ═══════════════════════════════════════════════════════════════

COMMIT;
