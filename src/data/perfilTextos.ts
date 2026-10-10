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
// VALORES (Bloco D — fit cultural) — nomes de exibição e frases
// ---------------------------------------------------------------------------
export const VALORES_NOMES: Record<string, string> = {
  CORAGEM: 'Coragem',
  EMPATIA: 'Empatia',
  EXCELENCIA: 'Excelência',
  PAIXAO: 'Paixão',
};

export const VALORES_FRASES: Record<string, string> = {
  CORAGEM: 'fala o que precisa ser dito, mesmo quando custa',
  EMPATIA: 'lê a pessoa antes de tratar do problema',
  EXCELENCIA: 'não entrega abaixo do padrão que se cobra',
  PAIXAO: 'move pelo entusiasmo, prefere fazer acontecer a esperar o ideal',
};

// ---------------------------------------------------------------------------
// TEXTO DO PERFIL (temperamento primário)
// Usado em:
//   - Briefing parágrafo 1 ("Como reage")
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
    reage: '<b>Entra em ação rápido</b> e puxa o ritmo quando tudo está parado.',
    pontoCego: 'Em compensação, pode atropelar quem precisa de mais tempo pra processar — pise no freio antes de cobrar.',
    forca: 'Empurra a situação pra frente quando ninguém toma a iniciativa',
    escorrego: 'Impaciência com quem vai devagar; pode parecer que não escuta',
    subtitulo: (s) => `Impulso com tempero de ${s}`,
  },
  CAZUZA: {
    reage: '<b>Lê o ambiente e conecta as pessoas</b> antes de qualquer outra coisa.',
    pontoCego: 'Por outro lado, raramente vai trazer o problema desconfortável por conta própria — pergunte diretamente em vez de esperar.',
    forca: 'Conecta o time e lê o clima antes de ninguém',
    escorrego: 'Evita o atrito necessário; demora pra trazer problema',
    subtitulo: (s) => `Conexão com tempero de ${s}`,
  },
  AMY: {
    reage: '<b>Mapeia tudo antes de se mover</b> e traz a resposta certa na hora certa.',
    pontoCego: 'Porém, pode parecer que está demorando demais quando o urgente bate na porta — combine checkpoints pra não sufocar.',
    forca: 'Vê o quadro inteiro e prepara antes de agir',
    escorrego: 'Paralisia por análise; custa a largar quando falta dado',
    subtitulo: (s) => `Visão com tempero de ${s}`,
  },
  FRANK: {
    reage: '<b>Não se desestabiliza fácil</b> e traz a temperatura pra baixo quando o ambiente esquenta.',
    pontoCego: 'Dificilmente vai levantar um problema que está incomodando — pergunte diretamente em vez de esperar que apareça.',
    forca: 'Segura o barco quando o mar agita',
    escorrego: 'Calma virando inércia; evita o atrito necessário',
    subtitulo: (s) => `Estabilidade com tempero de ${s}`,
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
  /** Frase do briefing — como funciona na prática */
  briefing: string;
}

export const VALORIZACAO_TEXTOS: Record<string, TextoValorizacao> = {
  PALAVRAS: {
    reconhecer: 'Reconhecimento dito ou escrito, específico, na frente dos outros.',
    briefing: 'Reconhecimento funciona por <b>palavra dita</b>, e melhor ainda na frente do time.',
  },
  TEMPO: {
    reconhecer: 'Atenção exclusiva, conversa sem pauta.',
    briefing: 'Reconhecimento funciona por <b>tempo dedicado</b> — conversa sem pauta, atenção exclusiva.',
  },
  APOIO: {
    reconhecer: 'Alguém que se ofereceu pra ajudar quando precisou, sem pedir.',
    briefing: 'Reconhecimento funciona por <b>apoio concreto</b> — alguém que botou a mão na massa junto.',
  },
  SIMBOLO: {
    reconhecer: 'Presente e lembrança — algo físico que mostra que houve intenção.',
    briefing: 'Reconhecimento funciona por <b>símbolos</b> — presente e lembrança mostram atenção.',
  },
  CELEBRACAO: {
    reconhecer: 'Comemorar junto, na hora que dá certo — vibrar junto, não depois.',
    briefing: 'Reconhecimento funciona por <b>celebração</b> — comemorar junto, na hora que dá certo, vibrar junto.',
  },
};

// ---------------------------------------------------------------------------
// TEXTO DE "EVITE" (valorização com menor pontuação)
// ---------------------------------------------------------------------------
export const VALORIZACAO_EVITE: Record<string, string> = {
  PALAVRAS: 'Elogio genérico e em público pode passar batido.',
  TEMPO: 'Conversa longa sem objeto não ajuda — vai direto ao ponto.',
  APOIO: 'Oferecer ajuda não pedida pode soar como dúvida sobre a capacidade.',
  SIMBOLO: 'Presente e lembrança podem passar quase despercebidos.',
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
  FRANK: 'Se precisar de velocidade, <b>combine o prazo junto</b>. Pressão de cima não acelera — trava.',
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
// CARREIRA CAMPOS — cópia da edge function ficha-tecnica (CARREIRA_CAMPOS)
// Bloco "Minha carreira na música" (departamento Professores). Mesma régua do
// Rider: mantido idêntico para que os rótulos não divergirem entre formulário
// e ficha.
// ---------------------------------------------------------------------------
export interface CampoCarreira {
  id: string;
  grupo: string;
  label: string;
  tipo: 'texto' | 'escolha';
  opcoes?: { id: string; label: string }[];
}

export const CARREIRA_CAMPOS: CampoCarreira[] = [
  { id: 'bio_curta',          grupo: 'Você como músico(a)', tipo: 'texto', label: 'Sua bio curta — 2 ou 3 frases que te apresentem como músico(a)' },
  { id: 'instrumentos_nivel', grupo: 'Você como músico(a)', tipo: 'texto', label: 'Instrumentos que você toca e seu nível em cada um' },
  { id: 'estilos',             grupo: 'Você como músico(a)', tipo: 'texto', label: 'Estilos musicais que você mais toca ou curte' },
  { id: 'referencias',         grupo: 'Você como músico(a)', tipo: 'texto', label: 'Suas referências musicais (artistas, bandas, quem te inspira)' },
  { id: 'trajetoria',          grupo: 'Você como músico(a)', tipo: 'texto', label: 'Sua trajetória na música — como começou e por onde já passou' },
  { id: 'formacao',            grupo: 'Você como músico(a)', tipo: 'texto', label: 'Sua formação musical (cursos, faculdade, autodidata...)' },
  { id: 'gosta_ensinar',       grupo: 'Você como músico(a)', tipo: 'texto', label: 'O que você mais gosta de ensinar' },
  { id: 'dica_mestre_1',       grupo: 'Dica do Mestre',      tipo: 'texto', label: 'Tema 1 pra Dica do Mestre' },
  { id: 'dica_mestre_2',       grupo: 'Dica do Mestre',      tipo: 'texto', label: 'Tema 2 pra Dica do Mestre' },
  { id: 'dica_mestre_3',       grupo: 'Dica do Mestre',      tipo: 'texto', label: 'Tema 3 pra Dica do Mestre' },
  { id: 'instagram',           grupo: 'Redes sociais e mídias', tipo: 'texto', label: 'Seu Instagram (@)' },
  { id: 'youtube',             grupo: 'Redes sociais e mídias', tipo: 'texto', label: 'Seu YouTube (canal ou link)' },
  { id: 'outra_rede',          grupo: 'Redes sociais e mídias', tipo: 'texto', label: 'Outra rede ou portfólio (link ou @)' },
  { id: 'topa_video_audio',    grupo: 'Redes sociais e mídias', tipo: 'escolha', label: 'Você toparia gravar vídeo e/ou áudio pra conteúdos da escola?',
    opcoes: [
      { id: 'sim_video_audio', label: 'Sim — vídeo e áudio' },
      { id: 'so_video',       label: 'Só vídeo' },
      { id: 'so_audio',       label: 'Só áudio' },
      { id: 'nao_topa',       label: 'Prefiro não gravar' },
    ] },
];

/** Traduz o id canônico do consentimento (topa_video_audio) para o rótulo legível. */
export function rotuloTopaVideoAudio(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const opcao = CARREIRA_CAMPOS
    .find((campo) => campo.id === 'topa_video_audio')
    ?.opcoes?.find((opcao) => opcao.id === valor);
  return opcao?.label ?? null;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

// Fallbacks genéricos — usados quando uma chave não existe nas tabelas acima.
// Evita que blocos inteiros da ficha sumam silenciosamente por causa de uma
// chave nova no banco que ainda não foi mapeada aqui.
export const FALLBACK_PERFIL: TextoPerfil = {
  reage: '<b>Tem um perfil válido</b> mas o texto ainda não foi mapeado.',
  pontoCego: 'Em compensação, vale conversar pra entender os limites desse perfil.',
  forca: 'Perfil em mapeamento — força a confirmar',
  escorrego: 'Perfil em mapeamento — escorrego a confirmar',
  subtitulo: (s) => `Perfil com tempero de ${s}`,
};

export const FALLBACK_VALORIZACAO: TextoValorizacao = {
  reconhecer: 'Linguagem de valorização em mapeamento — confirme qual forma de reconhecimento funciona melhor.',
  briefing: 'Reconhecimento funciona de um jeito que <b>ainda está sendo mapeado</b>.',
};

export const FALLBACK_EVITE = 'Evite em mapeamento — confirme o que não funciona.';

export const FALLBACK_COBRAR = 'Se precisar de resultado, <b>combine o objetivo e o prazo junto</b>.';

export const FALLBACK_VALOR_FRASE = 'valor em mapeamento — confirme o significado na prática';

/** Cor usada quando o perfil não tem cor mapeada (ou nem tem perfil ainda) */
export const COR_PADRAO = '#5c7093';

/**
 * Nome de exibição de um valor do Bloco D.
 * Chave não mapeada vira "Lealdade" em vez de sumir ou quebrar o bloco.
 */
export function nomeDoValor(chave: string | null | undefined): string {
  if (!chave) return '';
  return VALORES_NOMES[chave] || chave.charAt(0) + chave.slice(1).toLowerCase();
}

/**
 * Frase explicativa de um valor do Bloco D.
 * Chave não mapeada cai num texto genérico — o bloco continua legível.
 */
export function fraseDoValor(chave: string | null | undefined): string {
  if (!chave) return '';
  return VALORES_FRASES[chave] || FALLBACK_VALOR_FRASE;
}

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
