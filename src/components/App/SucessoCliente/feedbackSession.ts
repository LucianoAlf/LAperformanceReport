export function formatarCompetenciaFeedback(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function normalizarTelefoneWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;

  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith('55')) cleaned = `55${cleaned}`;

  return cleaned;
}

export function primeiroNome(nome: string | null | undefined): string {
  const trimmed = (nome || '').trim();
  return trimmed.split(/\s+/)[0] || 'professor';
}

export function montarMensagemFeedbackProfessor(params: {
  nomeProfessor: string;
  linkFeedback: string;
  lembrete?: boolean;
}): string {
  const saudacao = params.lembrete ? 'Lembrete: precisamos' : 'Precisamos';

  return [
    `Olá, ${primeiroNome(params.nomeProfessor)}! 🎵`,
    '',
    `${saudacao} do seu feedback sobre seus alunos.`,
    '',
    `Acesse: ${params.linkFeedback}`,
    '',
    'O link expira em 7 dias.',
    '',
    'Obrigado! 💜',
  ].join('\n');
}
