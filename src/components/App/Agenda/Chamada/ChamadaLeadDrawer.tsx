import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Phone,
  Tag,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
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
  onSalvo: () => void;
}

interface Opcao {
  id: number;
  nome: string;
}

/**
 * Drawer do lead experimental na Chamada. Mostra todas as informações do lead,
 * permite marcar presença/falta e EDITAR os campos faltantes direto aqui —
-- sem precisar ir na ficha do lead. A atualização propaga para leads e
 * lead_experimentais, e a Conciliação do Comercial reflete automaticamente.
 */
export function ChamadaLeadDrawer({ lead, aula, data, salvando, onMarcar, onFechar, onSalvo }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [salvandoCampos, setSalvandoCampos] = useState(false);

  // Opções para os selects
  const [canais, setCanais] = useState<Opcao[]>([]);
  const [cursos, setCursos] = useState<Opcao[]>([]);
  const [professores, setProfessores] = useState<Opcao[]>([]);

  // Valores editáveis
  const [telefone, setTelefone] = useState('');
  const [canalId, setCanalId] = useState<number | null>(null);
  const [cursoId, setCursoId] = useState<number | null>(null);
  const [faixaEtaria, setFaixaEtaria] = useState('');
  const [professorId, setProfessorId] = useState<number | null>(null);

  // Carrega opções e valores iniciais
  useEffect(() => {
    if (!lead) return;
    let cancelado = false;
    setCarregando(true);

    (async () => {
      // Busca opções em paralelo
      const [canaisRes, cursosRes, profsRes] = await Promise.all([
        supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('cursos').select('id, nome').order('nome'),
        supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
      ]);

      if (cancelado) return;
      setCanais(canaisRes.data ?? []);
      setCursos(cursosRes.data ?? []);
      setProfessores(profsRes.data ?? []);

      // Preenche valores atuais
      setTelefone(lead.telefone ?? '');
      setCanalId(lead.canal_origem_id ?? null);
      setCursoId(lead.curso_interesse_id ?? null);
      setFaixaEtaria(lead.faixa_etaria ?? '');
      setProfessorId(lead.professor_experimental_id ?? null);
      setCarregando(false);
    })();

    return () => { cancelado = true; };
  }, [lead]);

  if (!lead || !aula) return null;

  const presente = lead.status === 'experimental_realizada';
  const faltou = lead.status === 'experimental_faltou';

  // Campos que ainda faltam (baseado nos valores editáveis, não no banco)
  const camposFaltantes: string[] = [];
  if (!telefone.trim()) camposFaltantes.push('telefone');
  if (!cursoId) camposFaltantes.push('curso de interesse');
  if (!canalId) camposFaltantes.push('canal de origem');
  if (!faixaEtaria.trim()) camposFaltantes.push('faixa etária');
  if (!professorId) camposFaltantes.push('professor da experimental');

  const temMudanca =
    telefone !== (lead.telefone ?? '') ||
    canalId !== (lead.canal_origem_id ?? null) ||
    cursoId !== (lead.curso_interesse_id ?? null) ||
    faixaEtaria !== (lead.faixa_etaria ?? '') ||
    professorId !== (lead.professor_experimental_id ?? null);

  async function salvarCampos() {
    if (!lead || !temMudanca) return;
    setSalvandoCampos(true);
    try {
      const { error } = await supabase.rpc('app_atualizar_lead_campos', {
        p_experimental_id: lead.experimental_id,
        p_telefone: telefone.trim() || null,
        p_canal_origem_id: canalId,
        p_curso_interesse_id: cursoId,
        p_faixa_etaria: faixaEtaria.trim() || null,
        p_professor_experimental_id: professorId,
      });
      if (error) throw error;
      toast.success('Campos atualizados');
      onSalvo();
    } catch (e) {
      toast.error('Não foi possível salvar', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvandoCampos(false);
    }
  }

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

            {/* Campos faltantes — editável inline */}
            {camposFaltantes.length > 0 && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Campos pendentes ({camposFaltantes.length})
                </p>
                <p className="mt-1 text-[10px] text-amber-300/70">
                  Preencha abaixo e clique em Salvar — a Conciliação do Comercial reflete automaticamente.
                </p>
              </section>
            )}

            {/* Formulário de campos do lead */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Informações do lead
              </p>
              {carregando ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : (
                <div className="space-y-3">
                  <CampoTexto
                    icon={<Phone className="h-3.5 w-3.5" />}
                    rotulo="Telefone"
                    valor={telefone}
                    onChange={setTelefone}
                    placeholder="5521999999999"
                  />
                  <CampoSelect
                    icon={<Tag className="h-3.5 w-3.5" />}
                    rotulo="Canal de origem"
                    valor={canalId}
                    onChange={setCanalId}
                    opcoes={canais}
                    placeholder="Selecione o canal"
                  />
                  <CampoSelect
                    icon={<GraduationCap className="h-3.5 w-3.5" />}
                    rotulo="Curso de interesse"
                    valor={cursoId}
                    onChange={setCursoId}
                    opcoes={cursos}
                    placeholder="Selecione o curso"
                  />
                  <CampoTexto
                    icon={<User className="h-3.5 w-3.5" />}
                    rotulo="Faixa etária"
                    valor={faixaEtaria}
                    onChange={setFaixaEtaria}
                    placeholder="Ex.: 6-8 anos"
                  />
                  <CampoSelect
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    rotulo="Professor da experimental"
                    valor={professorId}
                    onChange={setProfessorId}
                    opcoes={professores}
                    placeholder="Selecione o professor"
                  />

                  {temMudanca && (
                    <button
                      type="button"
                      disabled={salvandoCampos}
                      onClick={salvarCampos}
                      className="w-full rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-2.5 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-600/30 disabled:opacity-50"
                    >
                      {salvandoCampos ? (
                        <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      )}
                      Salvar campos
                    </button>
                  )}
                </div>
              )}
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

function CampoTexto({ icon, rotulo, valor, onChange, placeholder }: {
  icon: React.ReactNode;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
        {icon}
        {rotulo}
      </label>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-violet-500/50 focus:outline-none"
      />
    </div>
  );
}

function CampoSelect({ icon, rotulo, valor, onChange, opcoes, placeholder }: {
  icon: React.ReactNode;
  rotulo: string;
  valor: number | null;
  onChange: (v: number | null) => void;
  opcoes: Opcao[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
        {icon}
        {rotulo}
      </label>
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 focus:border-violet-500/50 focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>{o.nome}</option>
        ))}
      </select>
    </div>
  );
}
