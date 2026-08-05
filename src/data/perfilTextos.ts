/**
 * perfilTextos.ts
 *
 * Tabelas fixas de texto para montar o briefing "Antes de falar com {nome}"
 * e os blocos "Perfil" / "Como reconhecer" da ficha de colaborador.
 *
 * Estes textos serão revisados por gente de negócio — manter separados do
 * componente para facilitar edição.
 *
 * Regra: nunca nomear os instrumentos. Usar "perfil" e "como reconhecer".
 */

// ---------------------------------------------------------------------------
// CORES DE IDENTIDADE (cor do perfil primário)
// ---------------------------------------------------------------------------
export const PERFIL_CORES: Record<string, string> = {
  SLASH: '#e4484d',
  CAZUZA: '#db9e04',
  AMY: '#4e7cf6',
  FRANK: '#2a9d8f',
};

// ---------------------------------------------------------------------------
// NOMES DE EXIBIÇÃO (sem nomear o instrumento)
// ---------------------------------------------------------------------------
export const PERFIL_NOMES: Record<string, string> = {
  SLASH: 'Slash',
  CAZUZA: 'Cazuza',
  AMY: 'Amy',
  FRANK: 'Frank',
};

// ---------------------------------------------------------------------------
// VALORIZAÇÃO — nomes de exibição
// ---------------------------------------------------------------------------
export const VALORIZACAO_NOMES: Record<string, string> = {
  PALAVRAS: 'Palavras',
  TEMPO: 'Tempo',
  APOIO: 'Apoio',
  SIMBOLO: 'Símbolo',
  CELEBRACAO: 'Celebração',
};

// ---------------------------------------------------------------------------
// TEXTO DO PERFIL (temperamento primário)
// Usado em:
//   - Briefing parágrafo 1 ("Como ela reage")
//   - Bloco "Perfil" (Força / Escorrego)
// ---------------------------------------------------------------------------
export interface TextoPerfil {
  /** O que a pessoa traz — frase curta pro briefing */
  reage: string;
  /** Ponto cego — frase curta pro briefing (continuação do reage) */
  pontoCego: string;
  /** Força — bloco Perfil */
  forca: string;
  /** Escorrego — bloco Perfil */
  escorrego: string;
  /** Subtítulo do perfil (ex.: "Estabilidade com tempero de conexão") */
  subtitulo: (secundario: string) => string;
}

export const PERFIS_TEXTOS: Record<string, TextoPerfil> = {
  SLASH: {
    reage: 'Ela <b>entra em ação rápido</b> e puxa o ritmo quando tudo está parado.',
    pontoCego: 'Em compensação, pode atropelar quem precisa de mais tempo pra processar — pise no freio antes de cobrar.',
    forca: 'Empurra a situação pra frente quando ninguém toma a iniciativa',
    escorrego: 'Impaciência com quem vai devagar; pode parecer que não escuta',
    subtitulo: (s) => `Impulso com tempero de ${s.toLowerCase()}`,
  },
  CAZUZA: {
    reage: 'Ela <b>lê o ambiente e conecta as pessoas</b> antes de qualquer outra coisa.',
    pontoCego: 'Por outro lado, raramente vai trazer o problema desconfortável sozinha — pergunte diretamente em vez de esperar.',
    forca: 'Conecta o time e lê o clima antes de ninguém',
    escorrego: 'Evita o atrito necessário; demora pra trazer problema',
    subtitulo: (s) => `Conexão com tempero de ${s.toLowerCase()}`,
  },
  AMY: {
    reage: 'Ela <b>mapeia tudo antes de se mover</b> e traz a resposta certa na hora certa.',
    pontoCego: 'Porém, pode parecer que está demorando demais quando o urgente bate na porta — combine checkpoints pra não sufocar.',
    forca: 'Vê o quadro inteiro e prepara antes de agir',
    escorrego: 'Paralisia por análise; custa a largar quando falta dado',
    subtitulo: (s) => `Visão com tempero de ${s.toLowerCase()}`,
  },
  FRANK: {
    reage: 'Ela <b>não se desestabiliza fácil</b> e traz a temperatura pra baixo quando o ambiente esquenta.',
    pontoCego: 'Dificilmente vai levantar sozinha um problema que está incomodando — pergunte diretamente em vez de esperar que ela traga.',
    forca: 'Segura o barco quando o mar agita',
    escorrego: 'Calma virando inércia; evita o atrito necessário',
    subtitulo: (s) => `Estabilidade com tempero de ${s.toLowerCase()}`,
  },
};

// ---------------------------------------------------------------------------
// TEXTO DE VALORIZAÇÃO (linguagem de valorização primária)
// Usado em:
//   - Briefing parágrafo 2 ("Como reconhecer")
//   - Bloco "Como reconhecer" (1º e 2º)
// ---------------------------------------------------------------------------
export interface TextoValorizacao {
  /** Frase prática de como reconhecer */
  reconhecer: string;
  /** Frase do briefing — como funciona com ela */
  briefing: string;
}

export const VALORIZACAO_TEXTOS: Record<string, TextoValorizacao> = {
  PALAVRAS: {
    reconhecer: 'Reconhecimento dito ou escrito, específico, na frente dos outros.',
    briefing: 'Reconhecimento com ela funciona por <b>palavra dita</b>, e melhor ainda na frente do time.',
  },
  TEMPO: {
    reconhecer: 'Atenção exclusiva, conversa sem pauta.',
    briefing: 'Reconhecimento com ela funciona por <b>tempo dedicado</b> — conversa sem pauta, atenção exclusiva.',
  },
  APOIO: {
    reconhecer: 'Alguém que se ofereceu pra ajudar quando precisou, sem pedir.',
    briefing: 'Reconhecimento com ela funciona por <b>apoio concreto</b> — alguém que botou a mão na massa junto.',
  },
  SIMBOLO: {
    reconhecer: 'Presente e lembrança — algo físico que mostra que pensaram nela.',
    briefing: 'Reconhecimento com ela funciona por <b>símbolos</b> — presente e lembrança passam longe de despercebidos.',
  },
  CELEBRACAO: {
    reconhecer: 'Comemorar junto, na hora que dá certo — vibrar com ela, não depois.',
    briefing: 'Reconhecimento com ela funciona por <b>celebração</b> — comemorar junto, na hora que dá certo, vibrar com ela.',
  },
};

// ---------------------------------------------------------------------------
// TEXTO DE "EVITE" (valorização com menor pontuação)
// ---------------------------------------------------------------------------
export const VALORIZACAO_EVITE: Record<string, string> = {
  PALAVRAS: 'Elogio genérico e em público passa batido com ela.',
  TEMPO: 'Conversa longa sem objeto a irrita — vai direto ao ponto.',
  APOIO: 'Oferecer ajuda não pedida a faz sentir que duvidam dela.',
  SIMBOLO: 'Presente e lembrança passam quase despercebidos com ela.',
  CELEBRACAO: 'Deixar a conquista passar em branco ou só registrar num relatório.',
};

// ---------------------------------------------------------------------------
// TEXTO DE "COMO COBRAR" (derivado do primário)
// Usado no briefing parágrafo 3
// ---------------------------------------------------------------------------
export const PERFIS_COBRAR: Record<string, string> = {
  SLASH: 'Se precisar de resultado, <b>deixa o objetivo claro e sai do caminho</b>. Microgestão trava.',
  CAZUZA: 'Se precisar de resultado, <b>converse antes de cobrar</b>. Cobrança fria desarma.',
  AMY: 'Se precisar de resultado, <b>traça o plano junto</b>. Pressão sem contexto paralisa.',
  FRANK: 'Se precisar de velocidade, <b>combine o prazo junto com ela</b>. Pressão de cima não acelera — trava.',
};

// ---------------------------------------------------------------------------
// RIDER CAMPOS — cópia da edge function ficha-tecnica (RIDER_CAMPOS)
// Mantido idêntico para que os rótulos não divergirem entre formulário e tela
// ---------------------------------------------------------------------------
export const RIDER_CAMPOS = [
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
] as const;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

// Fallbacks genéricos — usados quando uma chave não existe nas tabelas acima.
// Evita que blocos inteiros da ficha sumam silenciosamente por causa de uma
// chave nova no banco que ainda não foi mapeada aqui.
export const FALLBACK_PERFIL: TextoPerfil = {
  reage: 'Ela <b>tem um perfil válido</b> mas o texto ainda não foi mapeado.',
  pontoCego: 'Em compensação, vale conversar pra entender os limites desse perfil.',
  forca: 'Perfil em mapeamento — força a confirmar',
  escorrego: 'Perfil em mapeamento — escorrego a confirmar',
  subtitulo: (s) => `Perfil com tempero de ${s.toLowerCase()}`,
};

export const FALLBACK_VALORIZACAO: TextoValorizacao = {
  reconhecer: 'Linguagem de valorização em mapeamento — confirme com ela como gosta de ser reconhecida.',
  briefing: 'Reconhecimento com ela funciona de um jeito que <b>ainda está sendo mapeado</b>.',
};

export const FALLBACK_EVITE = 'Evite em mapeamento — confirme o que não funciona com ela.';

export const FALLBACK_COBRAR = 'Se precisar de resultado, <b>combine o objetivo e o prazo junto com ela</b>.';

/** Formata codinome "AMY/CAZUZA" -> "Amy-Cazuza" */
export function formatarCodinome(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome
    .split('/')
    .map((p) => PERFIL_NOMES[p] || p.charAt(0) + p.slice(1).toLowerCase())
    .join('-');
}

/** Formata valorização "PALAVRAS/TEMPO" -> "Palavras · Tempo" */
export function formatarValorizacao(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome
    .split('/')
    .map((p) => VALORIZACAO_NOMES[p] || p.charAt(0) + p.slice(1).toLowerCase())
    .join(' · ');
}

/** Retorna a cor do perfil primário a partir do codinome */
export function corDoPerfil(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  const prim = codinome.split('/')[0];
  return PERFIL_CORES[prim] || null;
}

/** Retorna a chave do perfil primário */
export function perfilPrimario(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[0] || null;
}

/** Retorna a chave do perfil secundário */
export function perfilSecundario(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[1] || null;
}

/** Retorna a chave da valorização primária */
export function valorizacaoPrimaria(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[0] || null;
}

/** Retorna a chave da valorização secundária */
export function valorizacaoSecundaria(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[1] || null;
}

/**
 * Encontra a valorização com menor pontuação (o "Evite").
 * valorizacao_contagem vem como {"PALAVRAS":4,"TEMPO":3,"APOIO":1,"SIMBOLO":2}
 */
export function valorizacaoEvite(contagem: Record<string, number> | null | undefined): string | null {
  if (!contagem || typeof contagem !== 'object') return null;
  const entries = Object.entries(contagem);
  if (entries.length === 0) return null;
  // Ordena por valor ascendente — o menor é o "Evite"
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}
