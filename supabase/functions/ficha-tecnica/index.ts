// Ficha Tecnica LA — Edge Function
//
// Fluxo por token pessoal. Serve tres coisas:
//   GET  ?action=resolver&token=...     -> quem e a pessoa + o que falta responder + perguntas
//   POST ?action=submit&token=...       -> grava Bloco A + Bloco B, calcula no servidor
//   POST ?action=rider&token=...        -> salva/atualiza o Rider (sempre editavel)
//
// Diferenca deliberada em relacao a perfil-professor: ali o CLIENTE mandava a
// opcao canonica, ou seja, o gabarito viajava ate o navegador. Aqui o banco de
// perguntas mora no servidor e o cliente so devolve o id opaco da opcao que a
// pessoa marcou. O gabarito nunca sai daqui.
//
// Deploy: supabase functions deploy ficha-tecnica --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
// 13 cenarios fixos (13 = 4k+1, minimiza empate) + 2 de desempate.
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
};

const CANONICA_A = ['A', 'B', 'C', 'D'] as const;
const TEMPERAMENTO: Record<string, string> = { A: 'SLASH', B: 'CAZUZA', C: 'AMY', D: 'FRANK' };

// ---------------------------------------------------------------------------
// BLOCO B — linguagem de valorizacao.
// 5 categorias combinadas duas a duas = exatamente 10 pares; cada categoria
// aparece 4 vezes. O placar nasce equilibrado por construcao.
// PAL palavras | TEM tempo dedicado | APO atos de apoio
// SIM simbolo/presente | CEL celebracao e proximidade
// ---------------------------------------------------------------------------
type Par = { a: [string, string]; b: [string, string] };

const BLOCO_B: Par[] = [
  { a: ['PAL', 'Receber um "mandou muito bem nisso" especifico, na frente do time'], b: ['TEM', 'O gestor sentar 15 minutos so pra ouvir como voce esta'] },
  { a: ['APO', 'Alguem pegar uma tarefa da sua mao num dia pesado'], b: ['SIM', 'Ganhar uma lembranca que mostre que pensaram em voce'] },
  { a: ['CEL', 'O time comemorar junto quando a meta bate'], b: ['PAL', 'Uma mensagem escrita reconhecendo seu trabalho'] },
  { a: ['TEM', 'Ter um tempo reservado so seu com a lideranca'], b: ['APO', 'Alguem aparecer e perguntar "o que eu faco pra te ajudar?"'] },
  { a: ['SIM', 'Um mimo inesperado pelo esforco da semana'], b: ['CEL', 'Um abraco ou um toca aqui na hora que deu certo'] },
  { a: ['PAL', 'Ser citado pelo nome numa conquista da unidade'], b: ['APO', 'Alguem resolver por voce aquela pendencia travada'] },
  { a: ['TEM', 'Um cafe com o gestor pra conversar sem pauta'], b: ['CEL', 'Uma comemoracao junto com o time quando da certo'] },
  { a: ['SIM', 'Receber algo simbolico que marque uma entrega sua'], b: ['PAL', 'Ouvir da lideranca, olhando no olho, que voce fez diferenca'] },
  { a: ['APO', 'Alguem ficar ate mais tarde pra te ajudar a fechar'], b: ['CEL', 'Sentir a energia do time celebrando com voce'] },
  { a: ['SIM', 'Um presente pequeno que mostre que te conhecem'], b: ['TEM', 'Atencao exclusiva de quem te lidera, sem pressa'] },
];

const VALORIZACAO: Record<string, string> = {
  PAL: 'PALAVRAS', TEM: 'TEMPO', APO: 'APOIO', SIM: 'SIMBOLO', CEL: 'CELEBRACAO',
};

// ---------------------------------------------------------------------------
// BLOCO C — Rider. Texto livre, tudo opcional, sempre editavel.
// ---------------------------------------------------------------------------
const RIDER_CAMPOS = [
  { id: 'rende_mais',     grupo: 'Como eu trabalho',  label: 'Eu rendo mais quando...' },
  { id: 'me_atrapalha',   grupo: 'Como eu trabalho',  label: 'O que me atrapalha ou me tira do serio...' },
  { id: 'melhor_horario', grupo: 'Como eu trabalho',  label: 'Meu melhor horario do dia e...' },
  { id: 'como_chamar',    grupo: 'Como falar comigo', label: 'A melhor forma de me chamar pra alguma coisa e...' },
  { id: 'quando_quieto',  grupo: 'Como falar comigo', label: 'Quando eu fico quieto, geralmente significa...' },
  { id: 'entendem_errado',grupo: 'Como falar comigo', label: 'Costumam entender errado sobre mim que...' },
  { id: 'feedback',       grupo: 'Feedback',          label: 'Eu prefiro receber feedback assim...' },
  { id: 'quando_erro',    grupo: 'Feedback',          label: 'Quando eu erro, o que mais me ajuda e...' },
  { id: 'tempo_livre',    grupo: 'Fora do trabalho',  label: 'No meu tempo livre eu...' },
  { id: 'habilidade',     grupo: 'Fora do trabalho',  label: 'Uma habilidade minha que quase ninguem aqui conhece...' },
  { id: 'musica',         grupo: 'Fora do trabalho',  label: 'Se fosse escolher uma musica pra tocar quando eu chego, seria...' },
  { id: 'quero_aprender', grupo: 'Fora do trabalho',  label: 'O que eu quero aprender ou desenvolver esse ano...' },
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

function ranking(contagem: Record<string, number>) {
  return Object.entries(contagem).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
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
    .select('id, token, colaborador_id, cargo_contexto, usado_em, ativo, colaboradores(id, nome, apelido, unidade_id, situacao)')
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
    if (erro) return json({ error: erro }, 401);

    const cargo = tk.cargo_contexto || 'ATENDIMENTO';
    const colaborador = Array.isArray(tk.colaboradores) ? tk.colaboradores[0] : tk.colaboradores;

    // -----------------------------------------------------------------
    if (action === 'resolver') {
      const { data: rider } = await sb
        .from('colaborador_rider')
        .select('respostas, versao, preenchido_em')
        .eq('colaborador_id', tk.colaborador_id)
        .maybeSingle();

      const diagnosticoFeito = !!tk.usado_em;

      // Perguntas ja embaralhadas, com id opaco por opcao. O gabarito fica aqui.
      const cenarios = [...(BLOCO_A[cargo] ?? []), ...(DESEMPATE_A[cargo] ?? [])];
      const blocoA = cenarios.map((c, i) => ({
        n: i + 1,
        desempate: i >= (BLOCO_A[cargo] ?? []).length,
        titulo: c.t,
        texto: c.q,
        opcoes: embaralhar(c.o.map((texto, idx) => ({ id: `${i + 1}.${idx}`, texto }))),
      }));
      const blocoB = BLOCO_B.map((p, i) => ({
        n: i + 1,
        opcoes: embaralhar([
          { id: `${i + 1}.a`, texto: p.a[1] },
          { id: `${i + 1}.b`, texto: p.b[1] },
        ]),
      }));

      return json({
        colaborador: { id: colaborador?.id, nome: colaborador?.apelido || colaborador?.nome },
        cargo_contexto: cargo,
        diagnostico_feito: diagnosticoFeito,
        bloco_a: diagnosticoFeito ? [] : blocoA,
        bloco_b: diagnosticoFeito ? [] : blocoB,
        rider_campos: RIDER_CAMPOS,
        rider_respostas: rider?.respostas ?? {},
        rider_versao: rider?.versao ?? 0,
      });
    }

    // -----------------------------------------------------------------
    if (action === 'submit' && req.method === 'POST') {
      if (tk.usado_em) return json({ error: 'diagnostico ja respondido' }, 409);

      const body = await req.json();
      const escolhasA: string[] = body.bloco_a ?? []; // ["1.2", "2.0", ...]
      const escolhasB: string[] = body.bloco_b ?? []; // ["1.a", "2.b", ...]

      const fixas = (BLOCO_A[cargo] ?? []).length;
      if (escolhasA.length < fixas) return json({ error: 'bloco A incompleto' }, 400);
      if (escolhasB.length !== BLOCO_B.length) return json({ error: 'bloco B incompleto' }, 400);

      // Bloco A — traduz id opaco -> letra canonica -> temperamento
      const contA: Record<string, number> = { SLASH: 0, CAZUZA: 0, AMY: 0, FRANK: 0 };
      const respostasA = escolhasA.map((esc) => {
        const [nStr, idxStr] = esc.split('.');
        const n = Number(nStr), idx = Number(idxStr);
        const canonica = CANONICA_A[idx];
        contA[TEMPERAMENTO[canonica]]++;
        return { pergunta_numero: n, opcao_canonica: canonica, resposta_posicao: idx, bloco: 'A' };
      });

      // Bloco B — traduz id opaco -> categoria
      const contB: Record<string, number> = { PALAVRAS: 0, TEMPO: 0, APOIO: 0, SIMBOLO: 0, CELEBRACAO: 0 };
      const respostasB = escolhasB.map((esc) => {
        const [nStr, lado] = esc.split('.');
        const n = Number(nStr);
        const par = BLOCO_B[n - 1];
        const cat = lado === 'a' ? par.a[0] : par.b[0];
        contB[VALORIZACAO[cat]]++;
        return { pergunta_numero: n, opcao_canonica: cat, resposta_posicao: lado === 'a' ? 0 : 1, bloco: 'B' };
      });

      const rA = ranking(contA);
      const rB = ranking(contB);
      const primario = rA[0][0], secundario = rA[1][0];
      const codinome = `${primario}/${secundario}`;
      const valPrim = rB[0][0], valSec = rB[1][0];

      const { data: teste, error: e1 } = await sb
        .from('professor_perfil_testes')
        .insert({
          colaborador_id: tk.colaborador_id,
          unidade_id: colaborador?.unidade_id ?? null,
          contexto: 'COLAB',
          cargo_contexto: cargo,
          versao_questionario: 1,
          status: 'concluido',
          temperamento_primario: primario,
          temperamento_secundario: secundario,
          temperamento_codinome: codinome,
          temperamento_contagem: contA,
          valorizacao_primaria: valPrim,
          valorizacao_secundaria: valSec,
          valorizacao_contagem: contB,
          concluido_em: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (e1) return json({ error: e1.message }, 500);

      const linhas = [...respostasA, ...respostasB].map((r) => ({ ...r, teste_id: teste.id }));
      const { error: e2 } = await sb.from('professor_perfil_respostas').insert(linhas);
      if (e2) return json({ error: e2.message }, 500);

      // desnormaliza no cadastro e trava o token para o diagnostico
      await sb.from('colaboradores')
        .update({ temperamento_codinome: codinome, valorizacao_codinome: `${valPrim}/${valSec}` })
        .eq('id', tk.colaborador_id);
      await sb.from('ficha_tokens')
        .update({ usado_em: new Date().toISOString() })
        .eq('id', tk.id);

      return json({ ok: true, codinome, valorizacao: `${valPrim}/${valSec}` });
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
