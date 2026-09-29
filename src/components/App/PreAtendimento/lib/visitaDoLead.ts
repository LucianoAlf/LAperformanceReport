import { supabase } from '@/lib/supabase';
import { visitaAgendadaVigente, type VisitaAgendadaDoLead } from '@/lib/visitasComercial';

// Sem uniao discriminada: o projeto roda com `strict` desligado e o TypeScript nao
// estreita por `ok` assim. `erro` preenchido <=> `ok === false`.
export interface ConsultaVisitaDoLead {
  ok: boolean;
  visita: VisitaAgendadaDoLead | null;
  erro: string | null;
}

/** Data civil de hoje em BRT (`YYYY-MM-DD`). */
export function hojeBrt(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Consulta se o lead já tem visita agendada que ainda não passou.
 *
 * Devolve `ok:false` quando NÃO deu para saber — quem chama não pode tratar isso como
 * "não tem visita" e abrir um segundo agendamento, nem mover o card às cegas.
 */
export async function consultarVisitaVigenteDoLead(leadId: number): Promise<ConsultaVisitaDoLead> {
  const { data, error } = await supabase
    .from('visitas')
    .select('id, data, horario, status')
    .eq('lead_id', leadId)
    .eq('status', 'agendada');
  if (error) {
    return { ok: false, visita: null, erro: `lead ${leadId}: ${error.code || '?'} ${error.message}` };
  }
  return { ok: true, visita: visitaAgendadaVigente((data ?? []) as VisitaAgendadaDoLead[], hojeBrt()), erro: null };
}

/** "03/10 às 11:00" — para o aviso de que o lead já tem visita marcada. */
export function quandoDaVisita(v: VisitaAgendadaDoLead): string {
  const [, m, d] = v.data.split('-');
  const hora = v.horario ? v.horario.slice(0, 5) : '';
  return `${d}/${m}${hora && hora !== '00:00' ? ` às ${hora}` : ''}`;
}
