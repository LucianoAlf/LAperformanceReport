/**
 * Normaliza telefone para o formato 55XXXXXXXXXXX (DDI+DDD+numero).
 * Espelha a logica usada na edge function processar-matricula-emusys
 * para garantir match consistente entre frontend e webhook.
 *
 * Retorna null se o telefone for invalido (menos de 10 digitos apos limpar).
 */
export function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}
