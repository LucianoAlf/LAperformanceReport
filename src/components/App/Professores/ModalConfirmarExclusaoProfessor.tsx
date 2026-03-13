import { useEffect, useState } from 'react';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  AlertCircle, Users, Calendar, UserPlus, CheckCircle, Clock, 
  BarChart3, MessageSquare, Video, Wallet, TrendingUp, BookOpen
} from 'lucide-react';
import { useProfessorDependencies, type DetailedProfessorDependencies } from '@/hooks/useProfessorDependencies';
import { ListaDependencias } from './ListaDependencias';
import type { Professor } from './types';

interface ModalConfirmarExclusaoProfessorProps {
  professor: Professor | null;
  onConfirm: () => void;
  onCancel: () => void;
  onMarcarInativo?: (professor: Professor) => void;
}

export function ModalConfirmarExclusaoProfessor({ 
  professor, 
  onConfirm, 
  onCancel,
  onMarcarInativo
}: ModalConfirmarExclusaoProfessorProps) {
  const { getDetailedDependencies, hasBloqueios, hasDadosCascade } = useProfessorDependencies();
  const [dependencies, setDependencies] = useState<DetailedProfessorDependencies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (professor) {
      setLoading(true);
      setError(null);
      getDetailedDependencies(professor.id)
        .then(setDependencies)
        .catch((err) => setError(err.message || 'Erro ao verificar dependências'))
        .finally(() => setLoading(false));
    } else {
      setDependencies(null);
      setLoading(true);
    }
  }, [professor]);

  const temBloqueios = dependencies ? hasBloqueios(dependencies) : false;
  const temDadosCascade = dependencies ? hasDadosCascade(dependencies) : false;

  return (
    <AlertDialog open={!!professor} onOpenChange={onCancel}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">
            Excluir Professor: {professor?.nome}
          </AlertDialogTitle>
        </AlertDialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
              <p className="text-sm text-gray-400">Verificando dependências...</p>
            </div>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao verificar dependências</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : temBloqueios ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não é possível excluir este professor</AlertTitle>
              <AlertDescription>
                Este professor possui vínculos ativos no sistema que impedem a exclusão.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-red-400 mb-3">Vínculos que impedem a exclusão:</p>
              
              <ListaDependencias
                titulo="Alunos Vinculados"
                icone={<Users className="w-4 h-4 text-red-400" />}
                items={dependencies!.alunosDetalhes}
                cor="red"
                maxVisible={3}
              />

              <ListaDependencias
                titulo="Leads em Processo"
                icone={<UserPlus className="w-4 h-4 text-red-400" />}
                items={dependencies!.leadsDetalhes}
                cor="red"
                maxVisible={3}
              />

              <ListaDependencias
                titulo="Turmas Ativas"
                icone={<Calendar className="w-4 h-4 text-red-400" />}
                items={dependencies!.turmasDetalhes}
                cor="red"
                maxVisible={3}
              />

              <ListaDependencias
                titulo="Aulas Registradas (Emusys)"
                icone={<BookOpen className="w-4 h-4 text-red-400" />}
                items={dependencies!.aulasDetalhes}
                cor="red"
                maxVisible={3}
              />

              <ListaDependencias
                titulo="Evasões Registradas"
                icone={<AlertCircle className="w-4 h-4 text-red-400" />}
                items={dependencies!.evasoesDetalhes}
                cor="red"
                maxVisible={3}
              />

              <ListaDependencias
                titulo="Experimentais Mensais"
                icone={<BarChart3 className="w-4 h-4 text-red-400" />}
                items={dependencies!.experimentaisDetalhes}
                cor="red"
                maxVisible={3}
              />
            </div>

            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300 font-medium mb-2">💡 Sugestão:</p>
              <p className="text-sm text-gray-300">
                Ao invés de excluir, você pode marcar o professor como <strong className="text-blue-300">Inativo</strong>. 
                Isso preserva todo o histórico e permite reativá-lo no futuro se necessário.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="border-yellow-500/20 bg-yellow-500/5">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertTitle className="text-yellow-500">Atenção: Esta ação é irreversível</AlertTitle>
              <AlertDescription className="text-gray-300">
                Ao confirmar, o professor <strong>{professor?.nome}</strong> será permanentemente removido do sistema.
              </AlertDescription>
            </Alert>

            {temDadosCascade && (
              <div className="space-y-3 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-300 mb-2">
                  Os seguintes dados serão deletados automaticamente:
                </p>

                {dependencies!.presencas > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.presencas} registro{dependencies!.presencas > 1 ? 's' : ''} de presença</span>
                  </div>
                )}

                {dependencies!.avaliacoes360 > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.avaliacoes360} avaliaç{dependencies!.avaliacoes360 > 1 ? 'ões' : 'ão'} 360°</span>
                  </div>
                )}

                {dependencies!.ocorrencias360 > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.ocorrencias360} ocorrência{dependencies!.ocorrencias360 > 1 ? 's' : ''} 360°</span>
                  </div>
                )}

                {dependencies!.feedbacks > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.feedbacks} feedback{dependencies!.feedbacks > 1 ? 's' : ''} de alunos</span>
                  </div>
                )}

                {dependencies!.acoes > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.acoes} aç{dependencies!.acoes > 1 ? 'ões' : 'ão'} registrada{dependencies!.acoes > 1 ? 's' : ''}</span>
                  </div>
                )}

                {dependencies!.videos > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.videos} vídeo{dependencies!.videos > 1 ? 's' : ''}</span>
                  </div>
                )}

                {dependencies!.turmasExplicitas > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.turmasExplicitas} turma{dependencies!.turmasExplicitas > 1 ? 's' : ''} explícita{dependencies!.turmasExplicitas > 1 ? 's' : ''}</span>
                  </div>
                )}

                {dependencies!.carteira > 0 && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>{dependencies!.carteira} registro{dependencies!.carteira > 1 ? 's' : ''} de carteira</span>
                  </div>
                )}

                {(dependencies!.unidades > 0 || dependencies!.cursos > 0) && (
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>Vínculos com unidades e cursos</span>
                  </div>
                )}
              </div>
            )}

            {!temDadosCascade && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm text-green-300">
                  ✓ Este professor não possui dados vinculados. A exclusão será limpa.
                </p>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          {!loading && temBloqueios && onMarcarInativo && professor && (
            <AlertDialogAction 
              onClick={() => {
                onMarcarInativo(professor);
                onCancel();
              }}
              className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
            >
              Marcar como Inativo
            </AlertDialogAction>
          )}
          {!loading && !temBloqueios && (
            <AlertDialogAction 
              onClick={onConfirm} 
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Confirmar Exclusão
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
