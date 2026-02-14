import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, Heart, CheckCircle2, AlertTriangle, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// =============================================================================
// TIPOS
// =============================================================================

interface SessaoFeedback {
  id: string;
  professor_id: number;
  professor_nome?: string;
  unidade_id: string;
  unidade_nome?: string;
  competencia: string;
  status: string;
  enviado_em?: string;
}

interface AlunoParaFeedback {
  id: number;
  nome: string;
  curso_nome: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
  feedback_atual: 'verde' | 'amarelo' | 'vermelho' | null;
  observacao_atual: string | null;
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function FeedbackProfessorPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sessao, setSessao] = useState<SessaoFeedback | null>(null);
  const [alunos, setAlunos] = useState<AlunoParaFeedback[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<number, { feedback: string; observacao: string }>>({});
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  // Carregar sessão e alunos
  useEffect(() => {
    if (!token) {
      setErro('Token não informado');
      setLoading(false);
      return;
    }
    carregarDados();
  }, [token]);

  const carregarDados = async () => {
    setLoading(true);
    setErro(null);

    try {
      // Chamar Edge Function para validar token e buscar dados
      const { data: response, error: fnError } = await supabase.functions.invoke(
        'validar-token-feedback',
        { body: { token } }
      );

      if (fnError) {
        setErro('Link inválido ou expirado');
        setLoading(false);
        return;
      }

      if (!response?.valid) {
        if (response?.expired) {
          setErro('Este link expirou. Solicite um novo link ao gestor.');
        } else if (response?.completed) {
          setConcluido(true);
          setSessao(response.sessao);
        } else {
          setErro('Link inválido ou expirado');
        }
        setLoading(false);
        return;
      }

      setSessao(response.sessao);

      // Mapear feedbacks existentes
      const feedbackMap: Record<number, { feedback: string; observacao: string }> = {};
      response.feedbacks_existentes?.forEach((f: any) => {
        feedbackMap[f.aluno_id] = { feedback: f.feedback, observacao: f.observacao || '' };
      });

      // Formatar alunos
      const alunosFormatados: AlunoParaFeedback[] = (response.alunos || []).map((a: any) => ({
        id: a.id,
        nome: a.nome,
        curso_nome: a.curso_nome || null,
        dia_aula: a.dia_aula,
        horario_aula: a.horario_aula,
        feedback_atual: feedbackMap[a.id]?.feedback as any || null,
        observacao_atual: feedbackMap[a.id]?.observacao || null,
      }));

      setAlunos(alunosFormatados);
      setFeedbacks(feedbackMap);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setErro('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Atualizar feedback de um aluno
  const handleFeedbackChange = (alunoId: number, feedback: 'verde' | 'amarelo' | 'vermelho') => {
    setFeedbacks(prev => ({
      ...prev,
      [alunoId]: { ...prev[alunoId], feedback, observacao: prev[alunoId]?.observacao || '' }
    }));
  };

  // Atualizar observação de um aluno
  const handleObservacaoChange = (alunoId: number, observacao: string) => {
    setFeedbacks(prev => ({
      ...prev,
      [alunoId]: { ...prev[alunoId], observacao }
    }));
  };

  // Salvar todos os feedbacks
  const handleSalvar = async () => {
    if (!sessao) return;

    setSalvando(true);
    try {
      const competencia = sessao.competencia;

      // Preparar upserts
      const feedbacksParaSalvar = Object.entries(feedbacks)
        .filter(([_, v]) => (v as { feedback: string; observacao: string }).feedback)
        .map(([alunoId, v]) => {
          const fb = v as { feedback: string; observacao: string };
          return {
            aluno_id: parseInt(alunoId),
            professor_id: sessao.professor_id,
            competencia,
            feedback: fb.feedback,
            observacao: fb.observacao || null,
            sessao_id: sessao.id,
            respondido_em: new Date().toISOString(),
          };
        });

      if (feedbacksParaSalvar.length === 0) {
        alert('Selecione pelo menos um feedback antes de salvar.');
        setSalvando(false);
        return;
      }

      // Upsert feedbacks
      const { error: upsertError } = await supabase
        .from('aluno_feedback_professor')
        .upsert(feedbacksParaSalvar, {
          onConflict: 'aluno_id,professor_id,competencia',
        });

      if (upsertError) throw upsertError;

      // Atualizar sessão para concluído
      const { error: updateError } = await supabase
        .from('aluno_feedback_sessoes')
        .update({
          status: 'concluido',
          total_respondidos: feedbacksParaSalvar.length,
        })
        .eq('id', sessao.id);

      if (updateError) throw updateError;

      setConcluido(true);

    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar feedbacks. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  // Contadores
  const totalAlunos = alunos.length;
  const totalRespondidos = Object.values(feedbacks).filter(f => f.feedback).length;
  const progresso = totalAlunos > 0 ? Math.round((totalRespondidos / totalAlunos) * 100) : 0;

  // =============================================================================
  // RENDER
  // =============================================================================

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-violet-500 mx-auto mb-4" />
          <p className="text-slate-400">Carregando...</p>
        </div>
      </div>
    );
  }

  // Erro
  if (erro) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full text-center border border-slate-700">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Ops!</h1>
          <p className="text-slate-400 mb-6">{erro}</p>
          <Button onClick={() => navigate('/')} variant="outline">
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  // Concluído
  if (concluido) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full text-center border border-slate-700">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Obrigado!</h1>
          <p className="text-slate-400 mb-2">
            Seus feedbacks foram salvos com sucesso.
          </p>
          {sessao && (
            <p className="text-slate-500 text-sm">
              {sessao.professor_nome} • {sessao.unidade_nome}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Formulário
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header fixo */}
      <header className="sticky top-0 z-10 bg-slate-800/95 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Music2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Feedback dos Alunos</h1>
              <p className="text-xs text-slate-400">
                {sessao?.professor_nome} • {sessao?.competencia ? format(new Date(sessao.competencia), 'MMMM/yyyy', { locale: ptBR }) : ''}
              </p>
            </div>
          </div>
          {/* Barra de progresso */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {totalRespondidos}/{totalAlunos}
            </span>
          </div>
        </div>
      </header>

      {/* Lista de alunos */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        <p className="text-sm text-slate-400 mb-4">
          Toque no coração para indicar como está cada aluno:
        </p>

        <div className="space-y-3">
          {alunos.map(aluno => (
            <CardAlunoFeedback
              key={aluno.id}
              aluno={aluno}
              feedbackAtual={feedbacks[aluno.id]?.feedback as any}
              observacaoAtual={feedbacks[aluno.id]?.observacao || ''}
              onFeedbackChange={(f) => handleFeedbackChange(aluno.id, f)}
              onObservacaoChange={(o) => handleObservacaoChange(aluno.id, o)}
            />
          ))}
        </div>

        {alunos.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            Nenhum aluno encontrado para este professor.
          </div>
        )}
      </main>

      {/* Footer fixo com botão salvar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-800/95 backdrop-blur border-t border-slate-700 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSalvar}
            disabled={salvando || totalRespondidos === 0}
            className="w-full bg-gradient-to-r from-violet-500 to-pink-500 hover:opacity-90 text-white font-semibold py-3"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Salvar Feedbacks ({totalRespondidos})
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// CARD DO ALUNO
// =============================================================================

interface CardAlunoFeedbackProps {
  aluno: AlunoParaFeedback;
  feedbackAtual: 'verde' | 'amarelo' | 'vermelho' | null;
  observacaoAtual: string;
  onFeedbackChange: (feedback: 'verde' | 'amarelo' | 'vermelho') => void;
  onObservacaoChange: (observacao: string) => void;
}

function CardAlunoFeedback({
  aluno,
  feedbackAtual,
  observacaoAtual,
  onFeedbackChange,
  onObservacaoChange,
}: CardAlunoFeedbackProps) {
  const [mostrarObs, setMostrarObs] = useState(!!observacaoAtual);

  return (
    <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700/50">
      {/* Info do aluno */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">{aluno.nome}</p>
          <p className="text-xs text-slate-400">
            {aluno.curso_nome || 'Sem curso'}
            {aluno.dia_aula && ` • ${aluno.dia_aula}`}
            {aluno.horario_aula && ` ${aluno.horario_aula}`}
          </p>
        </div>
      </div>

      {/* Coraçõezinhos */}
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={() => onFeedbackChange('verde')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            feedbackAtual === 'verde'
              ? 'bg-emerald-500/20 ring-2 ring-emerald-500'
              : 'hover:bg-slate-700/50'
          }`}
        >
          <Heart
            className={`w-8 h-8 transition-colors ${
              feedbackAtual === 'verde' ? 'text-emerald-500 fill-emerald-500' : 'text-slate-500'
            }`}
          />
          <span className="text-[10px] text-slate-400">Saudável</span>
        </button>

        <button
          onClick={() => onFeedbackChange('amarelo')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            feedbackAtual === 'amarelo'
              ? 'bg-amber-500/20 ring-2 ring-amber-500'
              : 'hover:bg-slate-700/50'
          }`}
        >
          <Heart
            className={`w-8 h-8 transition-colors ${
              feedbackAtual === 'amarelo' ? 'text-amber-500 fill-amber-500' : 'text-slate-500'
            }`}
          />
          <span className="text-[10px] text-slate-400">Atenção</span>
        </button>

        <button
          onClick={() => onFeedbackChange('vermelho')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
            feedbackAtual === 'vermelho'
              ? 'bg-rose-500/20 ring-2 ring-rose-500'
              : 'hover:bg-slate-700/50'
          }`}
        >
          <Heart
            className={`w-8 h-8 transition-colors ${
              feedbackAtual === 'vermelho' ? 'text-rose-500 fill-rose-500' : 'text-slate-500'
            }`}
          />
          <span className="text-[10px] text-slate-400">Crítico</span>
        </button>

        {/* Toggle observação */}
        <button
          onClick={() => setMostrarObs(!mostrarObs)}
          className={`ml-auto text-xs px-2 py-1 rounded-lg transition-colors ${
            mostrarObs ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'
          }`}
        >
          {mostrarObs ? '− Obs' : '+ Obs'}
        </button>
      </div>

      {/* Observação */}
      {mostrarObs && (
        <Textarea
          placeholder="Observação opcional..."
          value={observacaoAtual}
          onChange={(e) => onObservacaoChange(e.target.value)}
          className="mt-2 bg-slate-900/50 border-slate-700 text-sm resize-none"
          rows={2}
        />
      )}
    </div>
  );
}

export default FeedbackProfessorPage;
