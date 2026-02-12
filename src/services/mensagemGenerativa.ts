// Service: Mensagens Generativas via Edge Functions (Gemini)
// Gera mensagens personalizadas de aniversário e boas-vindas para alunos

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// === Tipos ===

export interface DadosAniversario {
  aluno_nome: string;
  instrumento: string | null;
  professor_nome: string | null;
  idade: number | null;
  classificacao?: string | null;
  tempo_escola_meses?: number | null;
}

export interface DadosBoasVindas {
  aluno_nome: string;
  instrumento: string | null;
  professor_nome: string | null;
  idade: number | null;
  classificacao?: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
}

interface MensagemResponse {
  mensagem: string | null;
  error?: string;
}

// === Fallbacks (templates fixos caso a IA falhe) ===

function fallbackAniversario(dados: DadosAniversario): string {
  const primeiroNome = dados.aluno_nome.split(' ')[0];
  const instrumento = dados.instrumento || 'música';
  const professor = dados.professor_nome
    ? ` Seu professor ${dados.professor_nome} mandou um abraço especial!`
    : '';
  return `🎂 Parabéns, ${primeiroNome}! A família LA Music deseja um dia incrível cheio de ${instrumento.toLowerCase()}! 🎶${professor} Que venham muitas conquistas e músicas novas! 🎉`;
}

function fallbackBoasVindas(dados: DadosBoasVindas): string {
  const primeiroNome = dados.aluno_nome.split(' ')[0];
  const instrumento = dados.instrumento || 'música';
  const professor = dados.professor_nome
    ? ` A professora ${dados.professor_nome} já está preparando tudo pra te receber!`
    : '';
  const horario = dados.dia_aula && dados.horario_aula
    ? ` Sua primeira aula é ${dados.dia_aula} às ${dados.horario_aula.replace(/:00$/, '')}.`
    : '';
  return `🎸 Bem-vindo(a) à LA Music, ${primeiroNome}! Sua jornada no ${instrumento} começa agora! 🎵${professor}${horario} Qualquer dúvida, é só chamar. ✨`;
}

// === Funções principais ===

export async function gerarMensagemAniversario(dados: DadosAniversario): Promise<string> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/gerar-mensagem-aniversario`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dados),
      }
    );

    if (!response.ok) {
      console.error('[MensagemGenerativa] Erro HTTP aniversário:', response.status);
      return fallbackAniversario(dados);
    }

    const result: MensagemResponse = await response.json();

    if (result.mensagem) {
      return result.mensagem;
    }

    console.warn('[MensagemGenerativa] Resposta sem mensagem, usando fallback');
    return fallbackAniversario(dados);
  } catch (error) {
    console.error('[MensagemGenerativa] Erro ao gerar mensagem de aniversário:', error);
    return fallbackAniversario(dados);
  }
}

export async function gerarMensagemBoasVindas(dados: DadosBoasVindas): Promise<string> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/gerar-mensagem-boas-vindas`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dados),
      }
    );

    if (!response.ok) {
      console.error('[MensagemGenerativa] Erro HTTP boas-vindas:', response.status);
      return fallbackBoasVindas(dados);
    }

    const result: MensagemResponse = await response.json();

    if (result.mensagem) {
      return result.mensagem;
    }

    console.warn('[MensagemGenerativa] Resposta sem mensagem, usando fallback');
    return fallbackBoasVindas(dados);
  } catch (error) {
    console.error('[MensagemGenerativa] Erro ao gerar mensagem de boas-vindas:', error);
    return fallbackBoasVindas(dados);
  }
}
