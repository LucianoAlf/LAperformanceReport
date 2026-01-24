import { Eye, Edit2, Trash2, MapPin, Music, Users, BookOpen, BarChart3, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Professor } from './types';

interface CardProfessorProps {
  professor: Professor;
  onVerDetalhes: (professor: Professor) => void;
  onEditar: (professor: Professor) => void;
  onPausar: (professor: Professor) => void;
  onExcluir: (professor: Professor) => void;
  formatarTempoCasa: (data: string) => string;
}

export function CardProfessor({ 
  professor, 
  onVerDetalhes, 
  onEditar, 
  onPausar, 
  onExcluir,
  formatarTempoCasa 
}: CardProfessorProps) {
  return (
    <div 
      className="bg-slate-800/50 rounded-xl border border-slate-700/50 pt-5 px-5 pb-3 hover:border-violet-500/50 transition-all cursor-pointer group h-full flex flex-col"
      onClick={() => onVerDetalhes(professor)}
    >
      {/* Header: Avatar + Nome + Status */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {professor.foto_url ? (
            <img src={professor.foto_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-medium text-slate-300">
              {professor.nome.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate group-hover:text-violet-400 transition-colors">
            {professor.nome}
          </h3>
          <span className={`
            inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium
            ${professor.ativo 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-slate-500/20 text-slate-400'
            }
          `}>
            {professor.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      {/* Spacer flexível - empurra conteúdo para baixo */}
      <div className="flex-1" />

      {/* Unidades e Cursos na mesma linha */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        {/* Unidades */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Unidades</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {professor.unidades && professor.unidades.length > 0 ? (
              <>
                {professor.unidades.slice(0, 2).map((u) => (
                  <span 
                    key={u.id}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/20 text-violet-300"
                  >
                    {u.unidade_codigo || u.unidade_nome}
                  </span>
                ))}
                {(professor.unidades?.length || 0) > 2 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-slate-300">
                    +{(professor.unidades?.length || 0) - 2}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-500 text-xs">-</span>
            )}
          </div>
        </div>

        {/* Cursos */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Music className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Cursos</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {professor.cursos && professor.cursos.length > 0 ? (
              <>
                {professor.cursos.slice(0, 2).map((c) => (
                  <span 
                    key={c.id}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300"
                  >
                    {c.curso_nome}
                  </span>
                ))}
                {(professor.cursos?.length || 0) > 2 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-slate-300">
                    +{(professor.cursos?.length || 0) - 2}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-500 text-xs">-</span>
            )}
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="bg-slate-700/30 rounded-lg p-3 mb-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Turmas */}
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-xs text-slate-400">Turmas</div>
              <div className="text-sm font-semibold text-white">{professor.total_turmas || 0}</div>
            </div>
          </div>

          {/* Alunos */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-xs text-slate-400">Alunos</div>
              <div className="text-sm font-semibold text-white">{professor.total_alunos || 0}</div>
            </div>
          </div>

          {/* Média/Turma */}
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <div>
              <div className="text-xs text-slate-400">Média/Turma</div>
              <div className={`text-sm font-semibold ${
                (professor.media_alunos_turma || 0) >= 2.0 
                  ? 'text-emerald-400' 
                  : (professor.media_alunos_turma || 0) >= 1.5 
                    ? 'text-yellow-400' 
                    : (professor.media_alunos_turma || 0) > 0 
                      ? 'text-red-400' 
                      : 'text-slate-500'
              }`}>
                {professor.total_turmas > 0 ? (professor.media_alunos_turma || 0).toFixed(1) : '-'}
              </div>
            </div>
          </div>

          {/* Tempo Casa */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <div>
              <div className="text-xs text-slate-400">Tempo Casa</div>
              <div className="text-sm font-semibold text-slate-300">{formatarTempoCasa(professor.data_admissao)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-700/30" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <Tooltip content="Ver detalhes" side="top">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              onClick={() => onVerDetalhes(professor)}
            >
              <Eye className="w-4 h-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Editar" side="top">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              onClick={() => onEditar(professor)}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content={professor.ativo ? "Pausar" : "Ativar"} side="top">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-amber-400"
              onClick={() => onPausar(professor)}
            >
              {professor.ativo ? '⏸' : '▶'}
            </Button>
          </Tooltip>
          <Tooltip content="Excluir" side="top">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-red-400"
              onClick={() => onExcluir(professor)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
