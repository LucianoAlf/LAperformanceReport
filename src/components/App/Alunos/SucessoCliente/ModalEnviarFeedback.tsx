import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Send,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

// =============================================================================
// TIPOS
// =============================================================================

interface Professor {
  id: number;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  unidade_id: string;
  total_alunos: number;
}

interface SessaoFeedback {
  id: string;
  professor_id: number;
  competencia: string;
  status: string;
  token: string;
  total_alunos: number;
  total_respondidos: number;
  expires_at: string;
  created_at: string;
}

interface ModalEnviarFeedbackProps {
  open: boolean;
  onClose: () => void;
  unidadeAtual: UnidadeId;
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function ModalEnviarFeedback({ open, onClose, unidadeAtual }: ModalEnviarFeedbackProps) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [sessoes, setSessoes] = useState<SessaoFeedback[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviarWhatsApp, setEnviarWhatsApp] = useState(true);

  // Competência atual (mês/ano)
  const competenciaAtual = format(new Date(), 'yyyy-MM');

  // Carregar dados
  useEffect(() => {
    if (open) {
      carregarDados();
    }
  }, [open, unidadeAtual]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar professores ativos
      const { data: profsData, error: profsError } = await supabase
        .from('professores')
        .select('id, nome, apelido, telefone')
        .eq('ativo', true)
        .order('nome');

      if (profsError) throw profsError;

      // Buscar relacionamentos de professores com unidades
      const { data: profUnidadesData } = await supabase
        .from('professores_unidades')
        .select('professor_id, unidade_id');

      // Criar mapa de professor -> unidades
      const profUnidadesMap = new Map<number, string[]>();
      (profUnidadesData || []).forEach(pu => {
        if (!profUnidadesMap.has(pu.professor_id)) {
          profUnidadesMap.set(pu.professor_id, []);
        }
        profUnidadesMap.get(pu.professor_id)!.push(pu.unidade_id);
      });

      // Filtrar professores por unidade se necessário
      let professoresFiltrados = (profsData || []);
      if (unidadeAtual !== 'todos') {
        professoresFiltrados = professoresFiltrados.filter(p => {
          const unidades = profUnidadesMap.get(p.id) || [];
          return unidades.includes(unidadeAtual);
        });
      }

      // Contar alunos por professor
      const { data: alunosCount } = await supabase
        .from('alunos')
        .select('professor_atual_id')
        .eq('status', 'ativo');

      const countMap = new Map<number, number>();
      alunosCount?.forEach(a => {
        if (a.professor_atual_id) {
          countMap.set(a.professor_atual_id, (countMap.get(a.professor_atual_id) || 0) + 1);
        }
      });

      const professoresComAlunos: Professor[] = professoresFiltrados
        .map(p => ({
          ...p,
          unidade_id: (profUnidadesMap.get(p.id) || [unidadeAtual])[0] || unidadeAtual,
          total_alunos: countMap.get(p.id) || 0,
        }))
        .filter(p => p.total_alunos > 0);

      setProfessores(professoresComAlunos);

      // Buscar sessões existentes para a competência atual
      const { data: sessoesData } = await supabase
        .from('aluno_feedback_sessoes')
        .select('*')
        .eq('competencia', competenciaAtual);

      setSessoes(sessoesData || []);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar professores');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar professores
  const professoresFiltrados = useMemo(() => {
    if (!busca) return professores;
    const termo = busca.toLowerCase();
    return professores.filter(p =>
      p.nome.toLowerCase().includes(termo) ||
      p.apelido?.toLowerCase().includes(termo)
    );
  }, [professores, busca]);

  // Verificar se professor já tem sessão
  const getSessaoProfessor = (professorId: number): SessaoFeedback | undefined => {
    return sessoes.find(s => s.professor_id === professorId);
  };

  // Toggle seleção
  const toggleSelecionado = (professorId: number) => {
    const sessao = getSessaoProfessor(professorId);
    if (sessao && sessao.status === 'concluido') return; // Não permite selecionar se já concluído

    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(professorId)) {
        novo.delete(professorId);
      } else {
        novo.add(professorId);
      }
      return novo;
    });
  };

  // Selecionar todos
  const selecionarTodos = () => {
    const novos = new Set<number>();
    professoresFiltrados.forEach(p => {
      const sessao = getSessaoProfessor(p.id);
      if (!sessao || sessao.status !== 'concluido') {
        novos.add(p.id);
      }
    });
    setSelecionados(novos);
  };

  // Limpar seleção
  const limparSelecao = () => {
    setSelecionados(new Set());
  };

  // Enviar feedbacks
  const handleEnviar = async () => {
    if (selecionados.size === 0) {
      toast.error('Selecione pelo menos um professor');
      return;
    }

    setEnviando(true);
    let sucessos = 0;
    let erros = 0;

    for (const professorId of selecionados) {
      const professor = professores.find(p => p.id === professorId);
      if (!professor) continue;

      try {
        // Verificar se já existe sessão
        const sessaoExistente = getSessaoProfessor(professorId);

        if (sessaoExistente) {
          // Reenviar link existente via WhatsApp se solicitado
          if (enviarWhatsApp && professor.telefone) {
            const baseUrl = window.location.origin;
            const link = `${baseUrl}/feedback/${sessaoExistente.token}`;
            const mensagem = `Olá ${professor.apelido || professor.nome}! 🎵\n\nLembrete: precisamos do seu feedback sobre seus alunos.\n\nAcesse: ${link}\n\n⏰ O link expira em ${format(new Date(sessaoExistente.expires_at), "dd/MM 'às' HH:mm")}.\n\nObrigado! 💜`;

            await supabase.functions.invoke('enviar-mensagem-lead', {
              body: {
                numero: professor.telefone,
                mensagem,
              },
            });
          }
          sucessos++;
        } else {
          // Criar nova sessão
          const token = crypto.randomUUID();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const { error: insertError } = await supabase
            .from('aluno_feedback_sessoes')
            .insert({
              professor_id: professorId,
              unidade_id: professor.unidade_id,
              competencia: competenciaAtual,
              token,
              status: 'enviado',
              expires_at: expiresAt.toISOString(),
              total_alunos: professor.total_alunos,
              total_respondidos: 0,
            });

          if (insertError) throw insertError;

          // Enviar WhatsApp se solicitado
          if (enviarWhatsApp && professor.telefone) {
            const baseUrl = window.location.origin;
            const link = `${baseUrl}/feedback/${token}`;
            const mensagem = `Olá ${professor.apelido || professor.nome}! 🎵\n\nPrecisamos do seu feedback sobre seus alunos.\n\nAcesse: ${link}\n\n⏰ O link expira em 7 dias.\n\nObrigado! 💜`;

            try {
              await supabase.functions.invoke('enviar-mensagem-lead', {
                body: {
                  numero: professor.telefone,
                  mensagem,
                },
              });
            } catch (whatsappError) {
              console.error('Erro ao enviar WhatsApp:', whatsappError);
            }
          }

          sucessos++;
        }
      } catch (error) {
        console.error(`Erro ao enviar para ${professor.nome}:`, error);
        erros++;
      }
    }

    setEnviando(false);

    if (sucessos > 0) {
      toast.success(`${sucessos} link(s) enviado(s) com sucesso!`);
      await carregarDados();
      setSelecionados(new Set());
    }

    if (erros > 0) {
      toast.error(`${erros} erro(s) ao enviar`);
    }
  };

  // Copiar link
  const copiarLink = (token: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/feedback/${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copiado!');
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-violet-400" />
            Enviar Feedback para Professores
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        ) : (
          <>
            {/* Header com busca e ações */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar professor..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={selecionarTodos}>
                Selecionar todos
              </Button>
              <Button variant="ghost" size="sm" onClick={limparSelecao}>
                Limpar
              </Button>
            </div>

            {/* Competência */}
            <div className="text-sm text-slate-400 mb-2">
              Competência: <span className="text-white font-medium">{format(new Date(), 'MMMM/yyyy', { locale: ptBR })}</span>
            </div>

            {/* Lista de professores */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {professoresFiltrados.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  Nenhum professor encontrado
                </div>
              ) : (
                professoresFiltrados.map(professor => {
                  const sessao = getSessaoProfessor(professor.id);
                  const selecionado = selecionados.has(professor.id);
                  const concluido = sessao?.status === 'concluido';

                  return (
                    <div
                      key={professor.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        concluido
                          ? 'bg-emerald-900/20 border-emerald-700/50 opacity-70'
                          : selecionado
                          ? 'bg-violet-500/10 border-violet-500/50'
                          : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                      }`}
                      onClick={() => toggleSelecionado(professor.id)}
                    >
                      {/* Checkbox */}
                      <Checkbox
                        checked={selecionado}
                        disabled={concluido}
                        className="pointer-events-none"
                      />

                      {/* Info do professor */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                          {professor.apelido || professor.nome}
                        </p>
                        <p className="text-xs text-slate-400">
                          {professor.total_alunos} aluno{professor.total_alunos !== 1 ? 's' : ''}
                          {professor.telefone && ' • WhatsApp disponível'}
                        </p>
                      </div>

                      {/* Status da sessão */}
                      {sessao && (
                        <div className="flex items-center gap-2">
                          {sessao.status === 'concluido' ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle2 className="w-4 h-4" />
                              {sessao.total_respondidos}/{sessao.total_alunos}
                            </span>
                          ) : sessao.status === 'acessado' ? (
                            <span className="flex items-center gap-1 text-xs text-amber-400">
                              <Clock className="w-4 h-4" />
                              Acessado
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Send className="w-4 h-4" />
                              Enviado
                            </span>
                          )}

                          {/* Botões de ação */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copiarLink(sessao.token);
                            }}
                            className="p-1.5 hover:bg-slate-700 rounded-lg transition"
                            title="Copiar link"
                          >
                            <Copy className="w-4 h-4 text-slate-400" />
                          </button>
                          <a
                            href={`/feedback/${sessao.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-slate-700 rounded-lg transition"
                            title="Abrir link"
                          >
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer com opções e botão enviar */}
            <div className="border-t border-slate-700 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                  <Checkbox
                    checked={enviarWhatsApp}
                    onCheckedChange={(checked) => setEnviarWhatsApp(!!checked)}
                  />
                  Enviar via WhatsApp
                </label>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
                  </span>
                  <Button
                    onClick={handleEnviar}
                    disabled={enviando || selecionados.size === 0}
                    className="bg-gradient-to-r from-violet-500 to-pink-500 hover:opacity-90"
                  >
                    {enviando ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar Links
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ModalEnviarFeedback;
