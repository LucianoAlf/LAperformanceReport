import { Check } from 'lucide-react';

interface PorPessoaViewProps {
  unidadeSelecionada: string;
}

// Dados mockados para demonstração - serão substituídos por dados reais na Fase 6
const mockPessoas = [
  {
    id: 1,
    nome: 'Quintela',
    cargo: 'Coordenador LAMK',
    inicial: 'Q',
    cor: 'from-emerald-500 to-teal-500',
    totalTarefas: 8,
    tarefas: [
      { id: 1, titulo: 'Finalizar repertório', projeto: 'Recital Kids - Março', prazo: '29 Jan', urgente: true, concluida: false },
      { id: 2, titulo: 'Confirmar professores', projeto: 'Semana do Baterista', prazo: '05 Fev', urgente: false, concluida: false },
      { id: 3, titulo: 'Revisar cronograma ensaios', projeto: 'Recital Kids - Março', prazo: '10 Fev', urgente: false, concluida: false },
      { id: 4, titulo: 'Definir data do evento', projeto: 'Semana do Baterista', prazo: '', urgente: false, concluida: true },
    ]
  },
  {
    id: 2,
    nome: 'Juliana',
    cargo: 'Coordenadora EMLA',
    inicial: 'J',
    cor: 'from-violet-500 to-pink-500',
    totalTarefas: 12,
    tarefas: [
      { id: 5, titulo: 'Aprovar apostila final', projeto: 'Apostila Violão Nível 2', prazo: '20 Fev', urgente: false, concluida: false },
      { id: 6, titulo: 'Definir bandas participantes', projeto: 'Show das Bandas - Abril', prazo: '15 Fev', urgente: false, concluida: false },
      { id: 7, titulo: 'Planejar recital EMLA', projeto: 'Recital EMLA - Junho', prazo: '01 Mar', urgente: false, concluida: false },
    ]
  },
  {
    id: 3,
    nome: 'Maria',
    cargo: 'Assistente Pedagógica',
    inicial: 'M',
    cor: 'from-cyan-500 to-blue-500',
    totalTarefas: 6,
    tarefas: [
      { id: 8, titulo: 'Criar pauta mensal', projeto: 'Conteúdo Fev/2026', prazo: '01 Fev', urgente: false, concluida: false },
      { id: 9, titulo: 'Preparar lista de alunos', projeto: 'Recital Kids - Março', prazo: '05 Fev', urgente: false, concluida: false },
    ]
  },
  {
    id: 4,
    nome: 'Rafael Akeem',
    cargo: 'Professor • Bateria',
    inicial: 'R',
    cor: 'from-amber-500 to-orange-500',
    totalTarefas: 4,
    tarefas: [
      { id: 10, titulo: 'Preparar workshop bateria', projeto: 'Semana do Baterista', prazo: '08 Fev', urgente: false, concluida: false },
      { id: 11, titulo: 'Ensaiar alunos turma A', projeto: 'Recital Kids - Março', prazo: '20 Fev', urgente: false, concluida: false },
    ]
  },
];

export function PorPessoaView({ unidadeSelecionada }: PorPessoaViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {mockPessoas.map((pessoa) => (
        <div 
          key={pessoa.id}
          className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-slate-800 bg-slate-800/30">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pessoa.cor} flex items-center justify-center text-white font-bold`}>
              {pessoa.inicial}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white">{pessoa.nome}</h3>
              <span className="text-sm text-slate-400">{pessoa.cargo}</span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-white">{pessoa.totalTarefas}</div>
              <div className="text-xs text-slate-500">tarefas</div>
            </div>
          </div>

          {/* Tarefas */}
          <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
            {pessoa.tarefas.map((tarefa) => (
              <div 
                key={tarefa.id}
                className={`
                  flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 
                  hover:bg-slate-800/50 transition-colors cursor-pointer
                  ${tarefa.concluida ? 'opacity-60' : ''}
                `}
              >
                {/* Checkbox */}
                <div className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                  ${tarefa.concluida 
                    ? 'bg-emerald-500 border-emerald-500' 
                    : 'border-slate-600 hover:border-slate-500'
                  }
                `}>
                  {tarefa.concluida && <Check className="w-3 h-3 text-white" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${tarefa.concluida ? 'line-through text-slate-500' : 'text-white'}`}>
                    {tarefa.titulo}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{tarefa.projeto}</div>
                </div>

                {/* Prazo */}
                {tarefa.concluida ? (
                  <span className="text-emerald-400 text-xs">✓</span>
                ) : tarefa.prazo ? (
                  <span className={`
                    text-xs px-2 py-1 rounded
                    ${tarefa.urgente 
                      ? 'bg-rose-500/20 text-rose-400' 
                      : 'bg-slate-700/50 text-slate-400'
                    }
                  `}>
                    {tarefa.prazo}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PorPessoaView;
