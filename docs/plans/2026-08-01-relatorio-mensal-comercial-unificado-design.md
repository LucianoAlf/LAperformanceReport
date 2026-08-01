# Relatório mensal comercial unificado

## Objetivo

Unificar a riqueza analítica do relatório mensal comercial anterior com os dados e os vínculos canônicos já usados pelo relatório diário comercial. O botão mensal deve produzir uma única mensagem pública, sem paginação e sem nomenclatura técnica.

## Fonte de verdade e imutabilidade

- Os totais oficiais do mês fechado vêm do fechamento mensal imutável.
- Os detalhes históricos complementam o fechamento, mas não podem alterar os totais oficiais nem fabricar categorias para fechar diferenças.
- Se o total oficial tiver mais registros do que o detalhamento disponível, o relatório informa a cobertura e a diferença explicitamente.
- Para julho de 2026 no Recreio: total oficial de 297 leads, detalhamento histórico de 296 e 1 lead sem detalhe de canal e curso.

## Estrutura aprovada

1. Cabeçalho com unidade, competência e responsável comercial.
2. Resumo geral:
   - leads;
   - experimentais realizadas;
   - presença e vínculo confirmados;
   - faltas;
   - visitas;
   - matrículas comerciais;
   - LAMK e EMLA.
3. Funil com percentual e fração:
   - lead para experimental;
   - experimental para matrícula;
   - lead para matrícula.
4. Valores financeiros:
   - total e ticket médio de passaportes;
   - total e ticket médio das parcelas contratadas.
5. Qualidade dos leads:
   - origem não informada;
   - curso de interesse não informado;
   - cobertura do detalhamento em relação ao total oficial.
6. Distribuições:
   - leads por canal;
   - leads por curso;
   - matrículas por canal;
   - matrículas por curso ou combinação de cursos.
7. Lista detalhada das matrículas, em ordem cronológica, com:
   - aluno e idade;
   - data;
   - todos os cursos da aquisição;
   - professores fixos;
   - professores das experimentais efetivamente realizadas;
   - canal;
   - forma de pagamento, quando informada;
   - passaporte;
   - parcelas individualizadas e somadas quando houver multicurso.
8. Alertas de conciliação somente quando houver pendência real.

## Regras canônicas

- Uma aquisição comercial é contada uma vez, mesmo que o aluno tenha iniciado dois ou mais cursos na mesma aquisição.
- O curso principal qualifica a aquisição; os cursos adicionais elegíveis enriquecem o mesmo registro e seus valores entram no total das parcelas.
- Banda, coral, transferência, bolsista e curso adicional isolado não criam uma nova matrícula comercial.
- A distribuição de matrículas por curso conta a combinação da aquisição uma vez, por exemplo `Teclado e Contrabaixo`, sem transformar uma aquisição em duas conversões.
- Professores experimentais vêm das experimentais realizadas e vinculadas. Na ausência delas, o texto mostra `Não teve`; o professor fixo não substitui automaticamente o experimental.
- As distribuições de leads mostram apenas registros historicamente identificados. Diferenças para o total oficial são apresentadas como cobertura, nunca adicionadas artificialmente a `Não informado`.
- Valores e datas usam formato brasileiro.

## Conteúdo que não entra

- Próximas experimentais e números exclusivamente diários.
- Metas que não estejam preservadas no fechamento da competência.
- Nomes de funções, endpoints, tabelas, versões, snapshots ou outras expressões técnicas.
- Marcadores de paginação como `(1/2)` ou `(2/2)`.
- O estado `BLOQUEADA`; pendências são alertas informativos.

## Critérios de aceite para Recreio, julho de 2026

- Leads: 297; detalhamento: 296 de 297.
- Experimentais realizadas e confirmadas: 41.
- Faltas: 8.
- Visitas: 1.
- Matrículas comerciais: 17, sendo 8 LAMK e 9 EMLA.
- Conversões: 13,8% (41/297), 34,1% (14/41) e 5,7% (17/297).
- Passaportes: R$ 6.170,00; ticket médio: R$ 362,94.
- Parcelas: R$ 7.256,00; ticket médio: R$ 426,82.
- Gabriela da Silva Machado deve aparecer uma vez, com `Teclado e Contrabaixo`, os dois professores fixos e parcelas `R$ 395,00 + R$ 395,00`.
- Carlos Tayrone Mendes Namorato deve ter Erick Cosme da Silva como professor experimental, sem substituição pelo professor fixo.
- O relatório deve ser uma única mensagem e não conter termos técnicos internos.
