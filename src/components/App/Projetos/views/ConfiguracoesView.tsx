import { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  ListChecks, 
  Bell, 
  Users, 
  Bot, 
  MessageSquare,
  Pencil,
  Trash2,
  GripVertical,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Play,
  Clock,
  AlertTriangle,
  Calendar,
  FileText
} from 'lucide-react';
import { Button } from '../../../ui/button';
import { 
  useNotificacaoConfig, 
  NOTIFICACAO_TIPO_LABELS, 
  NOTIFICACAO_TIPO_DESCRICOES,
  type NotificacaoConfig 
} from '../../../../hooks/useNotificacoes';
import { 
  getWhatsAppConnectionStatus, 
  sendTestMessage, 
  formatPhoneNumber,
  type WhatsAppConnectionStatus 
} from '../../../../services/whatsapp';
import { supabase } from '../../../../lib/supabase';

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

        {/* Notificações */}
        {activeSection === 'notificacoes' && (
          <NotificacoesSection />
        )}

        {/* Equipe e Permissões */}
        {activeSection === 'equipe' && (
          <EquipeSection />
        )}

        {/* Fábio IA */}
        {activeSection === 'fabio' && (
          <FabioIASection />
        )}

        {/* WhatsApp */}
        {activeSection === 'whatsapp' && (
          <WhatsAppSection />
        )}
      </div>
    </div>
  );
}

// ============================================
// Seção de Notificações (com dados reais do Supabase)
// ============================================
function NotificacoesSection() {
  const { data: configs, loading, toggleAtivo, updateConfig } = useNotificacaoConfig();
  const [saving, setSaving] = useState<number | null>(null);

  const TIPO_ICONS: Record<string, { icon: string; bgColor: string }> = {
    tarefa_atrasada: { icon: '⚠️', bgColor: 'bg-rose-500/20' },
    tarefa_vencendo: { icon: '⏰', bgColor: 'bg-amber-500/20' },
    projeto_parado: { icon: '🚫', bgColor: 'bg-slate-500/20' },
    resumo_semanal: { icon: '📊', bgColor: 'bg-cyan-500/20' },
  };

  const antecedenciaOptions = [
    { value: 1, label: '1 dia' },
    { value: 3, label: '3 dias' },
    { value: 7, label: '7 dias' },
    { value: 15, label: '15 dias' },
    { value: 30, label: '30 dias' },
  ];

  const diasSemanaOptions = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
  ];

  const handleToggle = async (config: NotificacaoConfig) => {
    setSaving(config.id);
    await toggleAtivo(config.id);
    setSaving(null);
  };

  const handleUpdateConfig = async (id: number, field: string, value: number | string) => {
    setSaving(id);
    await updateConfig(id, { [field]: value });
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <span className="ml-3 text-slate-400">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-violet-400" />
          Central de Notificações
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure alertas automáticos para a equipe</p>
      </div>

      <div className="space-y-4">
        {configs.map((config) => {
          const tipoInfo = TIPO_ICONS[config.tipo] || { icon: '🔔', bgColor: 'bg-slate-500/20' };
          const label = NOTIFICACAO_TIPO_LABELS[config.tipo] || config.tipo;
          const descricao = NOTIFICACAO_TIPO_DESCRICOES[config.tipo] || '';

          return (
            <div key={config.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${tipoInfo.bgColor} flex items-center justify-center`}>
                    <span className="text-lg">{tipoInfo.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{label}</h3>
                    <p className="text-sm text-slate-400">{descricao}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(config)}
                  disabled={saving === config.id}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.ativo ? 'bg-violet-500' : 'bg-slate-700'}`}
                >
                  {saving === config.id ? (
                    <Loader2 className="w-4 h-4 animate-spin absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
                  ) : (
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.ativo ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  )}
                </button>
              </div>

              {config.ativo && (
                <div className="space-y-3 border-t border-slate-800 pt-4">
                  {/* Antecedência para tarefa_vencendo */}
                  {config.tipo === 'tarefa_vencendo' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400 w-32">Antecedência:</span>
                      <select 
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                        value={config.antecedencia_dias}
                        onChange={(e) => handleUpdateConfig(config.id, 'antecedencia_dias', parseInt(e.target.value))}
                      >
                        {antecedenciaOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label} antes</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dias de inatividade para projeto_parado */}
                  {config.tipo === 'projeto_parado' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400 w-32">Após:</span>
                      <select 
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                        value={config.dias_inatividade}
                        onChange={(e) => handleUpdateConfig(config.id, 'dias_inatividade', parseInt(e.target.value))}
                      >
                        {antecedenciaOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label} sem atividade</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dia da semana para resumo_semanal */}
                  {config.tipo === 'resumo_semanal' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400 w-32">Dia de envio:</span>
                      <select 
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                        value={config.dia_semana}
                        onChange={(e) => handleUpdateConfig(config.id, 'dia_semana', parseInt(e.target.value))}
                      >
                        {diasSemanaOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Horário de envio */}
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-400 w-32">Horário:</span>
                    <input 
                      type="time"
                      className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                      value={config.hora_envio?.slice(0, 5) || '09:00'}
                      onChange={(e) => handleUpdateConfig(config.id, 'hora_envio', e.target.value)}
                    />
                  </div>

                  {/* Info sobre destinatários */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                    <span>💡 Configure os destinatários na seção WhatsApp</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
        <p className="text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Configurações salvas automaticamente
        </p>
      </div>
    </>
  );
}

// ============================================
// Seção de Equipe e Permissões
// ============================================
function EquipeSection() {
  const [permissoesProfessores, setPermissoesProfessores] = useState({
    verProjetos: true,
    verTarefas: true,
    concluirTarefas: true,
    comentar: true,
    editarTarefas: false,
    criarTarefas: false,
  });

  const mockEquipe = [
    { id: 1, nome: 'Quintela', cargo: 'Coordenador LAMK', tipo: 'coordenador', avatar: 'Q', cor: 'emerald' },
    { id: 2, nome: 'Juliana', cargo: 'Coordenadora EMLA', tipo: 'coordenador', avatar: 'J', cor: 'violet' },
    { id: 3, nome: 'Maria', cargo: 'Assistente Pedagógica', tipo: 'assistente', avatar: 'M', cor: 'cyan' },
    { id: 4, nome: 'Ana Paula', cargo: 'Assistente Pedagógica', tipo: 'assistente', avatar: 'A', cor: 'rose' },
  ];

  const togglePermissao = (key: keyof typeof permissoesProfessores) => {
    setPermissoesProfessores(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          Equipe e Permissões
        </h2>
        <p className="text-slate-400 text-sm mt-1">Gerencie a equipe pedagógica e suas permissões</p>
      </div>

      {/* Membros da Equipe */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30">
          <h3 className="font-semibold text-white">Membros da Equipe</h3>
          <Button variant="outline" size="sm" className="border-slate-700">
            + Adicionar Membro
          </Button>
        </div>
        <div className="divide-y divide-slate-800">
          {mockEquipe.map((membro) => (
            <div key={membro.id} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-${membro.cor}-500/20 flex items-center justify-center text-${membro.cor}-400 font-bold`}>
                  {membro.avatar}
                </div>
                <div>
                  <div className="font-medium text-white">{membro.nome}</div>
                  <div className="text-sm text-slate-400">{membro.cargo}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  membro.tipo === 'coordenador' 
                    ? 'bg-violet-500/20 text-violet-400' 
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}>
                  {membro.tipo === 'coordenador' ? 'Coordenador' : 'Assistente'}
                </span>
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
      </div>

      {/* Permissões de Professores */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            🎵 Permissões de Professores
          </h3>
          <p className="text-sm text-slate-400 mt-1">O que os professores podem fazer no sistema de projetos</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: 'verProjetos', label: 'Ver projetos da escola', desc: 'Visualizar lista de projetos' },
            { key: 'verTarefas', label: 'Ver suas tarefas', desc: 'Visualizar tarefas atribuídas' },
            { key: 'concluirTarefas', label: 'Concluir tarefas', desc: 'Marcar tarefas como concluídas' },
            { key: 'comentar', label: 'Comentar em tarefas', desc: 'Adicionar comentários' },
            { key: 'editarTarefas', label: 'Editar tarefas', desc: 'Modificar detalhes das tarefas' },
            { key: 'criarTarefas', label: 'Criar tarefas', desc: 'Criar novas tarefas em projetos' },
          ].map((perm) => (
            <div 
              key={perm.key}
              className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
            >
              <div>
                <div className="text-sm font-medium text-white">{perm.label}</div>
                <div className="text-xs text-slate-500">{perm.desc}</div>
              </div>
              <button
                onClick={() => togglePermissao(perm.key as keyof typeof permissoesProfessores)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  permissoesProfessores[perm.key as keyof typeof permissoesProfessores] 
                    ? 'bg-violet-500' 
                    : 'bg-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  permissoesProfessores[perm.key as keyof typeof permissoesProfessores] 
                    ? 'translate-x-5' 
                    : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="bg-violet-600 hover:bg-violet-500">
          💾 Salvar Permissões
        </Button>
      </div>
    </>
  );
}

// ============================================
// Seção Fábio IA
// ============================================
function FabioIASection() {
  const [config, setConfig] = useState({
    status: 'online',
    funcionalidades: {
      sugestoesTarefas: true,
      analiseRiscos: true,
      resumosProjetos: true,
      respostasChat: true,
      alertasInteligentes: false,
    },
    canais: {
      chatInterno: true,
      whatsapp: false,
      email: false,
    }
  });

  const toggleFuncionalidade = (key: keyof typeof config.funcionalidades) => {
    setConfig(prev => ({
      ...prev,
      funcionalidades: { ...prev.funcionalidades, [key]: !prev.funcionalidades[key] }
    }));
  };

  const toggleCanal = (key: keyof typeof config.canais) => {
    setConfig(prev => ({
      ...prev,
      canais: { ...prev.canais, [key]: !prev.canais[key] }
    }));
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-400" />
          Fábio - Assistente IA
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure o assistente inteligente de projetos</p>
      </div>

      {/* Status */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-3xl">
              🤖
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">Fábio</h3>
              <p className="text-sm text-slate-400">Assistente de Projetos Pedagógicos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              config.status === 'online' 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-slate-700 text-slate-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${config.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {config.status === 'online' ? 'Online' : 'Offline'}
            </span>
            <button
              onClick={() => setConfig(prev => ({ ...prev, status: prev.status === 'online' ? 'offline' : 'online' }))}
              className={`w-12 h-6 rounded-full transition-colors ${config.status === 'online' ? 'bg-violet-500' : 'bg-slate-700'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.status === 'online' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Funcionalidades */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Funcionalidades Ativas</h3>
        <div className="space-y-3">
          {[
            { key: 'sugestoesTarefas', icon: '💡', label: 'Sugestões de Tarefas', desc: 'Sugere próximas tarefas baseado no contexto' },
            { key: 'analiseRiscos', icon: '⚠️', label: 'Análise de Riscos', desc: 'Identifica projetos com risco de atraso' },
            { key: 'resumosProjetos', icon: '📊', label: 'Resumos de Projetos', desc: 'Gera resumos automáticos do progresso' },
            { key: 'respostasChat', icon: '💬', label: 'Respostas no Chat', desc: 'Responde perguntas sobre projetos' },
            { key: 'alertasInteligentes', icon: '🔔', label: 'Alertas Inteligentes', desc: 'Envia alertas proativos (experimental)' },
          ].map((func) => (
            <div 
              key={func.key}
              className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{func.icon}</span>
                <div>
                  <div className="text-sm font-medium text-white">{func.label}</div>
                  <div className="text-xs text-slate-500">{func.desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggleFuncionalidade(func.key as keyof typeof config.funcionalidades)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  config.funcionalidades[func.key as keyof typeof config.funcionalidades] 
                    ? 'bg-violet-500' 
                    : 'bg-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  config.funcionalidades[func.key as keyof typeof config.funcionalidades] 
                    ? 'translate-x-5' 
                    : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Canais de Comunicação */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Canais de Comunicação</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: 'chatInterno', icon: '💬', label: 'Chat Interno', desc: 'Widget no sistema' },
            { key: 'whatsapp', icon: '📱', label: 'WhatsApp', desc: 'Mensagens via WhatsApp' },
            { key: 'email', icon: '📧', label: 'E-mail', desc: 'Notificações por e-mail' },
          ].map((canal) => (
            <div 
              key={canal.key}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                config.canais[canal.key as keyof typeof config.canais]
                  ? 'bg-violet-500/10 border-violet-500/50'
                  : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
              }`}
              onClick={() => toggleCanal(canal.key as keyof typeof config.canais)}
            >
              <div className="text-2xl mb-2">{canal.icon}</div>
              <div className="font-medium text-white text-sm">{canal.label}</div>
              <div className="text-xs text-slate-500">{canal.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="bg-violet-600 hover:bg-violet-500">
          💾 Salvar Configurações
        </Button>
      </div>
    </>
  );
}

// ============================================
// Seção WhatsApp (com integração UAZAPI real)
// ============================================
function WhatsAppSection() {
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [horarios, setHorarios] = useState({
    inicio: '08:00',
    fim: '18:00',
    diasSemana: ['seg', 'ter', 'qua', 'qui', 'sex'],
  });

  // Verificar status da conexão ao montar
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setCheckingStatus(true);
    try {
      const status = await getWhatsAppConnectionStatus();
      setConnectionStatus(status);
    } catch (error) {
      setConnectionStatus({ connected: false, error: 'Erro ao verificar status' });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSendTest = async () => {
    if (!testNumber.trim()) {
      setTestResult({ success: false, message: 'Informe um número de telefone' });
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const result = await sendTestMessage(testNumber);
      if (result.success) {
        setTestResult({ success: true, message: `Mensagem enviada com sucesso! ID: ${result.messageId}` });
        setTestNumber('');
      } else {
        setTestResult({ success: false, message: result.error || 'Erro ao enviar mensagem' });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Erro de conexão' });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-violet-400" />
          Integração WhatsApp
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure notificações via WhatsApp (UAZAPI)</p>
      </div>

      {/* Status da Conexão */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              connectionStatus?.connected ? 'bg-emerald-500/20' : 'bg-slate-700'
            }`}>
              <span className="text-2xl">📱</span>
            </div>
            <div>
              <h3 className="font-semibold text-white">Status da Conexão UAZAPI</h3>
              {checkingStatus ? (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </p>
              ) : connectionStatus?.connected ? (
                <p className="text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Conectado {connectionStatus.phone && `(${connectionStatus.phone})`}
                </p>
              ) : (
                <p className="text-sm text-rose-400 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  {connectionStatus?.error || 'Não conectado'}
                </p>
              )}
            </div>
          </div>
          <Button 
            variant="outline"
            className="border-slate-700"
            onClick={checkConnectionStatus}
            disabled={checkingStatus}
          >
            {checkingStatus ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Verificar Status
          </Button>
        </div>

        {connectionStatus?.connected && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-sm text-emerald-400">
              ✅ WhatsApp conectado e pronto para enviar notificações automáticas.
            </p>
          </div>
        )}

        {!connectionStatus?.connected && !checkingStatus && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-400">
              ⚠️ Verifique se a instância UAZAPI está ativa e conectada.
            </p>
          </div>
        )}
      </div>

      {/* Teste de Envio */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">📤 Enviar Mensagem de Teste</h3>
        <p className="text-sm text-slate-400 mb-4">Teste a integração enviando uma mensagem para um número</p>
        
        <div className="flex gap-3">
          <input 
            type="text"
            placeholder="(21) 99999-9999"
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
          />
          <Button 
            onClick={handleSendTest}
            disabled={sendingTest || !connectionStatus?.connected}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            {sendingTest ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar Teste
          </Button>
        </div>

        {testResult && (
          <div className={`mt-3 p-3 rounded-lg ${
            testResult.success 
              ? 'bg-emerald-500/10 border border-emerald-500/30' 
              : 'bg-rose-500/10 border border-rose-500/30'
          }`}>
            <p className={`text-sm flex items-center gap-2 ${
              testResult.success ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.message}
            </p>
          </div>
        )}
      </div>

      {/* Horários de Envio */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">⏰ Horários de Envio</h3>
        <p className="text-sm text-slate-400 mb-4">Notificações automáticas serão enviadas apenas nestes horários</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Início</label>
            <input 
              type="time" 
              value={horarios.inicio}
              onChange={(e) => setHorarios(prev => ({ ...prev, inicio: e.target.value }))}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Fim</label>
            <input 
              type="time" 
              value={horarios.fim}
              onChange={(e) => setHorarios(prev => ({ ...prev, fim: e.target.value }))}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-2">Dias da Semana</label>
          <div className="flex gap-2">
            {[
              { key: 'seg', label: 'Seg' },
              { key: 'ter', label: 'Ter' },
              { key: 'qua', label: 'Qua' },
              { key: 'qui', label: 'Qui' },
              { key: 'sex', label: 'Sex' },
              { key: 'sab', label: 'Sáb' },
              { key: 'dom', label: 'Dom' },
            ].map((dia) => (
              <button
                key={dia.key}
                onClick={() => setHorarios(prev => ({
                  ...prev,
                  diasSemana: prev.diasSemana.includes(dia.key)
                    ? prev.diasSemana.filter(d => d !== dia.key)
                    : [...prev.diasSemana, dia.key]
                }))}
                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                  horarios.diasSemana.includes(dia.key)
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {dia.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <p className="text-sm text-slate-400">
          💡 <strong>Dica:</strong> As notificações são enviadas automaticamente quando há tarefas atrasadas, 
          tarefas vencendo ou projetos parados. Configure os alertas na seção "Notificações".
        </p>
      </div>

      {/* Testar Alertas Manualmente */}
      <TestarAlertasSection />

      {/* Histórico de Notificações */}
      <HistoricoNotificacoesSection />
    </>
  );
}

// ============================================
// Seção de Teste de Alertas
// ============================================
function TestarAlertasSection() {
  const [testingAlert, setTestingAlert] = useState<string | null>(null);
  const [alertResult, setAlertResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const testarAlerta = async (tipo: string) => {
    setTestingAlert(tipo);
    setAlertResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/projeto-alertas-whatsapp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: tipo }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setAlertResult({ 
          success: true, 
          message: `Alerta executado com sucesso!`,
          data: data.result
        });
      } else {
        setAlertResult({ 
          success: false, 
          message: data.error || 'Erro ao executar alerta' 
        });
      }
    } catch (error) {
      setAlertResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro de conexão' 
      });
    } finally {
      setTestingAlert(null);
    }
  };

  const alertTypes = [
    { key: 'tarefa_atrasada', label: 'Tarefas Atrasadas', icon: AlertTriangle, color: 'rose' },
    { key: 'tarefa_vencendo', label: 'Tarefas Vencendo', icon: Clock, color: 'amber' },
    { key: 'projeto_parado', label: 'Projetos Parados', icon: Calendar, color: 'blue' },
    { key: 'resumo_semanal', label: 'Resumo Semanal', icon: FileText, color: 'violet' },
  ];

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
        <Play className="w-4 h-4 text-emerald-400" />
        Testar Alertas Manualmente
      </h3>
      <p className="text-sm text-slate-400 mb-4">
        Dispare alertas manualmente para testar a integração. Os alertas serão enviados para os destinatários configurados.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {alertTypes.map((alert) => {
          const Icon = alert.icon;
          const isLoading = testingAlert === alert.key;
          const colorClasses = {
            rose: 'hover:bg-rose-500/20 hover:border-rose-500/50',
            amber: 'hover:bg-amber-500/20 hover:border-amber-500/50',
            blue: 'hover:bg-blue-500/20 hover:border-blue-500/50',
            violet: 'hover:bg-violet-500/20 hover:border-violet-500/50',
          };

          return (
            <button
              key={alert.key}
              onClick={() => testarAlerta(alert.key)}
              disabled={testingAlert !== null}
              className={`
                p-4 rounded-lg border border-slate-700 bg-slate-800/50 
                transition-all text-left
                ${colorClasses[alert.color as keyof typeof colorClasses]}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : (
                  <Icon className={`w-5 h-5 text-${alert.color}-400`} />
                )}
              </div>
              <div className="text-sm font-medium text-white">{alert.label}</div>
            </button>
          );
        })}
      </div>

      {alertResult && (
        <div className={`mt-4 p-4 rounded-lg ${
          alertResult.success 
            ? 'bg-emerald-500/10 border border-emerald-500/30' 
            : 'bg-rose-500/10 border border-rose-500/30'
        }`}>
          <p className={`text-sm flex items-center gap-2 ${
            alertResult.success ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {alertResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {alertResult.message}
          </p>
          {alertResult.data && (
            <pre className="mt-2 text-xs text-slate-400 bg-slate-900/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(alertResult.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Seção de Histórico de Notificações
// ============================================
interface NotificacaoLog {
  id: number;
  tipo: string;
  destinatario_tipo: string;
  destinatario_id: number;
  canal: string;
  status: string;
  enviado_at: string;
  erro_mensagem?: string;
}

function HistoricoNotificacoesSection() {
  const [logs, setLogs] = useState<NotificacaoLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notificacao_log')
        .select('*')
        .order('enviado_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setLogs(data);
      }
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const tipoLabels: Record<string, { label: string; icon: string }> = {
    tarefa_atrasada: { label: 'Tarefa Atrasada', icon: '🚨' },
    tarefa_vencendo: { label: 'Tarefa Vencendo', icon: '📅' },
    projeto_parado: { label: 'Projeto Parado', icon: '⏸️' },
    resumo_semanal: { label: 'Resumo Semanal', icon: '📊' },
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" />
          Histórico de Notificações
        </h3>
        <Button 
          variant="outline" 
          size="sm"
          className="border-slate-700"
          onClick={fetchLogs}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Nenhuma notificação enviada ainda</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {logs.map((log) => {
            const tipoInfo = tipoLabels[log.tipo] || { label: log.tipo, icon: '📌' };
            
            return (
              <div 
                key={log.id}
                className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg"
              >
                <span className="text-lg">{tipoInfo.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {tipoInfo.label}
                  </div>
                  <div className="text-xs text-slate-500">
                    {log.destinatario_tipo} #{log.destinatario_id} • {log.canal}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    log.status === 'enviado' 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {log.status === 'enviado' ? '✓ Enviado' : '✗ Erro'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatDate(log.enviado_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConfiguracoesView;
