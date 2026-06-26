import { useState, useEffect } from 'react';

const parseLocalDate = (s: string | null | undefined): Date | null =>
  s ? new Date(s + 'T00:00:00') : null;

const formatLocalDate = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
import { supabase } from '@/lib/supabase';
import { X, Loader2, Save, User, GraduationCap, DollarSign, TrendingUp, History, AlertCircle, Plus, Users, Pencil, Brain, ExternalLink, MessageCircle, Search, Star, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerNascimento } from '@/components/ui/date-picker-nascimento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Aluno } from './AlunosPage';
import { ContatosAluno } from './ContatosAluno';
import { TimelinePesquisasAluno } from '../SucessoCliente/TimelinePesquisasAluno';
import {
  analisarMudancaParaSemParcela,
  buscarContextosStatusPagamento,
  deveExigirConfirmacaoDigitada,
  getConfirmacaoSemParcela,
  getStatusPagamentoLabel,
  registrarAuditoriaStatusPagamento,
  type ContextoStatusPagamento,
  type OrigemGovernancaStatusPagamento,
} from './statusPagamentoGovernanca';

interface ModalFichaAlunoProps {
  aluno: Aluno;
  onClose: () => void;
  onSalvar: () => void;
  professores: { id: number; nome: string }[];
  cursos: { id: number; nome: string; is_projeto_banda?: boolean }[];
  tiposMatricula: { id: number; nome: string }[];
  onAbrirOutroCurso?: (aluno: Aluno) => void;
}

interface AlunoCompleto extends Aluno {
  data_nascimento?: string;
  tipo_aluno?: string;
  canal_origem_id?: number;
  forma_pagamento_id?: number;
  professor_experimental_id?: number;
  valor_passaporte?: number;
  data_inicio_contrato?: string;
  data_fim_contrato?: string;
  data_ultima_renovacao?: string;
  numero_renovacoes?: number;
  is_segundo_curso?: boolean;
  is_ex_aluno?: boolean;
  is_aluno_retorno?: boolean;
  agente_comercial?: string;
}

interface Movimentacao {
  id: number;
  data: string;
  tipo: string;
  valor_parcela_anterior?: number;
  valor_parcela_novo?: number;
  observacoes?: string;
}

interface Renovacao {
  id: number;
  data_renovacao: string;
  valor_parcela_anterior: number;
  valor_parcela_novo: number;
  percentual_reajuste: number;
}

interface Anotacao {
  id: number;
  texto: string;
  categoria: string;
  criado_por: string;
  created_at: string;
  resolvido: boolean;
}

interface AulaHistorico {
  data_aula: string;
  status: 'presente' | 'ausente';
  curso_nome: string;
  turma_nome: string;
  professor_nome: string | null;
  nr_da_aula: number;
  cancelada: boolean;
}

interface GovernancaSemParcelaFichaState {
  contexto: ContextoStatusPagamento;
  origem: OrigemGovernancaStatusPagamento;
  salvando: boolean;
}

interface AnamneseRespostaPerfil {
  id: string;
  pergunta_numero: number;
  resposta_posicao: number;
}

interface AnamneseAluno {
  id: string;
  aluno_id: number;
  tipo_formulario: 'EMLA' | 'LAMK' | string;
  telefone_aluno?: string | null;
  entrevistador?: string | null;
  status?: string | null;
  genero?: string | null;
  possui_instrumento?: string | boolean | null;
  cursos_escolhidos?: unknown;
  objetivos?: unknown;
  tempo_para_metas?: string | null;
  tempo_disponivel_estudo?: string | null;
  experiencia_anterior?: unknown;
  interesse_bandas?: string | boolean | null;
  cuidado_medico?: string | null;
  medicacao_continua?: string | null;
  diagnosticos?: unknown;
  necessidade_apoio?: string | null;
  generos_musicais?: unknown;
  instrumentos_toca?: unknown;
  nivel_conhecimento_musical?: string | null;
  nivel_habilidade_instrumento?: string | null;
  motivo_procura_pais?: unknown;
  metas_pais?: unknown;
  fonte_exposicao_musical?: unknown;
  musicos_na_familia?: string | null;
  interesse_instrumento_cantar?: string | null;
  exposicao_telas?: string | null;
  comunicacao_crianca?: string | null;
  sono_crianca?: unknown;
  estereotipias?: string | null;
  situacao_responsaveis?: string | null;
  filiacao?: string | null;
  quem_traz_crianca?: unknown;
  temperamento_primario?: string | null;
  temperamento_secundario?: string | null;
  temperamento_codinome?: string | null;
  temperamento_contagem?: Record<string, number> | null;
  perfil_baby?: string | null;
  observacoes_entrevistador?: string | null;
  share_token?: string | null;
  created_at: string;
  anamnese_respostas_perfil?: AnamneseRespostaPerfil[];
}

const TEMPERAMENTO_META: Record<string, { emoji: string; label: string; color: string; soft: string }> = {
  CAZUZA: { emoji: '🔥', label: 'Colérico', color: 'text-red-400', soft: 'bg-red-500/15 border-red-500/30' },
  SLASH: { emoji: '⚡', label: 'Sanguíneo', color: 'text-blue-400', soft: 'bg-blue-500/15 border-blue-500/30' },
  FRANK: { emoji: '🎩', label: 'Fleumático', color: 'text-amber-400', soft: 'bg-amber-500/15 border-amber-500/30' },
  AMY: { emoji: '🌙', label: 'Melancólico', color: 'text-violet-400', soft: 'bg-violet-500/15 border-violet-500/30' },
};

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const registro = item as Record<string, unknown>;
          return String(registro.label || registro.nome || registro.valor || registro.value || '').trim();
        }
        return String(item).trim();
      })
      .filter(Boolean);
  }
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .flatMap(item => Array.isArray(item) ? item.map(sub => String(sub).trim()) : [String(item).trim()])
      .filter(Boolean);
  }
  return [];
}

function formatarDataHora(data: string | null | undefined) {
  if (!data) return '-';
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarBooleano(valor: string | boolean | null | undefined) {
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (!valor) return '-';
  const texto = String(valor).trim().toLowerCase();
  if (['sim', 'yes', 'true'].includes(texto)) return 'Sim';
  if (['nao', 'não', 'no', 'false'].includes(texto)) return 'Não';
  return String(valor);
}

function obterContagemTemperamento(contagem: Record<string, number> | null | undefined, chaves: string[]) {
  if (!contagem) return 0;
  return chaves.reduce((total, chave) => total + Number(contagem[chave] || 0), 0);
}

function normalizarTelefoneWhatsapp(telefone: string | null | undefined) {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORARIOS_LISTA = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const TIPOS_ALUNO = [
  { value: 'pagante', label: 'Pagante' },
  { value: 'bolsista_integral', label: 'Bolsista Integral' },
  { value: 'bolsista_parcial', label: 'Bolsista Parcial' },
  { value: 'nao_pagante', label: 'Não Pagante' },
];

// Mapeamento tipo_aluno → tipo_matricula_id para sincronização automática
// IDs: 1=Regular, 2=Segundo Curso, 3=Bolsista Integral, 4=Bolsista Parcial, 5=Banda
const TIPO_ALUNO_PARA_MATRICULA: Record<string, number> = {
  'bolsista_integral': 3,
  'bolsista_parcial': 4,
};

function AulasTurmasTabs({
  turmas,
  turmaKeys,
  diasSemana,
}: {
  turmas: Record<string, AulaHistorico[]>;
  turmaKeys: string[];
  diasSemana: string[];
}) {
  const [turmaSelecionada, setTurmaSelecionada] = useState(turmaKeys[0]);
  const aulas = turmas[turmaSelecionada] ?? [];
  const total = aulas.length;
  const presentes = aulas.filter(a => a.status === 'presente').length;
  const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
  const professor = aulas.find(a => a.professor_nome)?.professor_nome;
  const curso = aulas[0]?.curso_nome ?? '';

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs de turma */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {turmaKeys.map(t => (
          <button
            key={t}
            onClick={() => setTurmaSelecionada(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex-shrink-0 transition-colors ${
              t === turmaSelecionada
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Header da turma selecionada */}
      <div className="bg-slate-800 rounded-lg px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-100 text-sm">{curso}</p>
          <p className="text-xs text-slate-400 mt-0.5">{turmaSelecionada} · {professor || 'Professor não registrado'}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-400 font-medium">{presentes}P</span>
          <span className="text-red-400 font-medium">{total - presentes}F</span>
          <span className={`font-bold ${pct >= 75 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Lista de aulas */}
      <div className="border border-slate-700 rounded-lg divide-y divide-slate-700/40 overflow-hidden">
        {aulas.map((aula, i) => {
          const d = new Date(aula.data_aula + 'T00:00:00');
          return (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-7 text-xs">{diasSemana[d.getDay()]}</span>
                <span className="text-slate-300">{d.toLocaleDateString('pt-BR')}</span>
                <span className="text-slate-600 text-xs">#{aula.nr_da_aula}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                aula.status === 'presente'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {aula.status === 'presente' ? 'Presente' : 'Faltou'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ModalFichaAluno({
  aluno,
  onClose,
  onSalvar,
  professores,
  cursos,
  tiposMatricula,
  onAbrirOutroCurso,
}: ModalFichaAlunoProps) {
  const { user, usuario, perfis } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pessoal');
  
  // Dados completos do aluno
  const [dadosCompletos, setDadosCompletos] = useState<AlunoCompleto | null>(null);
  const [anamnese, setAnamnese] = useState<AnamneseAluno | null>(null);
  
  // Dados de lookup
  const [canais, setCanais] = useState<{ value: number; label: string }[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<{ value: number; label: string }[]>([]);
  
  // Histórico
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);

  // Histórico de Aulas
  const [aulasHistorico, setAulasHistorico] = useState<AulaHistorico[]>([]);
  const [loadingAulas, setLoadingAulas] = useState(false);
  const [aulasCarregadas, setAulasCarregadas] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    // Pessoal
    nome: '',
    data_nascimento: null as Date | null,
    is_ex_aluno: false,
    is_aluno_retorno: false,
    // Acadêmico
    curso_id: null as number | null,
    professor_atual_id: null as number | null,
    dia_aula: '',
    horario_aula: '',
    data_matricula: null as Date | null,
    data_inicio_contrato: null as Date | null,
    data_fim_contrato: null as Date | null,
    status: 'ativo',
    data_saida: null as Date | null,
    instagram: '',
    is_segundo_curso: false,
    // Financeiro
    tipo_aluno: 'pagante',
    tipo_matricula_id: 1,
    valor_parcela: null as number | null,
    valor_passaporte: null as number | null,
    forma_pagamento_id: null as number | null,
    dia_vencimento: 5,
    status_pagamento: 'em_dia',
    // Comercial
    canal_origem_id: null as number | null,
    professor_experimental_id: null as number | null,
    agente_comercial: '',
    // Responsável
    responsavel_nome: '',
    responsavel_telefone: '',
    responsavel_parentesco: '',
  });
  
  // Valor original da parcela (para detectar mudanças)
  const [valorParcelaOriginal, setValorParcelaOriginal] = useState<number | null>(null);
  
  // Outros cursos do mesmo aluno (registros com mesmo nome + data_nascimento + unidade)
  const [outrosCursos, setOutrosCursos] = useState<AlunoCompleto[]>([]);

  // Estado para modal de segundo curso
  const [modalSegundoCurso, setModalSegundoCurso] = useState(false);
  const [segundoCursoData, setSegundoCursoData] = useState({
    curso_id: null as number | null,
    professor_id: null as number | null,
    dia_aula: '',
    horario_aula: '',
    valor_parcela: null as number | null,
  });
  const [salvandoSegundoCurso, setSalvandoSegundoCurso] = useState(false);
  const [turmaSegundoCurso, setTurmaSegundoCurso] = useState<any>(null);
  const [carregandoTurma, setCarregandoTurma] = useState(false);
  const [governancaSemParcela, setGovernancaSemParcela] = useState<GovernancaSemParcelaFichaState | null>(null);
  const [justificativaSemParcela, setJustificativaSemParcela] = useState('');
  const [confirmacaoSemParcela, setConfirmacaoSemParcela] = useState('');

  // Estado para busca de anamnese pendente
  const [modalBuscaAnamnese, setModalBuscaAnamnese] = useState(false);
  const [buscandoAnamnese, setBuscandoAnamnese] = useState(false);
  const [candidatosAnamnese, setCandidatosAnamnese] = useState<any[]>([]);
  const [vinculandoAnamnese, setVinculandoAnamnese] = useState(false);

  const perfisAtivos = perfis.map((perfil) => perfil.perfil_nome.toLowerCase());
  const podeReenviarWhatsapp = usuario?.perfil === 'admin' || perfisAtivos.includes('admin') || perfisAtivos.includes('gerente');

  const telefonesWhatsapp = [anamnese?.telefone_aluno, dadosCompletos?.telefone, dadosCompletos?.responsavel_telefone, aluno.telefone, aluno.responsavel_telefone]
    .map(normalizarTelefoneWhatsapp)
    .filter((telefone): telefone is string => Boolean(telefone));
  const telefoneWhatsapp = telefonesWhatsapp[0] || null;

  useEffect(() => {
    carregarDadosCompletos();
  }, [aluno.id]);

  useEffect(() => {
    if (activeTab !== 'aulas' || aulasCarregadas) return;
    const carregar = async () => {
      setLoadingAulas(true);
      const { data } = await supabase.rpc('get_historico_aulas_aluno', { p_aluno_id: aluno.id });
      setAulasHistorico((data as AulaHistorico[]) || []);
      setAulasCarregadas(true);
      setLoadingAulas(false);
    };
    carregar();
  }, [activeTab, aluno.id, aulasCarregadas]);

  // Buscar turma quando professor, dia ou horário mudarem
  useEffect(() => {
    if (modalSegundoCurso) {
      buscarTurmaSegundoCurso();
    }
  }, [segundoCursoData.professor_id, segundoCursoData.dia_aula, segundoCursoData.horario_aula, modalSegundoCurso]);

  async function carregarDadosCompletos() {
    setLoading(true);
    try {
      // Carregar dados completos do aluno
      const { data: alunoData, error: alunoError } = await supabase
        .from('alunos')
        .select('*')
        .eq('id', aluno.id)
        .single();

      if (alunoError) throw alunoError;

      // Carregar lookups
      const [canaisRes, formasRes] = await Promise.all([
        supabase.from('canais_origem').select('id, nome').eq('ativo', true),
        supabase.from('formas_pagamento').select('id, nome').eq('ativo', true),
      ]);

      if (canaisRes.data) {
        setCanais(canaisRes.data.map(c => ({ value: c.id, label: c.nome })));
      }
      if (formasRes.data) {
        setFormasPagamento(formasRes.data.map(f => ({ value: f.id, label: f.nome })));
      }

      // Carregar histórico
      const [movRes, renRes, anotRes] = await Promise.all([
        supabase
          .from('movimentacoes_admin')
          .select('id, data, tipo, valor_parcela_anterior, valor_parcela_novo, observacoes')
          .eq('aluno_id', aluno.id)
          .order('data', { ascending: false })
          .limit(10),
        supabase
          .from('renovacoes')
          .select('id, data_renovacao, valor_parcela_anterior, valor_parcela_novo, percentual_reajuste')
          .eq('aluno_id', aluno.id)
          .order('data_renovacao', { ascending: false })
          .limit(5),
        supabase
          .from('anotacoes_alunos')
          .select('id, texto, categoria, criado_por, created_at, resolvido')
          .eq('aluno_id', aluno.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const { data: anamneseData } = await supabase
        .from('anamneses')
        .select('*, anamnese_respostas_perfil(*)')
        .eq('aluno_id', aluno.id)
        .eq('status', 'completa')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setMovimentacoes(movRes.data || []);
      setRenovacoes(renRes.data || []);
      setAnotacoes(anotRes.data || []);
      setAnamnese((anamneseData as AnamneseAluno | null) || null);

      // Buscar outros cursos do mesmo aluno (registros com mesmo nome + data_nascimento + unidade)
      if (alunoData.nome && alunoData.unidade_id) {
        let queryOutros = supabase
          .from('alunos')
          .select('*, cursos:curso_id(nome), professores:professor_atual_id(nome)')
          .eq('nome', alunoData.nome)
          .eq('unidade_id', alunoData.unidade_id)
          .neq('id', aluno.id)
          .in('status', ['ativo', 'trancado']);

        if (alunoData.data_nascimento) {
          queryOutros = queryOutros.eq('data_nascimento', alunoData.data_nascimento);
        }

        const { data: outrosData } = await queryOutros;
        setOutrosCursos((outrosData || []).map((o: any) => ({
          ...o,
          curso_nome: o.cursos?.nome || null,
          professor_nome: o.professores?.nome || null,
        })));
      }

      // Preencher form
      setDadosCompletos(alunoData);
      setValorParcelaOriginal(alunoData.valor_parcela);
      
      setFormData({
        nome: alunoData.nome || '',
        data_nascimento: alunoData.data_nascimento ? new Date(alunoData.data_nascimento) : null,
        is_ex_aluno: alunoData.is_ex_aluno || false,
        is_aluno_retorno: alunoData.is_aluno_retorno || false,
        curso_id: alunoData.curso_id,
        professor_atual_id: alunoData.professor_atual_id,
        dia_aula: alunoData.dia_aula || '',
        horario_aula: alunoData.horario_aula?.substring(0, 5) || '',
        data_matricula: parseLocalDate(alunoData.data_matricula),
        data_inicio_contrato: parseLocalDate(alunoData.data_inicio_contrato),
        data_fim_contrato: parseLocalDate(alunoData.data_fim_contrato),
        status: alunoData.status || 'ativo',
        data_saida: parseLocalDate(alunoData.data_saida),
        instagram: alunoData.instagram || '',
        is_segundo_curso: alunoData.is_segundo_curso || false,
        tipo_aluno: alunoData.tipo_aluno || 'pagante',
        tipo_matricula_id: alunoData.tipo_matricula_id || 1,
        valor_parcela: alunoData.valor_parcela,
        valor_passaporte: alunoData.valor_passaporte,
        forma_pagamento_id: alunoData.forma_pagamento_id,
        dia_vencimento: alunoData.dia_vencimento || 5,
        status_pagamento: alunoData.status_pagamento || 'em_dia',
        canal_origem_id: alunoData.canal_origem_id,
        professor_experimental_id: alunoData.professor_experimental_id,
        agente_comercial: alunoData.agente_comercial || '',
        responsavel_nome: alunoData.responsavel_nome || '',
        responsavel_telefone: alunoData.responsavel_telefone || '',
        responsavel_parentesco: alunoData.responsavel_parentesco || '',
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados do aluno');
    } finally {
      setLoading(false);
    }
  }

  function fecharGovernancaSemParcela() {
    setGovernancaSemParcela(null);
    setJustificativaSemParcela('');
    setConfirmacaoSemParcela('');
  }

  async function persistirAluno(motivoGovernanca?: string) {
    if (!formData.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      // Verificar se valor_parcela mudou para criar log
      const valorMudou = valorParcelaOriginal !== formData.valor_parcela && 
                         valorParcelaOriginal !== null && 
                         formData.valor_parcela !== null;

      // Atualizar aluno
      const { error: updateError } = await supabase
        .from('alunos')
        .update({
          nome: formData.nome.trim(),
          data_nascimento: formData.data_nascimento?.toISOString().split('T')[0] || null,
          is_ex_aluno: formData.is_ex_aluno,
          is_aluno_retorno: formData.is_aluno_retorno,
          curso_id: formData.curso_id,
          professor_atual_id: formData.professor_atual_id,
          dia_aula: formData.dia_aula || null,
          horario_aula: formData.horario_aula || null,
          data_matricula: formatLocalDate(formData.data_matricula),
          data_inicio_contrato: formatLocalDate(formData.data_inicio_contrato),
          data_fim_contrato: formatLocalDate(formData.data_fim_contrato),
          status: formData.status,
          data_saida: formatLocalDate(formData.data_saida),
          instagram: formData.instagram?.trim() || null,
          is_segundo_curso: formData.is_segundo_curso,
          tipo_aluno: formData.tipo_aluno,
          tipo_matricula_id: formData.tipo_matricula_id,
          valor_parcela: formData.valor_parcela,
          valor_passaporte: formData.valor_passaporte,
          forma_pagamento_id: formData.forma_pagamento_id,
          dia_vencimento: formData.dia_vencimento,
          status_pagamento: formData.status_pagamento,
          canal_origem_id: formData.canal_origem_id,
          professor_experimental_id: formData.professor_experimental_id,
          agente_comercial: formData.agente_comercial || null,
          responsavel_nome: formData.responsavel_nome?.trim() || null,
          responsavel_telefone: formData.responsavel_telefone?.trim() || null,
          responsavel_parentesco: formData.responsavel_parentesco || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'sistema',
        })
        .eq('id', aluno.id);

      if (updateError) throw updateError;

      // Se valor_parcela mudou, criar registro em movimentacoes_admin
      if (valorMudou) {
        const { error: logError } = await supabase
          .from('movimentacoes_admin')
          .insert({
            unidade_id: aluno.unidade_id,
            data: new Date().toISOString().split('T')[0],
            tipo: 'ajuste_valor',
            aluno_nome: formData.nome,
            aluno_id: aluno.id,
            professor_id: formData.professor_atual_id,
            curso_id: formData.curso_id,
            valor_parcela_anterior: valorParcelaOriginal,
            valor_parcela_novo: formData.valor_parcela,
            observacoes: `Ajuste de valor via Ficha do Aluno. Alterado por ${user?.email || 'sistema'}`,
            agente_comercial: user?.email || 'sistema',
          });

        if (logError) {
          console.error('Erro ao criar log de ajuste:', logError);
          // Não bloqueia o salvamento, apenas loga
        }
      }

      if (motivoGovernanca && governancaSemParcela?.contexto) {
        try {
          await registrarAuditoriaStatusPagamento({
            alunoId: aluno.id,
            alunoNome: formData.nome.trim(),
            ator: user?.email || usuario?.nome || 'sistema',
            antes: governancaSemParcela.contexto.status_pagamento,
            depois: 'sem_parcela',
            motivo: motivoGovernanca,
            origem: 'ficha_aluno',
          });
        } catch (auditError) {
          console.error('Erro ao registrar auditoria de status_pagamento:', auditError);
          toast.warning('Aluno salvo, mas a anotação de auditoria falhou.');
        }
      }

      toast.success('Dados salvos com sucesso!');
      fecharGovernancaSemParcela();
      onSalvar();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSalvar() {
    if (
      dadosCompletos?.status_pagamento !== 'sem_parcela' &&
      formData.status_pagamento === 'sem_parcela'
    ) {
      try {
        const [contexto] = await buscarContextosStatusPagamento([aluno.id]);
        if (!contexto) {
          toast.error('Não foi possível validar a governança deste aluno.');
          return;
        }
        setGovernancaSemParcela({ contexto, origem: 'ficha_aluno', salvando: false });
        return;
      } catch (error: any) {
        console.error('Erro ao validar governança de status_pagamento:', error);
        toast.error(error.message || 'Erro ao validar mudança para "Sem Parcela".');
        return;
      }
    }

    await persistirAluno();
  }

  async function confirmarGovernancaSemParcela() {
    if (!governancaSemParcela) return;

    const motivo = justificativaSemParcela.trim();
    const exigeConfirmacaoDigitada = deveExigirConfirmacaoDigitada(
      governancaSemParcela.origem,
      analisarMudancaParaSemParcela(governancaSemParcela.contexto)
    );
    if (motivo.length < 12) {
      toast.error('Descreva uma justificativa com pelo menos 12 caracteres.');
      return;
    }
    if (
      exigeConfirmacaoDigitada &&
      confirmacaoSemParcela.trim().toUpperCase() !== getConfirmacaoSemParcela()
    ) {
      toast.error(`Digite ${getConfirmacaoSemParcela()} para confirmar.`);
      return;
    }

    setGovernancaSemParcela(prev => prev ? { ...prev, salvando: true } : prev);
    try {
      await persistirAluno(motivo);
    } finally {
      setGovernancaSemParcela(prev => prev ? { ...prev, salvando: false } : prev);
    }
  }

  // Buscar turma baseado em professor + dia + horário
  async function buscarTurmaSegundoCurso() {
    if (!segundoCursoData.professor_id || !segundoCursoData.dia_aula || !segundoCursoData.horario_aula) {
      setTurmaSegundoCurso(null);
      return;
    }

    setCarregandoTurma(true);
    try {
      const { data: turmaData } = await supabase
        .from('vw_turmas_implicitas')
        .select('*')
        .eq('unidade_id', aluno.unidade_id)
        .eq('professor_id', segundoCursoData.professor_id)
        .eq('dia_semana', segundoCursoData.dia_aula)
        .eq('horario_inicio', segundoCursoData.horario_aula)
        .maybeSingle();

      setTurmaSegundoCurso(turmaData);
    } catch (error) {
      console.error('Erro ao buscar turma:', error);
    } finally {
      setCarregandoTurma(false);
    }
  }

  // Função para criar segundo curso (novo registro de aluno)
  async function handleCriarSegundoCurso() {
    if (!segundoCursoData.curso_id) {
      toast.error('Selecione o curso');
      return;
    }
    if (!segundoCursoData.professor_id) {
      toast.error('Selecione o professor');
      return;
    }

    setSalvandoSegundoCurso(true);
    try {
      // Guarda anti-duplicata: a pessoa não pode ter 2 matrículas ativas/trancadas no MESMO curso.
      // Curso diferente = segundo curso legítimo; curso igual = duplicata. Usa ilike (case-insensitive)
      // pra pegar variações de caixa do nome que o .eq() de outrosCursos não cobre (ex: "Moura"/"moura").
      const nomePessoa = (dadosCompletos?.nome || '').trim();
      if (nomePessoa) {
        const { data: jaTem } = await supabase
          .from('alunos')
          .select('id, status, cursos:curso_id(nome)')
          .eq('unidade_id', aluno.unidade_id)
          .eq('curso_id', segundoCursoData.curso_id)
          .ilike('nome', nomePessoa)
          .in('status', ['ativo', 'trancado']);

        if (jaTem && jaTem.length > 0) {
          const nomeCurso = (jaTem[0] as any).cursos?.nome || 'esse curso';
          toast.error(`${nomePessoa} já tem matrícula ativa em ${nomeCurso}. Não dá para adicionar o mesmo curso duas vezes — isso geraria uma duplicata. Segundo curso só vale para um curso diferente.`);
          setSalvandoSegundoCurso(false);
          return;
        }
      }

      const dataHoje = new Date().toISOString().split('T')[0];
      const dataFimContrato = new Date();
      dataFimContrato.setFullYear(dataFimContrato.getFullYear() + 1);

      const cursoSelecionadoEhBanda = cursos.find(c => c.id === segundoCursoData.curso_id)?.is_projeto_banda;
      // Preservar tipo_matricula_id se for bolsista (3=Integral, 4=Parcial)
      // Só força 2 (Segundo Curso) se for pagante regular (1)
      const tipoMatriculaId = cursoSelecionadoEhBanda
        ? 5  // Banda
        : ([3, 4].includes(formData.tipo_matricula_id)
            ? formData.tipo_matricula_id  // Preserva bolsista integral/parcial
            : 2);  // Segundo Curso (só para pagante regular)
      const isSegundoCurso = cursoSelecionadoEhBanda ? null : true;

      const { error } = await supabase.from('alunos').insert({
        nome: dadosCompletos?.nome,
        unidade_id: aluno.unidade_id,
        data_nascimento: dadosCompletos?.data_nascimento,
        status: 'ativo',
        tipo_aluno: formData.tipo_aluno,
        tipo_matricula_id: tipoMatriculaId,
        valor_parcela: segundoCursoData.valor_parcela !== null ? segundoCursoData.valor_parcela : formData.valor_parcela,
        forma_pagamento_id: formData.forma_pagamento_id,
        dia_vencimento: formData.dia_vencimento,
        data_matricula: dataHoje,
        data_inicio_contrato: dataHoje,
        data_fim_contrato: dataFimContrato.toISOString().split('T')[0],
        curso_id: segundoCursoData.curso_id,
        professor_atual_id: segundoCursoData.professor_id,
        dia_aula: segundoCursoData.dia_aula || null,
        horario_aula: segundoCursoData.horario_aula || null,
        canal_origem_id: formData.canal_origem_id,
        agente_comercial: user?.email || null,
        is_segundo_curso: isSegundoCurso,
        is_ex_aluno: false,
        is_aluno_retorno: false,
      });

      if (error) throw error;

      toast.success('Segundo curso cadastrado com sucesso!');
      setModalSegundoCurso(false);
      setSegundoCursoData({
        curso_id: null,
        professor_id: null,
        dia_aula: '',
        horario_aula: '',
        valor_parcela: null,
      });
      // Recarregar dados para atualizar a lista de outros cursos na aba Acadêmica
      carregarDadosCompletos();
      onSalvar();
    } catch (error: any) {
      console.error('Erro ao criar segundo curso:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setSalvandoSegundoCurso(false);
    }
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString('pt-BR');
  }

  function formatarMoeda(valor: number | null | undefined) {
    if (valor === null || valor === undefined) return '-';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function abrirPerfilAnamnese() {
    if (!anamnese?.share_token) return;
    window.open(`https://anamnese-la-music.vercel.app/perfil/${anamnese.share_token}`, '_blank', 'noopener,noreferrer');
  }

  function reenviarWhatsappAnamnese() {
    if (!anamnese?.share_token || !telefoneWhatsapp) return;
    const link = `https://anamnese-la-music.vercel.app/perfil/${anamnese.share_token}`;
    const mensagem = encodeURIComponent(`Olá! Segue o link da anamnese de ${dadosCompletos?.nome || aluno.nome}: ${link}`);
    window.open(`https://wa.me/${telefoneWhatsapp}?text=${mensagem}`, '_blank', 'noopener,noreferrer');
  }

  async function handleBuscarAnamnese() {
    setBuscandoAnamnese(true);
    try {
      const { data, error } = await supabase
        .rpc('buscar_anamneses_pendentes', { p_aluno_id: aluno.id });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.info('Nenhuma anamnese pendente encontrada para este aluno.');
        setModalBuscaAnamnese(false);
      } else {
        setCandidatosAnamnese(data);
        setModalBuscaAnamnese(true);
      }
    } catch (error: any) {
      console.error('Erro ao buscar anamneses pendentes:', error);
      toast.error(`Erro ao buscar anamneses: ${error.message}`);
    } finally {
      setBuscandoAnamnese(false);
    }
  }

  async function handleVincularAnamnese(anamneseId: number) {
    setVinculandoAnamnese(true);
    try {
      const { data, error } = await supabase
        .rpc('vincular_anamnese_aluno', {
          p_anamnese_id: anamneseId,
          p_aluno_id: aluno.id,
        });

      if (error) throw error;

      if (data?.ok) {
        toast.success('Anamnese vinculada com sucesso!');
        setModalBuscaAnamnese(false);
        setCandidatosAnamnese([]);
        // Recarregar anamnese do aluno
        const { data: anamneseData } = await supabase
          .from('anamneses')
          .select('*, anamnese_respostas_perfil(*)')
          .eq('aluno_id', aluno.id)
          .eq('status', 'completa')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setAnamnese((anamneseData as AnamneseAluno | null) || null);
        // Recarregar dados completos do aluno para atualizar temperamento
        carregarDadosCompletos();
      } else {
        toast.error(data?.erro || 'Erro ao vincular anamnese');
      }
    } catch (error: any) {
      console.error('Erro ao vincular anamnese:', error);
      toast.error(`Erro ao vincular: ${error.message}`);
    } finally {
      setVinculandoAnamnese(false);
    }
  }

  const diagnosticos = toArray(anamnese?.diagnosticos);
  const objetivos = toArray(anamnese?.objetivos);
  const generosMusicais = toArray(anamnese?.generos_musicais);
  const motivoPais = toArray(anamnese?.motivo_procura_pais);
  const metasPais = toArray(anamnese?.metas_pais);
  const cursosEscolhidos = toArray(anamnese?.cursos_escolhidos);
  const contagemTemperamento = anamnese?.temperamento_contagem || null;
  const colerico = obterContagemTemperamento(contagemTemperamento, ['col', 'colerico', 'colérico']);
  const sanguineo = obterContagemTemperamento(contagemTemperamento, ['san', 'sanguineo', 'sanguíneo']);
  const fleumatico = obterContagemTemperamento(contagemTemperamento, ['fle', 'fleumatico', 'fleumático']);
  const melancolico = obterContagemTemperamento(contagemTemperamento, ['mel', 'melancolico', 'melancólico']);
  const primaryCode = (anamnese?.temperamento_primario || '').toUpperCase();
  const secondaryCode = (anamnese?.temperamento_secundario || '').toUpperCase();
  const primaryMeta = TEMPERAMENTO_META[primaryCode];
  const secondaryMeta = TEMPERAMENTO_META[secondaryCode];
  const codinomeMeta = TEMPERAMENTO_META[(anamnese?.temperamento_codinome || '').toUpperCase()];

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <span className="ml-3 text-slate-400">Carregando dados do aluno...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const fotoPerfil = dadosCompletos?.foto_url || aluno?.foto_url || dadosCompletos?.photo_url || aluno?.photo_url || null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            {fotoPerfil ? (
              <img src={fotoPerfil} alt={formData.nome} className="w-14 h-14 rounded-full object-cover border-2 border-purple-500/50" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center">
                <User className="w-6 h-6 text-purple-400" />
              </div>
            )}
            <div>
              <span className="text-lg">Ficha do Aluno</span>
              <p className="text-sm text-slate-400 font-normal">{formData.nome || 'Sem nome'}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-8 flex-shrink-0">
            <TabsTrigger value="pessoal" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Pessoal</span>
            </TabsTrigger>
            <TabsTrigger value="academico" className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              <span className="hidden sm:inline">Acadêmico</span>
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Financeiro</span>
            </TabsTrigger>
            <TabsTrigger value="comercial" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Comercial</span>
            </TabsTrigger>
            <TabsTrigger value="anamnese" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              <span className="hidden sm:inline">Anamnese</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
            <TabsTrigger value="pesquisas" className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Pesquisas</span>
            </TabsTrigger>
            <TabsTrigger value="aulas" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Aulas</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            {/* ABA PESSOAL */}
            <TabsContent value="pessoal" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="mb-2 block">Nome Completo *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Nome do aluno"
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Data de Nascimento</Label>
                  <DatePickerNascimento
                    date={formData.data_nascimento}
                    onDateChange={(date) => setFormData({ ...formData, data_nascimento: date })}
                    placeholder="Selecione..."
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Idade / Classificação</Label>
                  <div className="flex items-center gap-3 h-10 px-3 bg-slate-800/50 border border-slate-700 rounded-md">
                    <span className="text-slate-300">
                      {dadosCompletos?.idade_atual ? `${dadosCompletos.idade_atual} anos` : '-'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      dadosCompletos?.classificacao === 'LAMK' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {dadosCompletos?.classificacao || '-'}
                    </span>
                    <span className="text-xs text-slate-500">(calculado)</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="mb-2 block">Instagram</Label>
                  <Input
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="@usuario ou link do perfil"
                  />
                </div>
              </div>

              <ContatosAluno alunoId={aluno.id} nomeAluno={aluno.nome} />

              <div className="border-t border-slate-700 pt-4">
                <Label className="mb-3 block text-slate-400">Flags do Aluno</Label>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.is_ex_aluno}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_ex_aluno: !!checked })}
                    />
                    <span className="text-sm">É ex-aluno (já estudou antes)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.is_aluno_retorno}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_aluno_retorno: !!checked })}
                    />
                    <span className="text-sm">É aluno retorno</span>
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* ABA ACADÊMICO */}
            <TabsContent value="academico" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Curso</Label>
                  <Select
                    value={formData.curso_id?.toString() || ''}
                    onValueChange={(value) => {
                      const cursoId = value ? parseInt(value) : null;
                      const cursoEhBanda = cursoId ? cursos.find(c => c.id === cursoId)?.is_projeto_banda : false;
                      setFormData({
                        ...formData,
                        curso_id: cursoId,
                        is_segundo_curso: cursoEhBanda ? false : formData.is_segundo_curso,
                        tipo_matricula_id: cursoEhBanda ? 5 : (formData.tipo_matricula_id === 5 ? 1 : formData.tipo_matricula_id),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o curso..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cursos.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Professor Atual</Label>
                  <Select
                    value={formData.professor_atual_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, professor_atual_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o professor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {professores.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Dia da Aula</Label>
                  <Select
                    value={formData.dia_aula || ''}
                    onValueChange={(value) => setFormData({ ...formData, dia_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o dia..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DIAS_SEMANA.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Horário</Label>
                  <Select
                    value={formData.horario_aula || ''}
                    onValueChange={(value) => setFormData({ ...formData, horario_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o horário..." />
                    </SelectTrigger>
                    <SelectContent>
                      {HORARIOS_LISTA.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Data de Matrícula</Label>
                  <DatePicker
                    date={formData.data_matricula}
                    onDateChange={(date) => setFormData({ ...formData, data_matricula: date })}
                    placeholder="Selecione..."
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Tempo: {dadosCompletos?.tempo_permanencia_meses 
                      ? `${dadosCompletos.tempo_permanencia_meses} meses` 
                      : '-'} (calculado)
                  </p>
                </div>

                <div>
                  <Label className="mb-2 block">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="aviso_previo">Aviso Prévio</SelectItem>
                      <SelectItem value="trancado">Trancado</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(formData.status === 'inativo' || formData.status === 'evadido') && (
                  <div>
                    <Label className="mb-2 block">Data de Saída</Label>
                    <DatePicker
                      date={formData.data_saida}
                      onDateChange={(date) => setFormData({ ...formData, data_saida: date })}
                      placeholder="Selecione..."
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-slate-700 pt-4">
                <Label className="mb-3 block text-slate-400">Contrato</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block text-sm">Início do Contrato</Label>
                    <DatePicker
                      date={formData.data_inicio_contrato}
                      onDateChange={(date) => setFormData({ ...formData, data_inicio_contrato: date })}
                      placeholder="Selecione..."
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm">Fim do Contrato</Label>
                    <DatePicker
                      date={formData.data_fim_contrato}
                      onDateChange={(date) => setFormData({ ...formData, data_fim_contrato: date })}
                      placeholder="Selecione..."
                    />
                  </div>
                </div>
              </div>

              {/* Outros cursos do aluno */}
              {outrosCursos.length > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <Label className="mb-3 block text-slate-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Outros Cursos ({outrosCursos.length})
                  </Label>
                  <div className="space-y-2">
                    {outrosCursos.map((outro) => (
                      <div key={outro.id} className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Curso: </span>
                            <span className="text-white font-medium">{outro.curso_nome || '-'}</span>
                            {(() => {
                              const ehBanda = cursos.find(c => c.id === outro.curso_id)?.is_projeto_banda;
                              if (ehBanda) {
                                return <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-medium">Projeto / Banda</span>;
                              }
                              if (outro.is_segundo_curso) {
                                return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-medium">2º curso</span>;
                              }
                              return null;
                            })()}
                          </div>
                          <div>
                            <span className="text-slate-400">Professor: </span>
                            <span className="text-white">{outro.professor_nome || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Dia: </span>
                            <span className="text-white">{outro.dia_aula || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Horário: </span>
                            <span className="text-white">{outro.horario_aula?.substring(0, 5) || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Valor: </span>
                            <span className="text-white">{outro.valor_parcela != null ? `R$ ${outro.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Status: </span>
                            <span className={`font-medium ${outro.status === 'ativo' ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {outro.status === 'ativo' ? 'Ativo' : outro.status === 'trancado' ? 'Trancado' : outro.status}
                            </span>
                          </div>
                        </div>
                        {onAbrirOutroCurso && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onAbrirOutroCurso(outro as Aluno)}
                            className="ml-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-700 pt-4 flex items-center justify-between">
                {(() => {
                  const cursoEhBanda = formData.curso_id ? cursos.find(c => c.id === formData.curso_id)?.is_projeto_banda : false;
                  if (cursoEhBanda) {
                    return (
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-medium">
                          Projeto / Banda
                        </span>
                        <span className="text-xs text-slate-400">Categoria especial — não é segundo curso financeiro</span>
                      </div>
                    );
                  }
                  return (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.is_segundo_curso}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_segundo_curso: !!checked, tipo_matricula_id: !!checked ? 2 : 1 })}
                      />
                      <span className="text-sm">É segundo curso (aluno já faz outro instrumento)</span>
                    </label>
                  );
                })()}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalSegundoCurso(true)}
                  className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Curso
                </Button>
              </div>
            </TabsContent>

            {/* ABA FINANCEIRO */}
            <TabsContent value="financeiro" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Tipo de Aluno</Label>
                  <Select
                    value={formData.tipo_aluno}
                    onValueChange={(value) => {
                      const updates: any = { tipo_aluno: value };
                      // Sincronizar tipo_matricula_id quando muda para bolsista
                      if (TIPO_ALUNO_PARA_MATRICULA[value]) {
                        updates.tipo_matricula_id = TIPO_ALUNO_PARA_MATRICULA[value];
                      } else if (value === 'pagante' && formData.tipo_matricula_id && [3, 4].includes(formData.tipo_matricula_id)) {
                        // Se voltou para pagante e tipo_matricula era bolsista, restaurar para Regular
                        updates.tipo_matricula_id = formData.is_segundo_curso ? 2 : 1;
                      }
                      setFormData({ ...formData, ...updates });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ALUNO.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Tipo de Matrícula</Label>
                  <Select
                    value={formData.tipo_matricula_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, tipo_matricula_id: value ? parseInt(value) : 1 })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposMatricula.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Valor da Parcela</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                    <Input
                      type="number"
                      value={formData.valor_parcela || ''}
                      onChange={(e) => setFormData({ ...formData, valor_parcela: e.target.value ? parseFloat(e.target.value) : null })}
                      className="pl-10"
                      placeholder="0,00"
                    />
                  </div>
                  {valorParcelaOriginal !== formData.valor_parcela && valorParcelaOriginal !== null && formData.valor_parcela !== null && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Alteração será registrada no histórico
                    </p>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Valor do Passaporte</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                    <Input
                      type="number"
                      value={formData.valor_passaporte || ''}
                      onChange={(e) => setFormData({ ...formData, valor_passaporte: e.target.value ? parseFloat(e.target.value) : null })}
                      className="pl-10"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Forma de Pagamento</Label>
                  <Select
                    value={formData.forma_pagamento_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formasPagamento.map((f) => (
                        <SelectItem key={f.value} value={f.value.toString()}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Dia de Vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={formData.dia_vencimento}
                    onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 5 })}
                  />
                </div>

                <div className="col-span-2">
                  <Label className="mb-2 block">Status de Pagamento (mês atual)</Label>
                  <Select
                    value={formData.status_pagamento}
                    onValueChange={(value) => setFormData({ ...formData, status_pagamento: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_dia">✓ Em dia</SelectItem>
                      <SelectItem value="inadimplente">✗ Inadimplente</SelectItem>
                      <SelectItem value="parcial">~ Parcial</SelectItem>
                      <SelectItem value="sem_parcela">○ Sem Parcela</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-slate-400">
                    Marcar como <strong className="text-slate-200">Sem Parcela</strong> exige justificativa e confirmação forte
                    quando a matrícula regular/2º curso estiver ativa com contrato vigente ou aula recente.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* ABA COMERCIAL */}
            <TabsContent value="comercial" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Canal de Origem</Label>
                  <Select
                    value={formData.canal_origem_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, canal_origem_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {canais.map((c) => (
                        <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Professor da Experimental</Label>
                  <Select
                    value={formData.professor_experimental_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, professor_experimental_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {professores.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label className="mb-2 block">Agente Comercial (Hunter)</Label>
                  <Input
                    value={formData.agente_comercial}
                    onChange={(e) => setFormData({ ...formData, agente_comercial: e.target.value })}
                    placeholder="Nome do hunter que matriculou"
                  />
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <Label className="mb-3 block text-slate-400">Dados de Renovação (somente leitura)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Última Renovação</p>
                    <p className="text-sm text-slate-300">
                      {dadosCompletos?.data_ultima_renovacao 
                        ? formatarData(dadosCompletos.data_ultima_renovacao) 
                        : 'Nunca renovou'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Nº de Renovações</p>
                    <p className="text-sm text-slate-300">
                      {dadosCompletos?.numero_renovacoes || 0}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="anamnese" className="space-y-4 mt-0">
              {anamnese ? (
                <>
                  <div className={`rounded-xl border p-4 ${codinomeMeta?.soft || 'bg-slate-800/50 border-slate-700'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-300 flex items-center gap-2">
                          <Brain className="w-4 h-4" />
                          Perfil de Temperamento
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xl font-semibold text-white">
                          <span className={primaryMeta?.color || 'text-white'}>{primaryMeta?.emoji || '🧠'} {primaryCode || '-'}</span>
                          <span className="text-slate-500">/</span>
                          <span className={secondaryMeta?.color || 'text-white'}>{secondaryMeta?.emoji || '🧠'} {secondaryCode || '-'}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">
                          {primaryMeta?.label || anamnese.temperamento_primario || '-'} + {secondaryMeta?.label || anamnese.temperamento_secundario || '-'}
                        </p>
                      </div>
                      {anamnese.temperamento_codinome && (
                        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${codinomeMeta?.soft || 'bg-slate-700/50 border-slate-600'} ${codinomeMeta?.color || 'text-slate-200'}`}>
                          {codinomeMeta?.emoji || '🧠'} {anamnese.temperamento_codinome}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Col', valor: colerico, cls: 'bg-red-500' },
                        { label: 'San', valor: sanguineo, cls: 'bg-blue-500' },
                        { label: 'Fle', valor: fleumatico, cls: 'bg-amber-500' },
                        { label: 'Mel', valor: melancolico, cls: 'bg-violet-500' },
                      ].map((item) => (
                        <div key={item.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-300">
                            <span>{item.label}</span>
                            <span>{item.valor}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-900/60 overflow-hidden">
                            <div className={`h-full ${item.cls}`} style={{ width: `${Math.min(item.valor * 14, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-4 text-xs text-slate-400">
                      Preenchido em: {formatarDataHora(anamnese.created_at)}{anamnese.entrevistador ? ` por ${anamnese.entrevistador}` : ''}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                      <h4 className="text-sm font-medium text-slate-200 mb-3">⚠️ Saúde e Necessidades</h4>
                      <div className="space-y-2 text-sm text-slate-300">
                        <p><span className="text-slate-400">Diagnósticos:</span> {diagnosticos.length ? diagnosticos.join(', ') : 'Não informado'}</p>
                        <p><span className="text-slate-400">Medicação:</span> {anamnese.medicacao_continua || 'Não informado'}</p>
                        <p><span className="text-slate-400">Cuidado médico:</span> {anamnese.cuidado_medico || 'Não informado'}</p>
                        <p><span className="text-slate-400">Apoio necessário:</span> {anamnese.necessidade_apoio || 'Não informado'}</p>
                        {anamnese.tipo_formulario === 'LAMK' && (
                          <p><span className="text-slate-400">Comunicação:</span> {anamnese.comunicacao_crianca || 'Não informado'}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                      <h4 className="text-sm font-medium text-slate-200 mb-3">🎯 Objetivos</h4>
                      <div className="space-y-2 text-sm text-slate-300">
                        <p><span className="text-slate-400">Objetivos:</span> {objetivos.length ? objetivos.join(', ') : 'Não informado'}</p>
                        <p><span className="text-slate-400">Tempo de estudo:</span> {anamnese.tempo_disponivel_estudo || 'Não informado'}</p>
                        <p><span className="text-slate-400">Tem instrumento:</span> {formatarBooleano(anamnese.possui_instrumento)}</p>
                        <p><span className="text-slate-400">Interesse bandas:</span> {formatarBooleano(anamnese.interesse_bandas)}</p>
                        <p><span className="text-slate-400">Tempo para metas:</span> {anamnese.tempo_para_metas || 'Não informado'}</p>
                        {cursosEscolhidos.length > 0 && (
                          <p><span className="text-slate-400">Cursos escolhidos:</span> {cursosEscolhidos.join(', ')}</p>
                        )}
                        {anamnese.tipo_formulario === 'EMLA' ? (
                          <>
                            <p><span className="text-slate-400">Nível musical:</span> {anamnese.nivel_conhecimento_musical || 'Não informado'}</p>
                            <p><span className="text-slate-400">Nível instrumento:</span> {anamnese.nivel_habilidade_instrumento || 'Não informado'}</p>
                            <p><span className="text-slate-400">Gêneros:</span> {generosMusicais.length ? generosMusicais.join(', ') : 'Não informado'}</p>
                          </>
                        ) : (
                          <>
                            <p><span className="text-slate-400">Motivo pais:</span> {motivoPais.length ? motivoPais.join(', ') : 'Não informado'}</p>
                            <p><span className="text-slate-400">Metas pais:</span> {metasPais.length ? metasPais.join(', ') : 'Não informado'}</p>
                            <p><span className="text-slate-400">Exposição telas:</span> {anamnese.exposicao_telas || 'Não informado'}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                    <h4 className="text-sm font-medium text-slate-200 mb-3">📝 Observações do Entrevistador</h4>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">
                      {anamnese.observacoes_entrevistador || 'Sem observações registradas.'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                    <h4 className="text-sm font-medium text-slate-200 mb-3">🔗 Ações</h4>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={abrirPerfilAnamnese} disabled={!anamnese.share_token}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Ver anamnese completa
                      </Button>
                      {podeReenviarWhatsapp && (
                        <Button type="button" variant="outline" onClick={reenviarWhatsappAnamnese} disabled={!anamnese.share_token || !telefoneWhatsapp}>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Reenviar WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/60">
                    <Brain className="w-6 h-6 text-slate-300" />
                  </div>
                  <h4 className="text-base font-medium text-white">Anamnese não preenchida</h4>
                  <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
                    Este aluno ainda não possui anamnese. A anamnese é preenchida pelo responsável no tablet da recepção durante a matrícula.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={handleBuscarAnamnese}
                    disabled={buscandoAnamnese}
                  >
                    {buscandoAnamnese ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Buscar anamnese
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ABA HISTÓRICO */}
            <TabsContent value="historico" className="space-y-6 mt-0">
              {/* Movimentações */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Últimas Movimentações
                </h4>
                {movimentacoes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Nenhuma movimentação registrada</p>
                ) : (
                  <div className="space-y-2">
                    {movimentacoes.map((mov) => (
                      <div key={mov.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-purple-400 uppercase">{mov.tipo}</span>
                          <span className="text-xs text-slate-500">{formatarData(mov.data)}</span>
                        </div>
                        {mov.valor_parcela_anterior && mov.valor_parcela_novo && (
                          <p className="text-sm text-slate-300">
                            {formatarMoeda(mov.valor_parcela_anterior)} → {formatarMoeda(mov.valor_parcela_novo)}
                          </p>
                        )}
                        {mov.observacoes && (
                          <p className="text-xs text-slate-400 mt-1">{mov.observacoes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Renovações */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Histórico de Renovações
                </h4>
                {renovacoes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Nenhuma renovação registrada</p>
                ) : (
                  <div className="space-y-2">
                    {renovacoes.map((ren) => (
                      <div key={ren.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">{formatarData(ren.data_renovacao)}</span>
                          <span className={`text-xs font-medium ${ren.percentual_reajuste > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {ren.percentual_reajuste > 0 ? `+${ren.percentual_reajuste.toFixed(1)}%` : 'Sem reajuste'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">
                          {formatarMoeda(ren.valor_parcela_anterior)} → {formatarMoeda(ren.valor_parcela_novo)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Anotações */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  📝 Anotações Recentes
                </h4>
                {anotacoes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Nenhuma anotação registrada</p>
                ) : (
                  <div className="space-y-2">
                    {anotacoes.map((anot) => {
                      const emoji: Record<string, string> = { 
                        geral: '📝', pedagogico: '📚', financeiro: '💰', 
                        comportamento: '⚠️', elogio: '⭐', reclamacao: '😤', contato: '📞' 
                      };
                      return (
                        <div 
                          key={anot.id} 
                          className={`bg-slate-800/50 border rounded-lg p-3 ${
                            anot.resolvido ? 'border-slate-700 opacity-60' : 'border-purple-500/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">
                              {emoji[anot.categoria] || '📝'} {anot.categoria}
                              {anot.resolvido && <span className="ml-2 text-emerald-400">✓ Resolvido</span>}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatarData(anot.created_at)} • {anot.criado_por}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300">{anot.texto}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="pesquisas" className="space-y-4 mt-0">
              <TimelinePesquisasAluno alunoId={aluno.id} alunoNome={aluno.nome} />
            </TabsContent>

            {/* ABA AULAS */}
            <TabsContent value="aulas" className="mt-0">
              {loadingAulas ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : aulasHistorico.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma aula registrada</p>
                </div>
              ) : (() => {
                const turmas = aulasHistorico.reduce<Record<string, AulaHistorico[]>>((acc, aula) => {
                  if (!acc[aula.turma_nome]) acc[aula.turma_nome] = [];
                  acc[aula.turma_nome].push(aula);
                  return acc;
                }, {});
                const turmaKeys = Object.keys(turmas);
                const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                return (
                  <AulasTurmasTabs turmas={turmas} turmaKeys={turmaKeys} diasSemana={diasSemana} />
                );
              })()}
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer com botões */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={saving} className="bg-purple-600 hover:bg-purple-500">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={!!governancaSemParcela} onOpenChange={(open) => !open && fecharGovernancaSemParcela()}>
        <AlertDialogContent className="max-w-2xl">
          {(() => {
            const exigeConfirmacaoDigitada = governancaSemParcela
              ? deveExigirConfirmacaoDigitada(
                  governancaSemParcela.origem,
                  analisarMudancaParaSemParcela(governancaSemParcela.contexto)
                )
              : false;

            return (
              <>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-300">
              <AlertCircle className="w-5 h-5" />
              Confirmar "Sem Parcela" na ficha
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-slate-300">
              <p>
                Esta alteração será gravada com rastreio de usuário, antes/depois, motivo e origem em
                <code> anotacoes_alunos</code>.
              </p>
              {governancaSemParcela && (() => {
                const analise = analisarMudancaParaSemParcela(governancaSemParcela.contexto);
                return (
                  <div className={`rounded-lg border p-3 ${
                    analise.exigeConfirmacaoForte
                      ? 'border-red-500/40 bg-red-500/10'
                      : 'border-slate-700 bg-slate-800/70'
                  }`}>
                    <p className="font-medium text-white">
                      {governancaSemParcela.contexto.nome}: {getStatusPagamentoLabel(governancaSemParcela.contexto.status_pagamento)} → {getStatusPagamentoLabel('sem_parcela')}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {analise.motivos.length > 0 ? (
                        analise.motivos.map((motivo) => <li key={motivo}>• {motivo}</li>)
                      ) : (
                        <li>• Sem sinais ativos adicionais; ainda assim exige justificativa.</li>
                      )}
                    </ul>
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Justificativa obrigatória</Label>
              <Textarea
                value={justificativaSemParcela}
                onChange={(e) => setJustificativaSemParcela(e.target.value)}
                placeholder="Ex.: cobrança suspensa após validação com ADM; matrícula continua ativa para frequência."
                className="min-h-[96px]"
              />
            </div>
            {exigeConfirmacaoDigitada ? (
              <div className="space-y-2">
                <Label>Digite {getConfirmacaoSemParcela()} para confirmar</Label>
                <Input
                  value={confirmacaoSemParcela}
                  onChange={(e) => setConfirmacaoSemParcela(e.target.value)}
                  placeholder={getConfirmacaoSemParcela()}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Caso individual sensível sem risco alto: alerta + justificativa já liberam a alteração.
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={fecharGovernancaSemParcela}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmarGovernancaSemParcela}
              disabled={!!governancaSemParcela?.salvando}
              className="bg-amber-600 hover:bg-amber-500"
            >
              {governancaSemParcela?.salvando ? 'Salvando...' : 'Confirmar com justificativa'}
            </Button>
          </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Segundo Curso */}
      {modalSegundoCurso && (() => {
        // Cursos que a pessoa já tem (principal + outros cursos ativos/trancados)
        const idsCursosExistentes = new Set<number>();
        if (dadosCompletos?.curso_id) idsCursosExistentes.add(dadosCompletos.curso_id);
        outrosCursos.forEach((o: any) => { if (o.curso_id) idsCursosExistentes.add(o.curso_id); });
        const cursoDuplicado = segundoCursoData.curso_id != null && idsCursosExistentes.has(segundoCursoData.curso_id);
        const nomeCursoDuplicado = cursos.find((c: any) => c.id === segundoCursoData.curso_id)?.nome || 'esse curso';
        return (
        <Dialog open onOpenChange={() => setModalSegundoCurso(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />
                Adicionar Curso
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-400">
                Cadastrar <strong className="text-white">{dadosCompletos?.nome}</strong> em um novo curso.
                Será criado um novo registro de matrícula.
              </p>

              <div>
                <Label className="mb-2 block">Novo Curso *</Label>
                <Select
                  value={segundoCursoData.curso_id?.toString() || ''}
                  onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, curso_id: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o curso..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {cursos.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cursoDuplicado && (
                  <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>{dadosCompletos?.nome}</strong> já tem matrícula em <strong>{nomeCursoDuplicado}</strong>.
                      Adicionar o mesmo curso cria uma duplicata — escolha um curso diferente.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Professor *</Label>
                <Select
                  value={segundoCursoData.professor_id?.toString() || ''}
                  onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, professor_id: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o professor..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {professores.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Dia da Aula</Label>
                  <Select
                    value={segundoCursoData.dia_aula || ''}
                    onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, dia_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {DIAS_SEMANA.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Horário</Label>
                  <Select
                    value={segundoCursoData.horario_aula || ''}
                    onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, horario_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {HORARIOS_LISTA.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Valor da Parcela (opcional)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={segundoCursoData.valor_parcela !== null ? segundoCursoData.valor_parcela : ''}
                    onChange={(e) => setSegundoCursoData({ ...segundoCursoData, valor_parcela: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                    className="pl-10"
                    placeholder={formData.valor_parcela?.toString() || '0,00'}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Se não informado, usará o mesmo valor do curso atual: {formatarMoeda(formData.valor_parcela)}
                </p>
              </div>

              {/* Informações da Turma */}
              {carregandoTurma && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando turma...
                </div>
              )}
              
              {!carregandoTurma && turmaSegundoCurso && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-blue-400 font-medium">
                    <Users className="w-4 h-4" />
                    Turma Encontrada
                  </div>
                  <div className="text-sm text-slate-300">
                    <p><strong>Sala:</strong> {turmaSegundoCurso.sala_nome || 'Não definida'}</p>
                    <p><strong>Total de alunos:</strong> {turmaSegundoCurso.total_alunos || 0}</p>
                    <p><strong>Capacidade:</strong> {turmaSegundoCurso.capacidade_maxima || '-'}</p>
                  </div>
                  {turmaSegundoCurso.nomes_alunos && turmaSegundoCurso.nomes_alunos.length > 0 && (
                    <div className="pt-2 border-t border-blue-500/20">
                      <p className="text-xs text-slate-400 mb-1">Alunos na turma:</p>
                      <div className="flex flex-wrap gap-1">
                        {turmaSegundoCurso.nomes_alunos.slice(0, 5).map((nome: string, idx: number) => (
                          <span key={idx} className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded text-xs">
                            {nome}
                          </span>
                        ))}
                        {turmaSegundoCurso.nomes_alunos.length > 5 && (
                          <span className="text-xs text-slate-400">
                            +{turmaSegundoCurso.nomes_alunos.length - 5} mais
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!carregandoTurma && !turmaSegundoCurso && segundoCursoData.professor_id && segundoCursoData.dia_aula && segundoCursoData.horario_aula && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  Nenhuma turma encontrada. O aluno será o primeiro nesta turma.
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalSegundoCurso(false)} disabled={salvandoSegundoCurso}>
                Cancelar
              </Button>
              <Button onClick={handleCriarSegundoCurso} disabled={salvandoSegundoCurso || cursoDuplicado} className="bg-purple-600 hover:bg-purple-500">
                {salvandoSegundoCurso ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Curso
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        );
      })()}

      {/* Modal de Busca de Anamnese */}
      {modalBuscaAnamnese && (
        <Dialog open onOpenChange={() => setModalBuscaAnamnese(false)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                Anamneses Pendentes
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {candidatosAnamnese.map((candidato) => (
                <div key={candidato.anamnese_id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          candidato.tipo_formulario === 'EMLA'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {candidato.tipo_formulario}
                        </span>
                        {candidato.temperamento_codinome && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-400">
                            {candidato.temperamento_codinome}
                          </span>
                        )}
                      </div>
                      <h5 className="text-base font-medium text-white">{candidato.nome_aluno}</h5>
                      <p className="text-sm text-slate-400">{candidato.unidade_nome}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleVincularAnamnese(candidato.anamnese_id)}
                      disabled={vinculandoAnamnese}
                      className="bg-purple-600 hover:bg-purple-500"
                    >
                      {vinculandoAnamnese ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Vinculando...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Vincular
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span>📅 {formatarDataHora(candidato.created_at)}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      candidato.match_label === 'Nome e unidade conferem'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : candidato.match_label === 'Mesmo nome (outra unidade)'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {candidato.match_label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-end">
              <Button variant="outline" onClick={() => setModalBuscaAnamnese(false)}>
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
