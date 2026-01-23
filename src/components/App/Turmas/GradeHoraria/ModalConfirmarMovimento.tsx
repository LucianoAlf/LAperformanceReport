// Modal de confirmação ao mover uma turma via drag & drop

import { useState } from 'react';
import { X, ArrowRight, AlertTriangle, Lightbulb, Check, RefreshCw } from 'lucide-react';
import type { TurmaGrade } from './types';
import type { Conflito } from '@/lib/horarios';
import type { Sugestao } from '@/lib/sugestoes-horarios';
import { ListaConflitos } from '../Conflitos';
import { ListaSugestoes } from '../Sugestoes';

interface MovimentoTurma {
  turma: TurmaGrade;
  de: { dia: string; horario: string };
  para: { dia: string; horario: string };
}

interface ModalConfirmarMovimentoProps {
  movimento: MovimentoTurma;
  conflitos: Conflito[];
  sugestoes: Sugestao[];
  carregando?: boolean;
  onConfirmar: () => void;
  onUsarSugestao: (sugestao: Sugestao) => void;
  onCancelar: () => void;
}

export function ModalConfirmarMovimento({
  movimento,
  conflitos,
  sugestoes,
  carregando = false,
  onConfirmar,
  onUsarSugestao,
  onCancelar
}: ModalConfirmarMovimentoProps) {
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  
  const temErros = conflitos.some(c => c.severidade === 'erro');
  const temAvisos = conflitos.some(c => c.severidade === 'aviso');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <RefreshCw className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Mover Turma</h2>
          </div>
          <button
            onClick={onCancelar}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Informações da turma */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🎵</span>
              <div>
                <p className="font-medium text-white">{movimento.turma.professor_nome}</p>
                <p className="text-sm text-slate-400">{movimento.turma.curso_nome}</p>
              </div>
            </div>

            {/* De -> Para */}
            <div className="flex items-center gap-3 text-sm">
              <div className="flex-1 bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">DE</p>
                <p className="font-medium text-white">
                  {movimento.de.dia}, {movimento.de.horario}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <div className="flex-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                <p className="text-xs text-cyan-400 mb-1">PARA</p>
                <p className="font-medium text-white">
                  {movimento.para.dia}, {movimento.para.horario}
                </p>
              </div>
            </div>
          </div>

          {/* Conflitos */}
          {conflitos.length > 0 && (
            <ListaConflitos 
              conflitos={conflitos}
              mostrarVazio={false}
            />
          )}

          {/* Sem conflitos */}
          {conflitos.length === 0 && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <Check className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Nenhum conflito detectado</p>
                <p className="text-xs text-slate-400">O horário está disponível</p>
              </div>
            </div>
          )}

          {/* Sugestões alternativas (se houver conflitos) */}
          {temErros && sugestoes.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setMostrarSugestoes(!mostrarSugestoes)}
                className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Lightbulb className="w-4 h-4" />
                {mostrarSugestoes ? 'Ocultar sugestões' : `Ver ${sugestoes.length} sugestões alternativas`}
              </button>

              {mostrarSugestoes && (
                <ListaSugestoes
                  sugestoes={sugestoes}
                  onUsarSugestao={onUsarSugestao}
                  modoCompacto
                  limiteInicial={5}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {temErros && (
              <span className="text-xs text-red-400 mr-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Há conflitos bloqueantes
              </span>
            )}
            
            <button
              onClick={onConfirmar}
              disabled={temErros || carregando}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                temErros
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : temAvisos
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {carregando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Movendo...
                </>
              ) : temAvisos ? (
                'Mover com Avisos'
              ) : (
                'Confirmar Movimento'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { MovimentoTurma };
