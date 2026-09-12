# Sol — auditoria do envelope de mídia e resolvedor de evidências V1

Data: 12/09/2026  
Escopo: runtime do Caixa da Sol, sem escrita financeira, sem ampliação de unidade e sem ativação do 3º andar.

## Conclusão da auditoria

A hipótese do Alf estava correta: imagem e legenda **já convergiam no mesmo fluxo operacional**. O bridge entrega corpo/legenda e mídia no mesmo evento; o Caixa anexa também a bolha irmã recente, executa OCR/visão e mantém o envelope estruturado usado pelo agent-first e persistido no preview V3.

Portanto, não foi criado outro envelope de transporte.

A lacuna real era a arbitragem interna: legenda, OCR, visão, banco e LLM ainda escolhiam campos por guards espalhados. A forma de pagamento e a competência já tinham precedências locais, mas não existia um contrato único que registrasse, por campo, fonte, confiança, conflito e evidências descartadas.

## Evolução implementada

O envelope existente ganhou uma seção de evidências, sem texto bruto adicional:

1. correção humana explícita;
2. texto humano explícito;
3. documento inequívoco;
4. banco/cadastro canônico;
5. OCR;
6. visão probabilística;
7. LLM.

Regras:

- fonte mais fraca só preenche lacuna;
- duas evidências diferentes no mesmo nível superior geram conflito;
- divergências entre a decisão atual e a política nova são registradas somente por nome de campo, sem valor ou PII no log;
- hashes referenciam legenda e OCR sem persistir o texto bruto em `source_refs`;
- correção humana posterior vence o estado humano anterior;
- o mesmo resolvedor observa agent-first e legado de mídia.

## Estado operacional

A política nova nasce em shadow e usa a lista do canário como escopo padrão. Ela não altera preview, aprovação, escrita, fatura, valor, forma, aluno, categoria ou competência. O trilho financeiro atual continua sendo a autoridade até que os replays e casos vivos sejam reconciliados.

## Corpus sanitizado conjunto

O corpus V1 contém casos de Sol e Maria sem nomes reais, telefones, IDs ou texto bruto:

- Pix humano contra cartão inferido por OCR/LLM;
- valor humano contra OCR com erro de escala;
- competência humana contra palpite da LLM;
- correção humana contra estado anterior;
- duas formas humanas conflitantes;
- LLM preenchendo campo vazio;
- data da Maria lida como 02/09 no cabeçalho e 12/09 no corpo: conflito, nunca escolha silenciosa.

Arquivos de prova:

- `tests/sol-runtime/evidence-corpus-v1.json`;
- `tests/sol-runtime/evidence-resolver-e2e.cjs`;
- `tests/sol-runtime/agent-first-envelope-e2e.cjs`;
- `tests/sol-runtime/pix-legenda-humana-precede-ocr-e2e.cjs`.

## Gate de promoção

Antes de transformar a política em autoridade:

1. promover somente o shadow no Recreio;
2. observar casos reais e comparar divergências/conflitos;
3. revisar todo conflito com corpus/regressão;
4. exigir zero regressão financeira e nenhuma escolha silenciosa;
5. promover campo por campo, com rollback, nunca por troca global.
