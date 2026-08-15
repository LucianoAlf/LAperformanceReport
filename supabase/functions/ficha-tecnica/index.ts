// Ficha Tecnica LA — Edge Function (v2)
//
// GET  ?action=resolver&token=...  -> quem e a pessoa + o que falta + perguntas
// POST ?action=submit&token=...    -> grava Bloco A + B + D, calcula no servidor
// POST ?action=rider&token=...     -> salva/atualiza o Rider (sempre editavel)
//
// O banco de perguntas mora aqui. O cliente recebe as opcoes ja embaralhadas
// com um id opaco e devolve so o id escolhido. O gabarito nunca sai daqui.
//
// CORRECOES DA v2:
//  1. O Bloco B agora vai com titulo e texto. Na v1 os pares saiam so com
//     `opcoes`, e o app renderizava 10 telas com enunciado em branco.
//  2. O desempate voltou a ser desempate. Na v1 as 15 respostas do Bloco A
//     entravam no placar, o que quebrava o 4k+1 e trazia de volta o empate
//     que os 13 cenarios existem pra evitar. Agora contam-se apenas os 13
//     fixos; as duas ultimas so entram, e so entre os perfis empatados,
//     quando ha empate de verdade.
//
// Deploy: supabase functions deploy ficha-tecnica --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ORDEM_B,
  ORDEM_D,
  rankingDeterministico,
  validarCargo,
  validarEscolhas,
} from './logic.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// BLOCO A — temperamento. Gabarito: A=Slash, B=Cazuza, C=Amy, D=Frank.
// 13 cenarios fixos (13 = 4k+1) + 2 de desempate.
// Regra de conteudo: as quatro opcoes descrevem alguem que faz um bom
// atendimento na LA. A diferenca e o COMO, nunca o quanto a pessoa se importa.
// ---------------------------------------------------------------------------
type Cenario = { t: string; q: string; o: [string, string, string, string] };

const BLOCO_A: Record<string, Cenario[]> = {
  ATENDIMENTO: [
    { t: 'A semana que comeca cheia', q: 'Segunda-feira, tem coisa acumulada de todo lado: matricula pra lancar, tres responsaveis pra retornar, o financeiro cobrando um relatorio. Por onde voce comeca?', o: [
      'Comeco pelas pessoas — retorno os responsaveis primeiro, porque conversa parada trava tudo',
      'Ataco o que e mais urgente e vou riscando da lista, um atras do outro',
      'Organizo tudo numa lista antes de encostar em qualquer coisa, pra nao deixar nada passar',
      'Vou numa por vez, no meu ritmo, sem atropelar — no fim do dia sai tudo' ] },
    { t: 'O responsavel irritado', q: 'Um responsavel chega no balcao irritado porque a aula do filho foi remarcada e ninguem avisou.', o: [
      'Acolho, puxo conversa, uso o jeito pra ele sair dali mais leve do que entrou',
      'Peco desculpa direto, ja ofereco a solucao e resolvo na hora',
      'Escuto tudo, anoto o que aconteceu e vou atras de entender onde a comunicacao falhou',
      'Deixo ele falar ate o fim sem interromper, mantenho a calma e trago a temperatura pra baixo' ] },
    { t: 'O erro que ja saiu', q: 'Voce percebe que errou o lancamento de uma matricula e o erro ja saiu daqui.', o: [
      'Aviso na hora, sem drama, e ja chamo quem precisa ajudar a consertar',
      'Corrijo primeiro, aviso depois — o importante e o erro parar de andar',
      'Reviso tudo pra entender exatamente onde escorreguei antes de falar com alguem',
      'Comunico com calma, assumo, e sigo com cuidado redobrado no resto do dia' ] },
    { t: 'O feedback da gerencia', q: 'A gerencia te da um feedback de que voce andou deixando responsavel sem retorno.', o: [
      'Converso ali mesmo sobre isso, pergunto exemplos, gosto de resolver falando',
      'Anoto o ponto e ja mudo a partir da proxima ligacao',
      'Levo pra casa, remoo bastante e volto com um jeito novo de organizar',
      'Escuto ate o fim sem me justificar e vou ajustando aos poucos' ] },
    { t: 'A cobranca delicada', q: 'E hora de cobrar uma mensalidade atrasada de uma familia que voce conhece bem.', o: [
      'Puxo assunto antes, falo do aluno, e trago a cobranca no meio da conversa',
      'Vou direto ao ponto, com respeito, e ja ofereco as opcoes de pagamento',
      'Preparo antes o que vou dizer e confiro o historico pra nao errar nenhum dado',
      'Falo com jeito, sem pressa, e escuto a situacao da familia antes de insistir' ] },
    { t: 'O professor que faltou', q: 'Chega uma demanda inesperada bem na hora do movimento: professor faltou e tem cinco alunos chegando.', o: [
      'Chamo todo mundo pra resolver junto e vou segurando o clima com os pais',
      'Assumo o comando, decido rapido o que fazer com cada aluno e executo',
      'Verifico a grade, vejo o que e possivel remarcar sem prejudicar ninguem e comunico certinho',
      'Vou resolvendo um de cada vez, com calma, sem deixar o nervosismo pegar' ] },
    { t: 'A reuniao de equipe', q: 'Numa reuniao de equipe do atendimento, qual e sua postura mais comum?', o: [
      'Falo bastante, jogo ideia, animo o pessoal',
      'Vou direto no problema e proponho o que fazer',
      'Presto atencao nos detalhes, anoto e trago pontos que ninguem viu',
      'Escuto todo mundo, e quando falo e pra costurar as opinioes' ] },
    { t: 'O colega afogado', q: 'Um colega do atendimento esta afogado e te pede ajuda, mas voce tambem esta cheio.', o: [
      'Topo na hora — depois eu me viro com o meu',
      'Ajudo no que destrava ele rapido e volto pro meu',
      'Ajudo, mas explico o passo a passo pra nao acontecer de novo',
      'Ajudo com tranquilidade, encaixando no meu ritmo sem virar bagunca' ] },
    { t: 'O processo furado', q: 'Voce percebe que um processo da recepcao esta furado — sempre da o mesmo problema.', o: [
      'Levanto o assunto com o time pra achar a solucao junto',
      'Ja mudo o jeito de fazer e mostro depois que funcionou',
      'Documento os casos, junto os dados e proponho o ajuste com base neles',
      'Comunico a lideranca e sigo o que for definido, sem criar atrito' ] },
    { t: 'O comentario sobre quem nao esta', q: 'Surge um comentario sobre um colega que nao esta presente.', o: [
      'Entro na conversa com bom humor, sem deixar ficar pesado',
      'Corto e digo que isso e pra falar com a pessoa direto',
      'Escuto calado, fico pensando naquilo depois, mas nao me envolvo',
      'Mudo de assunto ou saio de fininho, pra manter o clima leve' ] },
    { t: 'O fechamento do mes', q: 'Como voce lida com o fechamento do mes, com prazo em cima?', o: [
      'Trabalho melhor com gente por perto, conversando enquanto faco',
      'Acelero e entrego — pressao ate me ajuda a render',
      'Fico mais tenso, mas confiro tudo duas vezes antes de fechar',
      'Mantenho o mesmo ritmo de sempre e vou entregando sem alarde' ] },
    { t: 'A renovacao em duvida', q: 'Um responsavel esta em cima do muro sobre renovar a matricula do filho.', o: [
      'Falo da evolucao do aluno com entusiasmo e trago ele pelo emocional',
      'Pergunto direto qual e a objecao e resolvo aquilo',
      'Levanto o historico do aluno e apresento os fatos que mostram o progresso',
      'Dou espaco, escuto o que esta pesando e vou conduzindo sem pressionar' ] },
    { t: 'Os arquivos da recepcao', q: 'Como voce organiza os arquivos, contratos e documentos da recepcao?', o: [
      'Deixo a mao do jeito que eu acho rapido, mesmo que nao fique perfeito',
      'Organizo o que uso muito e o resto fica pra quando sobrar tempo',
      'Tudo nomeado, datado e em ordem — eu acho qualquer coisa em segundos',
      'Mantenho uma logica simples que funciona sempre igual' ] },
  ],
  PROFESSOR: [
    { t: 'O aluno novo', q: 'É a primeira aula de um aluno que acabou de se matricular. Ele está visivelmente tímido. Como você abre a aula?', o: [
      'Puxa um assunto leve, propõe tocar algo simples junto pra quebrar o gelo e deixa a música criar a conexão naturalmente',
      'Pergunta o que ele quer aprender, que músicas gosta, e já traça um mini plano ali na hora pra ele sair da primeira aula com direção',
      'Começa devagar, faz perguntas sobre a história dele com música, escuta com atenção e vai sentindo o ritmo dele antes de propor qualquer atividade',
      'Apresenta como a aula funciona, explica a rotina e o que ele pode esperar das próximas semanas. Deixa ele confortável sabendo como é o processo' ] },
    { t: 'O aluno que não praticou', q: 'O aluno chega e fica claro nos primeiros minutos que ele não estudou desde a última aula. Como você lida?', o: [
      'Pratica junto com ele ali na aula pra compensar, mas no final da aula conversa sobre como encaixar o estudo na rotina da semana — mostra que a evolução depende disso',
      'Pergunta o que aconteceu, reforça que sem prática o processo trava e ajusta a meta da aula pra garantir que o tempo seja produtivo mesmo assim',
      'Investiga o porquê — pode ser dificuldade no conteúdo, desconexão com o repertório ou falta de rotina. Usa a resposta pra ajustar a abordagem e prevenir que se repita',
      'Retoma o conteúdo da aula anterior pra reforçar a ancoragem e ao final combina com ele uma forma realista de praticar durante a semana, criando um compromisso juntos' ] },
    { t: 'A aula que saiu do plano', q: 'Você preparou uma aula focada em técnica, mas o aluno chegou empolgado querendo tocar uma música que ouviu. A música está acima do nível atual dele. Como você lida?', o: [
      'Valoriza a empolgação dele, coloca a música pra ouvirem juntos e mostra que o que estão trabalhando na aula é exatamente o que vai levar ele até lá. Usa a música como meta futura e motivação pro conteúdo de agora',
      'Reconhece o interesse, mas é direto: explica que pra chegar naquela música ele precisa ancorar o que estão trabalhando agora. Mostra o caminho objetivo entre o ponto atual e aquela música',
      'Escuta a música com ele, analisa os elementos técnicos dela e identifica junto com o aluno quais fundamentos ele já tem e quais ainda precisa construir. Transforma a música em mapa de evolução',
      'Acolhe o interesse, anota a música como referência pro repertório futuro e redireciona pra aula planejada com tranquilidade, mostrando que cada etapa tem seu momento dentro do processo' ] },
    { t: 'Feedback de execução', q: 'O aluno toca um trecho inteiro, mas com alguns erros técnicos. Como você dá o retorno?', o: [
      'Destaca o que saiu bem primeiro pra manter a confiança, e propõe os ajustes de forma envolvente: “ficou massa, agora bora deixar essa parte aqui afiada”',
      'Aponta exatamente o que precisa corrigir, de forma objetiva. Mostra onde errou, como deveria ser, e propõe repetir até sair limpo',
      'Analisa os detalhes — postura, articulação, dinâmica — e explica o porquê de cada ajuste. Quer que o aluno entenda a lógica por trás da correção',
      'Reconhece o esforço, depois apresenta o ajuste de forma gradual. Propõe trabalhar o trecho com consistência, sem pressa de acertar tudo de uma vez' ] },
    { t: 'O aluno travado', q: 'O aluno está há semanas tentando passar de um trecho e não consegue. Está visivelmente frustrado. O que você faz?', o: [
      'Muda a abordagem: propõe trabalhar o trecho de um ângulo diferente, traz uma variação criativa pra ele reencontrar o prazer antes de atacar a dificuldade de novo',
      'Isola o problema com precisão: identifica exatamente onde trava, cria um exercício específico pra aquilo e define uma meta clara de curto prazo',
      'Para e investiga. Tenta entender o que está gerando o travamento — se é técnico, emocional ou de expectativa. Às vezes o problema não é o trecho, é o que está por trás',
      'Diminui a pressão sem diminuir o objetivo. Volta um passo pra ele sentir que domina algo, recupera a confiança, e depois retoma o trecho com mais segurança' ] },
    { t: 'Aula em grupo', q: 'Numa aula com 4 alunos, dois estão mais avançados e dois estão ficando pra trás. Como você conduz?', o: [
      'Cria uma atividade onde os níveis se complementam — cada um com uma função diferente na mesma música, como numa banda. Todo mundo toca, todo mundo contribui',
      'Divide tarefas por nível: os avançados recebem um desafio extra enquanto você dedica atenção aos que precisam de reforço. Ninguém fica parado',
      'Analisa por que os dois estão atrás — pode ser ritmo de aprendizado diferente, não falta de capacidade. Ajusta o conteúdo pra que cada um absorva no seu nível',
      'Mantém o grupo junto no mesmo conteúdo, dosando a complexidade: os avançados tocam a versão completa, os outros uma versão adaptada. Ninguém se sente excluído' ] },
    { t: 'O responsável quer saber', q: 'A mãe de um aluno te aborda depois da aula e pergunta: “como meu filho tá indo?” Como você responde?', o: [
      'Compartilha com entusiasmo os momentos em que o aluno se destacou, mostra o que ele está curtindo e como isso está puxando a evolução dele',
      'É direto e objetivo: diz onde o aluno está na jornada, o que já conquistou, o que precisa melhorar e o que espera pro próximo período',
      'Dá um retorno detalhado: fala sobre o progresso técnico, o comportamento na aula, o que percebeu de mudança e o que acha que pode ser trabalhado em casa',
      'Contextualiza o momento do aluno dentro do processo, mostra que ele está caminhando e reforça o que pode ser feito em casa pra sustentar a evolução' ] },
    { t: 'O aluno que desafia', q: 'Um aluno mais velho questiona sua abordagem: “por que eu preciso aprender isso? Isso é chato.” Como você reage?', o: [
      'Usa a prática pra provar o ponto — toca um exemplo que mostre onde aquele fundamento aparece numa música que ele gosta. Faz ele ver sentido pelo ouvido, não pela teoria',
      'Explica de forma firme e direta: “porque isso é a base pra você fazer o que quer fazer. Sem isso, você trava lá na frente.” Não recua da importância do conteúdo',
      'Escuta a reclamação e investiga: por que não está fazendo sentido? Talvez o conteúdo precise ser apresentado de outro jeito, ou conectado com algo que o aluno valorize',
      'Explica com calma onde aquele conteúdo se encaixa na jornada, por que está ali e como vai ser útil mais pra frente. Sem confronto, com clareza' ] },
    { t: 'A preparação da aula', q: 'Como você normalmente se prepara pra dar aula?', o: [
      'Prepara a estrutura e o conteúdo, mas deixa espaço pra adaptar conforme o aluno responde. Gosta de usar a energia do momento pra tornar o conteúdo mais vivo',
      'Planeja com objetivos claros: sabe o que quer que o aluno conquiste no final daquela aula. Se não atingiu, registra e ajusta a rota pra próxima',
      'Prepara com detalhe: pensa na sequência didática, nos exercícios, nos possíveis pontos de dificuldade. Gosta de estar pronto pra qualquer pergunta ou situação',
      'Segue uma estrutura de aula consistente que funciona e dá segurança ao processo. Não muda sem um bom motivo. O aluno sabe o que esperar e isso sustenta a evolução' ] },
    { t: 'A apresentação', q: 'Faltam duas semanas pra uma apresentação. Seu aluno está quase pronto mas ainda tem pontos a ajustar. Como você conduz?', o: [
      'Trabalha os ajustes mas investe em fazer ele se sentir confiante e empolgado pra subir no palco. A energia certa na apresentação potencializa o que ele já ancorou',
      'Intensifica com foco: define exatamente o que precisa ajustar, cria um plano de ensaio com metas por aula e acompanha a execução de perto',
      'Trabalha cada detalhe com cuidado. Revisa dinâmica, expressão, postura. Quer que ele suba sabendo que entregou o melhor de si',
      'Reforça o que já está sólido pra dar segurança e trabalha os ajustes sem criar ansiedade. O aluno precisa subir confiante no que ancorou, não pressionado pelo que falta' ] },
    { t: 'O erro na hora', q: 'No meio de uma atividade, você percebe que errou uma informação que passou ao aluno. Como você lida?', o: [
      'Corrige na hora de forma natural: “opa, errei aqui — o certo é assim” e segue. Mostra que errar faz parte e que o importante é corrigir rápido',
      'Corrige imediatamente e de forma clara. Explica o certo e se certifica que o aluno entendeu a versão correta antes de continuar. Não deixa a informação errada ficar',
      'Para, corrige e contextualiza: explica por que a informação correta é assim e o que muda na prática. Aproveita o erro como oportunidade de aprofundar o entendimento',
      'Corrige com naturalidade, reposiciona a informação certa no fluxo da aula e segue sem criar constrangimento. Mantém a estabilidade do ambiente' ] },
    { t: 'O final de semestre', q: 'Você olha pro progresso de um aluno ao longo do semestre. O que te dá mais satisfação?', o: [
      'Ver que ele se conectou com a música de verdade — está curtindo, trazendo referências, querendo tocar cada vez mais. A paixão pelo instrumento acendeu',
      'Ver resultado concreto: ele saiu de um ponto A e chegou num ponto B claro. Toca o que não tocava, entende o que não entendia. Evolução mensurável',
      'Ver que ele evoluiu com qualidade e consciência. Não só aprendeu, mas aprendeu direito — com fundamento, entendendo o que está fazendo e por quê',
      'Ver que ele criou uma relação consistente com o instrumento, confia no processo, mantém a rotina de estudo e se sente seguro pra continuar evoluindo' ] },
    { t: 'O colega pediu ajuda', q: 'Um colega professor te pede pra substituir uma aula dele. Você não conhece o aluno. Como você aborda?', o: [
      'Se apresenta com energia, propõe tocar algo junto pra sentir o nível do aluno na prática e constrói a aula a partir do que percebe ali, mantendo o clima positivo',
      'Pede informações antes: onde o aluno está na jornada, o que está trabalhando, qual o marco atual. Prepara uma aula produtiva mesmo sendo substituto',
      'Lê os relatórios do aluno com atenção, entende o histórico e o momento dele na jornada, e se prepara pra dar continuidade ao que o professor titular vinha construindo',
      'Se apresenta com tranquilidade, explica que está substituindo, pergunta ao aluno o que estavam trabalhando e dá sequência com calma, mantendo a estabilidade do processo' ] },
  ],
};

const DESEMPATE_A: Record<string, Cenario[]> = {
  ATENDIMENTO: [
    { t: 'Fim de um dia dificil', q: 'No fim de um dia dificil no atendimento, o que mais te da satisfacao?', o: [
      'Ter deixado o ambiente e as pessoas bem',
      'Ter resolvido tudo o que apareceu',
      'Ter feito cada coisa com capricho, sem furo',
      'Ter atravessado o dia sem que ninguem se estressasse' ] },
    { t: 'O que mais incomoda', q: 'O que mais te incomoda no ambiente administrativo?', o: [
      'Ficar sozinho, sem contato com ninguem',
      'Depender dos outros pra terminar o que e meu',
      'Ver algo entregue de qualquer jeito',
      'Discussao e clima pesado' ] },
  ],
  PROFESSOR: [
    { t: 'A aula ideal', q: 'Se você pudesse montar a aula perfeita, como ela seria?', o: [
      'Uma aula viva: professor e aluno tocando juntos, experimentando, criando a partir do conteúdo. O fundamento entra pela prática, pelo ouvido e pela experiência',
      'Uma aula com meta clara: objetivo definido, execução focada, resultado mensurável. O aluno sai sabendo exatamente o que conquistou naquele dia',
      'Uma aula com tempo pra aprofundar um assunto só: destrinchar cada camada, sair com domínio real daquele fundamento — mesmo que o avanço pareça pequeno',
      'Uma aula com estrutura organizada, clima seguro e o aluno evoluindo com consistência no seu ritmo, sentindo que cada passo foi bem construído' ] },
    { t: 'O que te frustra', q: 'O que mais te incomoda no dia a dia como professor?', o: [
      'Aula sem vida. Quando a aula fica mecânica e repetitiva, sem energia — o aluno desconecta da música e o conteúdo perde sentido',
      'Falta de progresso. Quando o aluno fica semanas no mesmo ponto e o processo para — sinto que preciso encontrar outro caminho, mas me incomoda a estagnação',
      'Superficialidade. Quando o aluno quer só tocar por cima sem entender o que está fazendo — sinto que estou entregando menos do que a jornada pede',
      'Instabilidade. Quando o ambiente fica desorganizado, com mudanças bruscas que quebram o ritmo do processo e tiram a confiança do aluno' ] },
  ],
};

const CANONICA_A = ['A', 'B', 'C', 'D'] as const;
const TEMPERAMENTO: Record<string, string> = { A: 'SLASH', B: 'CAZUZA', C: 'AMY', D: 'FRANK' };
const ORDEM_FALLBACK = ['CAZUZA', 'AMY', 'FRANK', 'SLASH']; // ultimo criterio, deterministico

// ---------------------------------------------------------------------------
// BLOCO B — linguagem de valorizacao.
// 5 categorias combinadas duas a duas = exatamente 10 pares; cada categoria
// aparece 4 vezes. O placar nasce equilibrado por construcao.
// PAL palavras | TEM tempo dedicado | APO atos de apoio
// SIM simbolo/presente | CEL celebracao e proximidade
// ---------------------------------------------------------------------------
type Par = { t: string; a: [string, string]; b: [string, string] };

// O `t` e so um rotulo de tela. Nao nomeia o instrumento nem a categoria.
const BLOCO_B: Par[] = [
  { t: 'O que pesa mais', a: ['PAL', 'Receber um "mandou muito bem nisso" especifico, na frente do time'], b: ['TEM', 'O gestor sentar 15 minutos so pra ouvir como voce esta'] },
  { t: 'Num dia pesado', a: ['APO', 'Alguem pegar uma tarefa da sua mao num dia pesado'], b: ['SIM', 'Ganhar uma lembranca que mostre que pensaram em voce'] },
  { t: 'Quando da certo', a: ['CEL', 'O time comemorar junto quando a meta bate'], b: ['PAL', 'Uma mensagem escrita reconhecendo seu trabalho'] },
  { t: 'Vindo da lideranca', a: ['TEM', 'Ter um tempo reservado so seu com a lideranca'], b: ['APO', 'Alguem aparecer e perguntar "o que eu faco pra te ajudar?"'] },
  { t: 'Depois de uma semana dura', a: ['SIM', 'Um mimo inesperado pelo esforco da semana'], b: ['CEL', 'Um abraco ou um toca aqui na hora que deu certo'] },
  { t: 'Numa conquista da unidade', a: ['PAL', 'Ser citado pelo nome numa conquista da unidade'], b: ['APO', 'Alguem resolver por voce aquela pendencia travada'] },
  { t: 'Fora da correria', a: ['TEM', 'Um cafe com o gestor pra conversar sem pauta'], b: ['CEL', 'Uma comemoracao junto com o time quando da certo'] },
  { t: 'Marcando uma entrega', a: ['SIM', 'Receber algo simbolico que marque uma entrega sua'], b: ['PAL', 'Ouvir da lideranca, olhando no olho, que voce fez diferenca'] },
  { t: 'Na hora do aperto', a: ['APO', 'Alguem ficar ate mais tarde pra te ajudar a fechar'], b: ['CEL', 'Sentir a energia do time celebrando com voce'] },
  { t: 'Sentir que te conhecem', a: ['SIM', 'Um presente pequeno que mostre que te conhecem'], b: ['TEM', 'Atencao exclusiva de quem te lidera, sem pressa'] },
];

const ENUNCIADO_B = 'Pensando no seu dia a dia na escola, marque a opcao que faria mais diferenca pra voce.';

const VALORIZACAO: Record<string, string> = {
  PAL: 'PALAVRAS', TEM: 'TEMPO', APO: 'APOIO', SIM: 'SIMBOLO', CEL: 'CELEBRACAO',
};

// ---------------------------------------------------------------------------
// BLOCO D — fit cultural. Escolha forcada entre dois valores da LA, os dois
// defensaveis. Nao existe resposta bonita: o que a pessoa escolhe revela
// prioridade, e o que ela larga revela mais ainda.
// COR coragem | EMP empatia | EXC excelencia | PAI paixao
// ---------------------------------------------------------------------------
type ParValor = { t: string; q: string; a: [string, string]; b: [string, string] };

const BLOCO_D: ParValor[] = [
  { t: 'A colega que caiu de rendimento',
    q: 'Uma colega esta entregando abaixo do que consegue, e voce sabe que ela esta num momento dificil em casa. A gestora te pergunta como esta o time.',
    a: ['COR', 'Falo o que estou vendo, mesmo sabendo que vai pesar pra ela agora'],
    b: ['EMP', 'Seguro, dou um tempo pra ela se recuperar, e ajudo no que der'] },

  { t: 'O erro no material impresso',
    q: 'Falta uma hora pro evento e voce percebe um erro no material que ja foi impresso.',
    a: ['COR', 'Aponto na hora e aceito o incomodo de parar tudo'],
    b: ['EXC', 'Corrijo o que der sozinha e refaco direito depois, sem travar o evento'] },

  { t: 'O processo novo que voce acha pior',
    q: 'A escola vai adotar um processo novo que voce acha pior que o atual.',
    a: ['COR', 'Falo abertamente que discordo, na reuniao, na frente de todos'],
    b: ['PAI', 'Abraco e faco funcionar do melhor jeito, e trago os problemas depois com dados'] },

  { t: 'O relatorio que nunca vem completo',
    q: 'Um professor entrega o relatorio de aula sempre atrasado e sempre incompleto. Ele e querido pelos alunos.',
    a: ['EXC', 'Puxo o padrao: incompleto volta pra ele refazer'],
    b: ['EMP', 'Entendo o que esta travando e ajudo ele a chegar la no ritmo dele'] },

  { t: 'A ultima energia do dia',
    q: 'Fim de um dia caotico. Sobrou energia pra uma coisa so.',
    a: ['EMP', 'Fico ouvindo a colega que teve um dia horrivel'],
    b: ['PAI', 'Termino a ideia que me empolgou e que vai melhorar a semana toda'] },

  { t: 'Bem feito ou logo',
    q: 'Voce teve uma ideia boa pra recepcao, mas fazer bem feito levaria tres semanas.',
    a: ['EXC', 'Faco a versao bem-acabada, mesmo demorando'],
    b: ['PAI', 'Coloco de pe a versao simples essa semana e vou lapidando'] },
];

const VALORES: Record<string, string> = {
  COR: 'CORAGEM', EMP: 'EMPATIA', EXC: 'EXCELENCIA', PAI: 'PAIXAO',
};

// ---------------------------------------------------------------------------
// BLOCO C — Rider. Texto livre, tudo opcional, sempre editavel.
// ---------------------------------------------------------------------------
const RIDER_CAMPOS = [
  { id: 'rende_mais',      grupo: 'Como eu trabalho',  label: 'Eu rendo mais quando...' },
  { id: 'me_atrapalha',    grupo: 'Como eu trabalho',  label: 'O que mais me atrapalha ou me tira do sério é...' },
  { id: 'melhor_horario',  grupo: 'Como eu trabalho',  label: 'Meu melhor horário do dia é...' },
  { id: 'como_chamar',     grupo: 'Como falar comigo', label: 'A melhor forma de me chamar pra alguma coisa é...' },
  { id: 'quando_quieto',   grupo: 'Como falar comigo', label: 'Quando eu fico quieto, geralmente significa que...' },
  { id: 'entendem_errado', grupo: 'Como falar comigo', label: 'O que as pessoas costumam entender errado sobre mim é...' },
  { id: 'feedback',        grupo: 'Feedback',          label: 'Eu prefiro receber feedback assim...' },
  { id: 'quando_erro',     grupo: 'Feedback',          label: 'Quando eu erro, o que mais me ajuda é...' },
  { id: 'tempo_livre',     grupo: 'Fora do trabalho',  label: 'No meu tempo livre eu...' },
  { id: 'habilidade',      grupo: 'Fora do trabalho',  label: 'Uma habilidade minha que quase ninguém aqui conhece é...' },
  { id: 'musica',          grupo: 'Fora do trabalho',  label: 'Se fosse escolher uma música pra tocar quando eu chego, seria...' },
  { id: 'quero_aprender',  grupo: 'Fora do trabalho',  label: 'O que eu quero aprender ou desenvolver esse ano é...' },
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function embaralhar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ranking(contagem: Record<string, number>, ordem: readonly string[] = ORDEM_FALLBACK) {
  return rankingDeterministico(contagem, ordem);
}

/**
 * Resolve o placar do Bloco A.
 * Conta SOMENTE os 13 cenarios fixos. As respostas de desempate entram como
 * voto de minerva, e so entre os perfis que empataram — primeiro no primario,
 * depois no secundario. Se ainda assim empatar, cai na ORDEM_FALLBACK.
 */
function resolverTemperamento(
  votosFixos: string[],      // temperamentos das 13 primeiras
  votosDesempate: string[],  // temperamentos das 2 ultimas
) {
  const cont: Record<string, number> = { SLASH: 0, CAZUZA: 0, AMY: 0, FRANK: 0 };
  votosFixos.forEach((t) => cont[t]++);

  const aplicar = (empatados: string[]) => {
    const extra = { ...cont };
    votosDesempate.forEach((t) => { if (empatados.includes(t)) extra[t] += 0.5; });
    return extra;
  };

  let placar = { ...cont };
  let r = ranking(placar);

  // empate no primario
  const empPrim = r.filter(([, v]) => v === r[0][1]).map(([k]) => k);
  if (empPrim.length > 1) { placar = aplicar(empPrim); r = ranking(placar); }

  const primario = r[0][0];

  // empate no secundario, entre os que sobraram
  const resto = r.slice(1);
  const empSec = resto.filter(([, v]) => v === resto[0][1]).map(([k]) => k);
  if (empSec.length > 1) {
    const placar2 = aplicar(empSec);
    delete (placar2 as Record<string, number>)[primario];
    const r2 = ranking(placar2);
    return { primario, secundario: r2[0][0], contagem: cont };
  }

  return { primario, secundario: resto[0][0], contagem: cont };
}

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function lerToken(sb: ReturnType<typeof db>, token: string | null) {
  if (!token) return { erro: 'token ausente' };
  const { data, error } = await sb
    .from('ficha_tokens')
    .select('id, token, colaborador_id, cargo_contexto, usado_em, ativo, colaboradores(id, nome, apelido, unidade_id, situacao, temperamento_codinome)')
    .eq('token', token)
    .maybeSingle();
  if (error) return { erro: error.message };
  if (!data || !data.ativo) return { erro: 'token invalido' };
  return { tk: data };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const token = url.searchParams.get('token');
    const sb = db();

    const { tk, erro } = await lerToken(sb, token);
    if (erro || !tk) return json({ error: erro || 'token invalido' }, 401);

    const cargo = tk.cargo_contexto;
    const colaborador = Array.isArray(tk.colaboradores) ? tk.colaboradores[0] : tk.colaboradores;
    const fixos = BLOCO_A[cargo];
    const desempates = DESEMPATE_A[cargo];
    try {
      validarCargo(cargo, fixos, desempates);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
    if (!fixos || !desempates) return json({ error: 'cargo sem banco de cenários' }, 400);

    // -----------------------------------------------------------------
    if (action === 'resolver') {
      const { data: rider } = await sb
        .from('colaborador_rider')
        .select('respostas, versao, preenchido_em')
        .eq('colaborador_id', tk.colaborador_id)
        .maybeSingle();

      const diagnosticoFeito = !!tk.usado_em;

      const cenarios = [...fixos, ...desempates];
      const blocoA = cenarios.map((c, i) => ({
        n: i + 1,
        desempate: i >= fixos.length,
        titulo: c.t,
        texto: c.q,
        opcoes: embaralhar(c.o.map((texto, idx) => ({ id: `${i + 1}.${idx}`, texto }))),
      }));

      // v2: pares agora vao com titulo e enunciado, senao a tela sai em branco
      const blocoB = BLOCO_B.map((p, i) => ({
        n: i + 1,
        titulo: p.t,
        texto: ENUNCIADO_B,
        opcoes: embaralhar([
          { id: `${i + 1}.a`, texto: p.a[1] },
          { id: `${i + 1}.b`, texto: p.b[1] },
        ]),
      }));

      // Bloco D — fit cultural. Mesma estrutura do B, com titulo e texto.
      const blocoD = BLOCO_D.map((p, i) => ({
        n: i + 1,
        titulo: p.t,
        texto: p.q,
        opcoes: embaralhar([
          { id: `${i + 1}.a`, texto: p.a[1] },
          { id: `${i + 1}.b`, texto: p.b[1] },
        ]),
      }));

      return json({
        colaborador: { id: colaborador?.id, nome: colaborador?.apelido || colaborador?.nome, codinome: colaborador?.temperamento_codinome || null },
        cargo_contexto: cargo,
        diagnostico_feito: diagnosticoFeito,
        bloco_a: diagnosticoFeito ? [] : blocoA,
        bloco_b: diagnosticoFeito ? [] : blocoB,
        bloco_d: diagnosticoFeito ? [] : blocoD,
        rider_campos: RIDER_CAMPOS,
        rider_respostas: rider?.respostas ?? {},
        rider_versao: rider?.versao ?? 0,
      });
    }

    // -----------------------------------------------------------------
    if (action === 'submit' && req.method === 'POST') {
      if (tk.usado_em) return json({ error: 'diagnostico ja respondido' }, 409);

      const body = await req.json();
      const escolhasA: string[] = body?.bloco_a ?? []; // ["1.2", "2.0", ...]
      const escolhasB: string[] = body?.bloco_b ?? []; // ["1.a", "2.b", ...]
      const escolhasD: string[] = body?.bloco_d ?? []; // ["1.a", "2.b", ...]

      const totalA = fixos.length + desempates.length;
      try {
        validarEscolhas({
          fixosCount: fixos.length,
          desempatesCount: desempates.length,
          blocoBCount: BLOCO_B.length,
          blocoDCount: BLOCO_D.length,
          escolhasA,
          escolhasB,
          escolhasD,
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }

      // Bloco A — id opaco -> letra canonica -> temperamento
      const votosFixos: string[] = [];
      const votosDesempate: string[] = [];
      const respostasA = escolhasA.map((esc) => {
        const [nStr, idxStr] = esc.split('.');
        const n = Number(nStr), idx = Number(idxStr);
        const canonica = CANONICA_A[idx];
        const temp = TEMPERAMENTO[canonica];
        if (n <= fixos.length) votosFixos.push(temp); else votosDesempate.push(temp);
        return {
          pergunta_numero: n,
          opcao_canonica: canonica,
          resposta_posicao: idx,
          bloco: 'A',
        };
      });

      // v2: os 13 fixos definem o placar; o desempate so entra se houver empate
      const { primario, secundario, contagem: contA } =
        resolverTemperamento(votosFixos, votosDesempate);

      // Bloco B — id opaco -> categoria
      const contB: Record<string, number> = { PALAVRAS: 0, TEMPO: 0, APOIO: 0, SIMBOLO: 0, CELEBRACAO: 0 };
      const respostasB = escolhasB.map((esc) => {
        const [nStr, lado] = esc.split('.');
        const n = Number(nStr);
        const par = BLOCO_B[n - 1];
        const cat = lado === 'a' ? par.a[0] : par.b[0];
        contB[VALORIZACAO[cat]]++;
        return { pergunta_numero: n, opcao_canonica: cat, resposta_posicao: lado === 'a' ? 0 : 1, bloco: 'B' };
      });

      const rB = ranking(contB, ORDEM_B);
      const codinome = `${primario}/${secundario}`;
      const valPrim = rB[0][0], valSec = rB[1][0];

      // Bloco D — fit cultural. Mesma logica do B: id opaco -> codigo -> valor.
      const contD: Record<string, number> = { CORAGEM: 0, EMPATIA: 0, EXCELENCIA: 0, PAIXAO: 0 };
      const respostasD = escolhasD.map((esc) => {
        const [nStr, lado] = esc.split('.');
        const n = Number(nStr);
        const par = BLOCO_D[n - 1];
        const cod = lado === 'a' ? par.a[0] : par.b[0];
        contD[VALORES[cod]]++;
        return { pergunta_numero: n, opcao_canonica: cod, resposta_posicao: lado === 'a' ? 0 : 1, bloco: 'D' };
      });

      const rD = ranking(contD, ORDEM_D);
      const valPrimarioD = rD[0][0];
      const valSecundarioD = rD[1][0];
      const valSacrificadoD = rD[rD.length - 1][0];

      const { error: e1 } = await sb.rpc('ficha_concluir_tecnica', {
        p_token: token!,
        p_cargo_contexto: cargo,
        p_versao_questionario: 2,
        p_temperamento_primario: primario,
        p_temperamento_secundario: secundario,
        p_temperamento_codinome: codinome,
        p_temperamento_contagem: contA, // placar dos 13 fixos, sem o desempate
        p_valorizacao_primaria: valPrim,
        p_valorizacao_secundaria: valSec,
        p_valorizacao_contagem: contB,
        p_valores_primario: valPrimarioD,
        p_valores_secundario: valSecundarioD,
        p_valores_sacrificado: valSacrificadoD,
        p_valores_contagem: contD,
        p_respostas: [...respostasA, ...respostasB, ...respostasD],
        p_fixos_count: fixos.length,
        p_desempates_count: desempates.length,
        p_bloco_b_count: BLOCO_B.length,
        p_bloco_d_count: BLOCO_D.length,
      });
      if (e1) {
        const mensagem = e1.message || 'falha ao concluir ficha';
        const status = /FICHA_TOKEN_USADO|duplicate key.*ficha_token_id/i.test(mensagem)
          ? 409
          : /^FICHA_(CARGO|RESPOSTAS|PERGUNTA|CONFIGURACAO)/.test(mensagem)
            ? 400
            : 500;
        return json({ error: mensagem }, status);
      }

      return json({ ok: true, codinome, valorizacao: `${valPrim}/${valSec}`, valores: `${valPrimarioD}/${valSecundarioD}` });
    }

    // -----------------------------------------------------------------
    if (action === 'rider' && req.method === 'POST') {
      const body = await req.json();
      const respostas = body.respostas ?? {};
      const permitidos = new Set(RIDER_CAMPOS.map((c) => c.id));
      const limpo: Record<string, string> = {};
      for (const [k, v] of Object.entries(respostas)) {
        if (permitidos.has(k) && typeof v === 'string') limpo[k] = v.slice(0, 2000);
      }

      const { data: atual } = await sb
        .from('colaborador_rider')
        .select('versao')
        .eq('colaborador_id', tk.colaborador_id)
        .maybeSingle();
      const versao = (atual?.versao ?? 0) + 1;

      const { error: e1 } = await sb.from('colaborador_rider').upsert({
        colaborador_id: tk.colaborador_id,
        respostas: limpo,
        versao,
        preenchido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'colaborador_id' });
      if (e1) return json({ error: e1.message }, 500);

      await sb.from('colaborador_rider_versoes').insert({
        colaborador_id: tk.colaborador_id, versao, respostas: limpo,
      });

      return json({ ok: true, versao });
    }

    return json({ error: 'action desconhecida' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
