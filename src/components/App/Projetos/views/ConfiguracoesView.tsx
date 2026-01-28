import { useState } from 'react';
import { 
  FolderKanban, 
  ListChecks, 
  Bell, 
  Users, 
  Bot, 
  MessageSquare,
  Pencil,
  Trash2,
  GripVertical
} from 'lucide-react';
import { Button } from '../../../ui/button';

type SettingsSection = 'tipos' | 'fases' | 'notificacoes' | 'equipe' | 'fabio' | 'whatsapp';

const settingsNav = [
  { id: 'tipos' as const, label: 'Tipos de Projeto', icon: FolderKanban },
  { id: 'fases' as const, label: 'Templates de Fases', icon: ListChecks },
  { id: 'notificacoes' as const, label: 'Notificações', icon: Bell },
  { id: 'equipe' as const, label: 'Equipe e Permissões', icon: Users },
  { id: 'fabio' as const, label: 'Fábio IA', icon: Bot },
  { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageSquare },
];

// Dados mockados
const mockTipos = [
  { id: 1, icone: '🎉', nome: 'Semana Temática', cor: 'violet', projetos: 3, ativo: true },
  { id: 2, icone: '🎵', nome: 'Recital', cor: 'cyan', projetos: 5, ativo: true },
  { id: 3, icone: '🎸', nome: 'Show de Banda', cor: 'rose', projetos: 2, ativo: true },
  { id: 4, icone: '📚', nome: 'Material Didático', cor: 'emerald', projetos: 4, ativo: true },
  { id: 5, icone: '📱', nome: 'Produção de Conteúdo', cor: 'amber', projetos: 6, ativo: true },
  { id: 6, icone: '🎬', nome: 'Vídeo Aulas', cor: 'blue', projetos: 2, ativo: true },
];

const mockFases = [
  { ordem: 1, nome: 'Planejamento', duracao: '2 semanas', tarefas: 5 },
  { ordem: 2, nome: 'Divulgação', duracao: '1 semana', tarefas: 4 },
  { ordem: 3, nome: 'Preparação', duracao: '2 semanas', tarefas: 8 },
  { ordem: 4, nome: 'Ensaios', duracao: '1 semana', tarefas: 3 },
  { ordem: 5, nome: 'Execução (Evento)', duracao: '1 dia', tarefas: 6 },
  { ordem: 6, nome: 'Pós-Evento', duracao: '1 semana', tarefas: 4 },
];

const corMap: Record<string, string> = {
  violet: 'bg-violet-500',
  cyan: 'bg-cyan-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
};

export function ConfiguracoesView() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('tipos');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6 min-h-[calc(100vh-320px)]">
      {/* Sidebar */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-fit lg:sticky lg:top-4">
        <nav className="space-y-1">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left
                  ${isActive 
                    ? 'bg-violet-500/20 text-violet-400' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo */}
      <div className="space-y-6">
        {/* Tipos de Projeto */}
        {activeSection === 'tipos' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-violet-400" />
                  Tipos de Projeto
                </h2>
                <p className="text-slate-400 text-sm mt-1">Gerencie os tipos de projeto disponíveis no sistema</p>
              </div>
              <Button className="bg-violet-600 hover:bg-violet-500">
                + Novo Tipo
              </Button>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Ícone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Nome</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Cor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Projetos</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {mockTipos.map((tipo) => (
                    <tr key={tipo.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className={`w-10 h-10 rounded-lg bg-${tipo.cor}-500/20 flex items-center justify-center text-xl`}>
                          {tipo.icone}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-white">{tipo.nome}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${corMap[tipo.cor]}`} />
                          <span className="text-slate-400 text-sm capitalize">{tipo.cor === 'violet' ? 'Violeta' : tipo.cor === 'cyan' ? 'Ciano' : tipo.cor === 'rose' ? 'Rosa' : tipo.cor === 'emerald' ? 'Verde' : tipo.cor === 'amber' ? 'Âmbar' : 'Azul'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-400">{tipo.projetos} projetos</td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                          Ativo
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                            <ListChecks className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Templates de Fases */}
        {activeSection === 'fases' && (
          <>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-violet-400" />
                Templates de Fases
              </h2>
              <p className="text-slate-400 text-sm mt-1">Configure as fases padrão para cada tipo de projeto</p>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm text-slate-400">Selecione o tipo de projeto:</label>
              <select className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500">
                <option>🎉 Semana Temática</option>
                <option>🎵 Recital</option>
                <option>🎸 Show de Banda</option>
                <option>📚 Material Didático</option>
                <option>📱 Produção de Conteúdo</option>
                <option>🎬 Vídeo Aulas</option>
              </select>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-white">🎉 Semana Temática - Fases do Template</h3>
                <Button variant="outline" size="sm" className="border-slate-700">
                  + Adicionar Fase
                </Button>
              </div>

              <div className="space-y-2">
                {mockFases.map((fase) => (
                  <div 
                    key={fase.ordem}
                    className="flex items-center gap-3 p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                  >
                    <div className="text-slate-500 cursor-grab">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="w-7 h-7 rounded-md bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-bold">
                      {fase.ordem}
                    </div>
                    <div className="flex-1">
                      <input 
                        type="text" 
                        defaultValue={fase.nome}
                        className="bg-transparent text-white font-medium text-sm focus:outline-none w-full"
                      />
                      <span className="text-xs text-slate-500">Duração sugerida: {fase.duracao}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{fase.tarefas} tarefas padrão</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-700">
                <Button variant="outline" className="border-slate-700">
                  Restaurar Padrão
                </Button>
                <Button className="bg-violet-600 hover:bg-violet-500">
                  💾 Salvar Template
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Placeholder para outras seções */}
        {activeSection === 'notificacoes' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
            <Bell className="w-16 h-16 text-violet-400/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Central de Notificações</h3>
            <p className="text-slate-400">Será implementado na Fase 8</p>
          </div>
        )}

        {activeSection === 'equipe' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
            <Users className="w-16 h-16 text-violet-400/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Equipe e Permissões</h3>
            <p className="text-slate-400">Será implementado na Fase 8</p>
          </div>
        )}

        {activeSection === 'fabio' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
            <Bot className="w-16 h-16 text-violet-400/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Fábio - Assistente IA</h3>
            <p className="text-slate-400">Será implementado na Fase 8</p>
          </div>
        )}

        {activeSection === 'whatsapp' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
            <MessageSquare className="w-16 h-16 text-violet-400/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Integração WhatsApp</h3>
            <p className="text-slate-400">Será implementado na Fase 8</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfiguracoesView;
