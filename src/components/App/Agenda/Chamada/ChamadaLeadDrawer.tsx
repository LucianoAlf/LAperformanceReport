import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  GraduationCap,
  Phone,
  Tag,
  User,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { LeadExperimentalAgenda, AulaAgenda } from '@/hooks/useAgendaDia';
import { cn } from '@/lib/utils';

interface Props {
  lead: LeadExperimentalAgenda | null;
  aula: AulaAgenda | null;
  data: string;
  salvando: boolean;
  onMarcar: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onFechar: () => void;
}

interface LeadCompleto {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  canal_origem_id: number | null;
  canal_nome: string | null;
  curso_interesse_id: number | null;
  curso_nome: string | null;
  faixa_etaria: string | null;
  status: string | null;
  observacoes: string | null;
}

/**
 * Drawer do lead experimental na Chamada. Mostra todas as informações do lead
 * e permite marcar presença/falta. Campos faltantes aparecem como alerta
 * amarelo — o comercial precisa completar para fechar a venda.
 */
export function ChamadaLeadDrawer({ lead, aula, data, salvando, onMarcar, onFechar }: Props) {
  const [leadCompleto, setLeadCompleto] = useState<LeadCompleto | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Busca os dados completos do lead quando o drawer abre
  useEffect(() => {
    if (!lead?.lead_id) { setLeadCompleto(null); return; }
    let cancelado = false;
    setCarregando(true);
    (async () => {
      const { data: rows } = await supabase
        .from('leads')
        .select('id, nome, telefone, email, canal_origem_id, faixa_etaria, status, observacoes')
        .eq('id', lead.lead_id)
        .single();
      if (cancelado) return;

      // Busca nome do canal
      let canalNome: string | null = null;
      if (rows?.canal_origem_id) {
        const { data: canal } = await supabase
          .from('canais_origem')
          .select('nome')
          .eq('id', rows.canal_origem_id)
          .single();
        canalNome = canal?.nome ?? null;
      }

      // Busca nome do curso de interesse
      let cursoNome: string | null = null;
      if (lead.curso_interesse_id) {
        const { data: curso } = await supabase
          .from('cursos')
          .select('nome')
          .eq('id', lead.curso_interesse_id)
          .single();
        cursoNome = curso?.nome ?? null;
      }

      setLeadCompleto({
        ...rows,
        canal_nome: canalNome,
        curso_nome: cursoNome,
        curso_interesse_id: lead.curso_interesse_id,
      });
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [lead?.lead_id, lead?.curso_interesse_id]);

  if (!lead || !aula) return null;

  const presente = lead.status === 'experimental_realizada';
  const faltou = lead.status === 'experimental_faltou';

  const camposFaltantes: string[] = [];
  if (!leadCompleto?.telefone && !lead.telefone) camposFaltantes.push('telefone');
  if (!lead.curso_interesse_id) camposFaltantes.push('curso de interesse');
  if (!leadCompleto?.canal_origem_id && !lead.canal_origem_id) camposFaltantes.push('canal de origem');
  if (!leadCompleto?.faixa_etaria && !lead.faixa_etaria) camposFaltantes.push('faixa etária');
  if (!lead.professor_experimental_id) camposFaltantes.push('professor da experimental');

  return (
    <Dialog open={lead != null} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="z-[110] max-w-none border-slate-700 bg-[#0c1220] p-0 sm:max-w-[480px]"
        overlayClassName="z-[110] bg-black/60 backdrop-blur-sm"
      >
        <DialogTitle className="sr-only">Detalhes do lead</DialogTitle>
        <div className="flex max-h-[90vh] flex-col">
          {/* Cabeçalho */}
          <header className="border-b border-slate-700/50 p-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300">
                <User className="h-3 w-3" />
                Lead
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Aula Experimental
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">{lead.nome}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {aula.hora_inicio}–{aula.hora_fim} · {aula.curso_nome} · {aula.sala_nome} · {aula.unidade_nome}
            </p>
          </header>

          {/* Corpo */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Status da presença */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Presença na experimental
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => onMarcar(lead.experimental_id, 'experimental_realizada')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-bold transition-all hover:-translate-y-px disabled:opacity-50',
                    presente
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]'
                      : 'border-slate-700 text-slate-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400',
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Presente
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => onMarcar(lead.experimental_id, 'experimental_faltou')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-bold transition-all hover:-translate-y-px disabled:opacity-50',
                    faltou
                      ? 'border-rose-500/60 bg-rose-500/15 text-rose-300 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.3)]'
                      : 'border-slate-700 text-slate-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400',
                  )}
                >
                  <XCircle className="h-4 w-4" />
                  Faltou
                </button>
              </div>
            </section>

            {/* Campos faltantes */}
            {camposFaltantes.length > 0 && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Campos pendentes ({camposFaltantes.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {camposFaltantes.map((campo) => (
                    <li key={campo} className="text-xs text-amber-200/80">
                      • {campo}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-amber-300/60">
                  Complete na ficha do lead (Comercial → Leads) para fechar a venda.
                </p>
              </section>
            )}

            {/* Informações do lead */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Informações do lead
              </p>
              <div className="space-y-2.5 rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5">
                <InfoRow icon={<Phone className="h-3.5 w-3.5" />} rotulo="Telefone" valor={leadCompleto?.telefone ?? lead.telefone} />
                <InfoRow icon={<Tag className="h-3.5 w-3.5" />} rotulo="Canal" valor={leadCompleto?.canal_nome ?? lead.canal} />
                <InfoRow icon={<GraduationCap className="h-3.5 w-3.5" />} rotulo="Curso de interesse" valor={leadCompleto?.curso_nome ?? lead.curso} />
                <InfoRow icon={<User className="h-3.5 w-3.5" />} rotulo="Faixa etária" valor={leadCompleto?.faixa_etaria ?? lead.faixa_etaria} />
                <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} rotulo="Professor" valor={lead.professor_nome} />
              </div>
            </section>

            {/* Observações do atendimento */}
            {lead.observacoes && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                  Observações do atendimento
                </p>
                <p className="whitespace-pre-wrap rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5 text-xs text-slate-300">
                  {lead.observacoes}
                </p>
              </section>
            )}

            {/* Dados da aula */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Aula experimental
              </p>
              <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-3.5 text-xs text-slate-300">
                <p><b className="text-slate-200">{aula.curso_nome}</b> · {aula.sala_nome}</p>
                <p className="mt-1 text-slate-500">
                  {aula.professor_nome} · {aula.hora_inicio}–{aula.hora_fim} · {aula.unidade_nome}
                </p>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon, rotulo, valor }: { icon: React.ReactNode; rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
        {icon}
        {rotulo}
      </span>
      <span className={cn('text-xs', valor ? 'text-slate-200' : 'text-slate-600 italic')}>
        {valor ?? 'Não informado'}
      </span>
    </div>
  );
}
