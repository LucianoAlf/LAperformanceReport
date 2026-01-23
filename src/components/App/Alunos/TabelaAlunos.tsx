import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, RotateCcw, Plus, Edit2, Trash2, Check, X, History, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Aluno, Filtros } from './AlunosPage';

interface TabelaAlunosProps {
  alunos: Aluno[];
  todosAlunos: Aluno[]; // Todos os alunos sem filtro para contagem fixa
  filtros: Filtros;
  setFiltros: (filtros: Filtros) => void;
  limparFiltros: () => void;
  professores: {id: number, nome: string}[];
  cursos: {id: number, nome: string}[];
  tiposMatricula: {id: number, nome: string}[];
  salas: {id: number, nome: string, capacidade_maxima: number}[];
  horarios: {id: number, nome: string, hora_inicio: string}[];
  onNovoAluno: () => void;
  onRecarregar: () => void;
  verificarTurmaAoSalvar: (aluno: Aluno) => Promise<boolean>;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORARIOS_LISTA = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

export function TabelaAlunos({
  alunos,
  todosAlunos,
  filtros,
  setFiltros,
  limparFiltros,
  professores,
  cursos,
  tiposMatricula,
  salas,
  horarios,
  onNovoAluno,
  onRecarregar,
  verificarTurmaAoSalvar
}: TabelaAlunosProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Partial<Aluno>>({});
  const [saving, setSaving] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [alunoParaExcluir, setAlunoParaExcluir] = useState<Aluno | null>(null);
  const itensPorPagina = 30;

  // Paginação
  const totalPaginas = Math.ceil(alunos.length / itensPorPagina);
  const alunosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return alunos.slice(inicio, inicio + itensPorPagina);
  }, [alunos, paginaAtual]);

  // Contador de turmas por tamanho (usa todosAlunos para manter fixo)
  // IMPORTANTE: Deve usar a mesma lógica da view vw_turmas_implicitas
  // que agrupa por: unidade_id, professor_atual_id, curso_id, dia_aula, horario_aula
  const contagemTurmas = useMemo(() => {
    const turmasContagem = new Map<string, number>();
    // Usar todosAlunos para contagem fixa (não afetada por filtros)
    // Filtrar apenas alunos ATIVOS com professor/dia/horário (mesma lógica da vw_turmas_implicitas)
    (todosAlunos || alunos)
      .filter(aluno => 
        aluno.status === 'ativo' && 
        aluno.professor_atual_id && 
        aluno.dia_aula && 
        aluno.horario_aula
      )
      .forEach(aluno => {
        // Usar combinação de unidade+professor+curso+dia+horário como chave de turma
        // (mesma lógica da view vw_turmas_implicitas)
        const key = `${aluno.unidade_id}-${aluno.professor_atual_id}-${aluno.curso_id || 'null'}-${aluno.dia_aula}-${aluno.horario_aula}`;
        turmasContagem.set(key, (turmasContagem.get(key) || 0) + 1);
      });
    
    const contagem = { sozinhos: 0, duplas: 0, grupos: 0 };
    turmasContagem.forEach(total => {
      if (total === 1) contagem.sozinhos++;
      else if (total === 2) contagem.duplas++;
      else if (total >= 3) contagem.grupos++;
    });
    
    return contagem;
  }, [todosAlunos, alunos]);

  function iniciarEdicao(aluno: Aluno) {
    setEditingId(aluno.id);
    setEditingData({
      nome: aluno.nome,
      professor_atual_id: aluno.professor_atual_id,
      curso_id: aluno.curso_id,
      dia_aula: aluno.dia_aula,
      horario_aula: aluno.horario_aula,
      valor_parcela: aluno.valor_parcela,
      status: aluno.status
    });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setEditingData({});
  }

  async function salvarEdicao() {
    if (!editingId) return;
    
    setSaving(true);
    
    // Verificar se a turma já tem alunos
    const alunoAtualizado = {
      ...alunos.find(a => a.id === editingId)!,
      ...editingData
    };
    
    const podeProsseguir = await verificarTurmaAoSalvar(alunoAtualizado);
    if (!podeProsseguir) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('alunos')
      .update({
        nome: editingData.nome,
        professor_atual_id: editingData.professor_atual_id,
        curso_id: editingData.curso_id,
        dia_aula: editingData.dia_aula,
        horario_aula: editingData.horario_aula ? `${editingData.horario_aula}:00` : null,
        valor_parcela: editingData.valor_parcela,
        status: editingData.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingId);

    if (!error) {
      setEditingId(null);
      setEditingData({});
      onRecarregar();
    }
    setSaving(false);
  }

  async function confirmarExclusao() {
    if (!alunoParaExcluir) return;
    
    const { error } = await supabase
      .from('alunos')
      .delete()
      .eq('id', alunoParaExcluir.id);

    if (!error) {
      onRecarregar();
    }
    setAlunoParaExcluir(null);
  }

  function getBadgeTurma(totalAlunos: number, aluno: Aluno) {
    const handleClick = () => {
      // Navegar para aba de Gestão de Turmas com filtro aplicado
      if (aluno.professor_atual_id && aluno.dia_aula && aluno.horario_aula) {
        // Trigger navegação para aba de turmas
        const event = new CustomEvent('navegarParaTurma', {
          detail: {
            professor_id: aluno.professor_atual_id,
            dia: aluno.dia_aula,
            horario: aluno.horario_aula
          }
        });
        window.dispatchEvent(event);
      }
    };

    const badgeClass = "px-2 py-1 rounded text-xs whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity";
    const tooltipContent = aluno.nomes_alunos_turma?.length 
      ? aluno.nomes_alunos_turma.join(', ') 
      : 'Clique para ver a turma';

    if (totalAlunos === 1) {
      return (
        <Tooltip content={tooltipContent} side="top">
          <span 
            className={`${badgeClass} bg-red-500/30 text-red-400 font-medium animate-pulse`}
            onClick={handleClick}
          >
            <AlertTriangle className="w-3 h-3 inline mr-1" />1 aluno
          </span>
        </Tooltip>
      );
    }
    if (totalAlunos === 2) {
      return (
        <Tooltip content={tooltipContent} side="top">
          <span 
            className={`${badgeClass} bg-yellow-500/20 text-yellow-400`}
            onClick={handleClick}
          >
            2 alunos
          </span>
        </Tooltip>
      );
    }
    return (
      <Tooltip content={tooltipContent} side="top">
        <span 
          className={`${badgeClass} bg-emerald-500/20 text-emerald-400`}
          onClick={handleClick}
        >
          {totalAlunos} alunos
        </span>
      </Tooltip>
    );
  }

  function formatarTempoPermanencia(meses: number | null): string {
    if (!meses || meses === 0) return 'Novo';
    
    if (meses < 12) {
      return `${meses}m`;
    }
    
    const anos = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    
    if (mesesRestantes === 0) {
      return `${anos}a`;
    }
    
    return `${anos}a ${mesesRestantes}m`;
  }

  function getBadgeStatus(status: string) {
    switch (status) {
      case 'ativo':
        return <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs">Ativo</span>;
      case 'trancado':
        return <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs">Trancado</span>;
      case 'inativo':
        return <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">Inativo</span>;
      default:
        return <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">{status}</span>;
    }
  }

  function getBadgeEscola(classificacao: string) {
    if (classificacao === 'EMLA') {
      return <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs font-medium">EMLA</span>;
    }
    return <span className="bg-pink-500/20 text-pink-400 px-2 py-1 rounded text-xs font-medium">LAMK</span>;
  }

  function getBadgesAluno(aluno: Aluno) {
    const badges = [];
    
    // Veterano (mais de 12 meses)
    if (aluno.tempo_permanencia_meses && aluno.tempo_permanencia_meses >= 12) {
      badges.push(
        <span key="veterano" className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
          Veterano
        </span>
      );
    }
    
    // Bolsista
    if (aluno.tipo_matricula_nome?.includes('Bolsista')) {
      badges.push(
        <span key="bolsista" className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
          Bolsista
        </span>
      );
    }
    
    return badges;
  }

  return (
    <>
      {/* Filtros */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-700">
        {/* Resumo de Turmas */}
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span className="text-slate-400">Turmas:</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setFiltros({ ...filtros, turma_size: filtros.turma_size === '1' ? '' : '1' })}
              className={`px-2 py-1 rounded text-xs font-medium transition ${filtros.turma_size === '1' ? 'ring-2 ring-red-400' : ''} bg-red-500/20 text-red-400 hover:bg-red-500/30`}
            >
              {contagemTurmas.sozinhos} sozinho{contagemTurmas.sozinhos !== 1 ? 's' : ''}
            </button>
            <button 
              onClick={() => setFiltros({ ...filtros, turma_size: filtros.turma_size === '2' ? '' : '2' })}
              className={`px-2 py-1 rounded text-xs font-medium transition ${filtros.turma_size === '2' ? 'ring-2 ring-yellow-400' : ''} bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30`}
            >
              {contagemTurmas.duplas} dupla{contagemTurmas.duplas !== 1 ? 's' : ''}
            </button>
            <button 
              onClick={() => setFiltros({ ...filtros, turma_size: filtros.turma_size === '3+' ? '' : '3+' })}
              className={`px-2 py-1 rounded text-xs font-medium transition ${filtros.turma_size === '3+' ? 'ring-2 ring-emerald-400' : ''} bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30`}
            >
              {contagemTurmas.grupos} grupo{contagemTurmas.grupos !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Busca por nome */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar aluno..."
              value={filtros.nome}
              onChange={(e) => setFiltros({ ...filtros, nome: e.target.value })}
              className="w-[200px] bg-slate-800/50 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 h-10"
            />
          </div>

          {/* Filtro Professor */}
          <Select
            value={filtros.professor_id || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, professor_id: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[140px] ${filtros.professor_id && filtros.professor_id !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Professor</SelectItem>
              {professores.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Curso */}
          <Select
            value={filtros.curso_id || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, curso_id: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[140px] ${filtros.curso_id && filtros.curso_id !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Curso</SelectItem>
              {cursos.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Dia */}
          <Select
            value={filtros.dia_aula || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, dia_aula: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[110px] ${filtros.dia_aula && filtros.dia_aula !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Dia</SelectItem>
              {DIAS_SEMANA.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Horário */}
          <Select
            value={filtros.horario_aula || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, horario_aula: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[100px] ${filtros.horario_aula && filtros.horario_aula !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Horário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Horário</SelectItem>
              {HORARIOS_LISTA.map(h => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Status */}
          <Select
            value={filtros.status || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, status: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[100px] ${filtros.status && filtros.status !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="aviso_previo">Aviso Prévio</SelectItem>
              <SelectItem value="trancado">Trancado</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Tipo */}
          <Select
            value={filtros.tipo_matricula_id || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, tipo_matricula_id: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[110px] ${filtros.tipo_matricula_id && filtros.tipo_matricula_id !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Tipo</SelectItem>
              {tiposMatricula.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Escola */}
          <Select
            value={filtros.classificacao || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, classificacao: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[100px] ${filtros.classificacao && filtros.classificacao !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Escola" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Escola</SelectItem>
              <SelectItem value="EMLA">EMLA</SelectItem>
              <SelectItem value="LAMK">LAMK</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Turma */}
          <Select
            value={filtros.turma_size || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, turma_size: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[140px] ${filtros.turma_size && filtros.turma_size !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Turma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Turma</SelectItem>
              <SelectItem value="1">1 aluno (sozinho)</SelectItem>
              <SelectItem value="2">2 alunos</SelectItem>
              <SelectItem value="3+">3+ alunos</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Tempo de Permanência */}
          <Select
            value={filtros.tempo_permanencia || "todos"}
            onValueChange={(value) => setFiltros({ ...filtros, tempo_permanencia: value === "todos" ? "" : value })}
          >
            <SelectTrigger className={`w-[160px] ${filtros.tempo_permanencia && filtros.tempo_permanencia !== 'todos' ? 'border-2 border-purple-500 bg-purple-500/10' : ''}`}>
              <SelectValue placeholder="Tempo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Tempo</SelectItem>
              <SelectItem value="novo">Novo (0-1 mês)</SelectItem>
              <SelectItem value="menos-1">Menos de 1 ano</SelectItem>
              <SelectItem value="1-2">1-2 anos</SelectItem>
              <SelectItem value="2-3">2-3 anos</SelectItem>
              <SelectItem value="3-4">3-4 anos</SelectItem>
              <SelectItem value="4-5">4-5 anos</SelectItem>
              <SelectItem value="5+">5+ anos</SelectItem>
            </SelectContent>
          </Select>

          {/* Limpar filtros */}
          <button
            onClick={limparFiltros}
            className="h-10 bg-slate-700 hover:bg-slate-600 px-4 rounded-xl text-sm transition flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-700/50">
            <tr className="text-left text-slate-400 text-xs uppercase">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Escola</th>
              <th className="px-4 py-3 font-medium">Professor</th>
              <th className="px-4 py-3 font-medium">Curso</th>
              <th className="px-4 py-3 font-medium">Dia</th>
              <th className="px-4 py-3 font-medium">Horário</th>
              <th className="px-4 py-3 font-medium">Turma</th>
              <th className="px-4 py-3 font-medium">Parcela</th>
              <th className="px-4 py-3 font-medium">Tempo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {alunosPaginados.map((aluno, index) => {
              const isEditing = editingId === aluno.id;
              const isSozinho = aluno.total_alunos_turma === 1;
              
              return (
                <tr
                  key={aluno.id}
                  className={`
                    transition
                    ${isEditing ? 'bg-purple-900/20 border-l-4 border-purple-500' : ''}
                    ${isSozinho && !isEditing ? 'bg-red-900/10' : ''}
                    ${!isEditing ? 'hover:bg-slate-700/30' : ''}
                  `}
                >
                  <td className="px-4 py-3 text-slate-500">
                    {(paginaAtual - 1) * itensPorPagina + index + 1}
                  </td>
                  
                  {/* Nome */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingData.nome || ''}
                        onChange={(e) => setEditingData({ ...editingData, nome: e.target.value })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm w-full"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{aluno.nome}</span>
                        {getBadgesAluno(aluno)}
                      </div>
                    )}
                  </td>

                  {/* Escola */}
                  <td className="px-4 py-3">
                    {getBadgeEscola(aluno.classificacao)}
                  </td>

                  {/* Professor */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editingData.professor_atual_id || ''}
                        onChange={(e) => setEditingData({ ...editingData, professor_atual_id: parseInt(e.target.value) || null })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm"
                      >
                        <option value="">Selecione</option>
                        {professores.map(p => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">{aluno.professor_nome || '-'}</span>
                    )}
                  </td>

                  {/* Curso */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editingData.curso_id || ''}
                        onChange={(e) => setEditingData({ ...editingData, curso_id: parseInt(e.target.value) || null })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm"
                      >
                        <option value="">Selecione</option>
                        {cursos.map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">{aluno.curso_nome || '-'}</span>
                    )}
                  </td>

                  {/* Dia */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editingData.dia_aula || ''}
                        onChange={(e) => setEditingData({ ...editingData, dia_aula: e.target.value })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm"
                      >
                        <option value="">Selecione</option>
                        {DIAS_SEMANA.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">{aluno.dia_aula || '-'}</span>
                    )}
                  </td>

                  {/* Horário */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editingData.horario_aula?.substring(0, 5) || ''}
                        onChange={(e) => setEditingData({ ...editingData, horario_aula: e.target.value })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm"
                      >
                        <option value="">Selecione</option>
                        {HORARIOS_LISTA.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">{aluno.horario_aula?.substring(0, 5) || '-'}</span>
                    )}
                  </td>

                  {/* Turma */}
                  <td className="px-4 py-3">
                    {aluno.dia_aula && aluno.horario_aula
                      ? getBadgeTurma(aluno.total_alunos_turma || 1, aluno)
                      : <span className="bg-slate-500/20 text-slate-400 px-2 py-1 rounded text-xs">-</span>
                    }
                  </td>

                  {/* Parcela */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editingData.valor_parcela || ''}
                        onChange={(e) => setEditingData({ ...editingData, valor_parcela: parseFloat(e.target.value) || null })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm w-20"
                      />
                    ) : (
                      <span className="text-slate-300">
                        {aluno.valor_parcela ? `R$ ${aluno.valor_parcela}` : '-'}
                      </span>
                    )}
                  </td>

                  {/* Tempo */}
                  <td className="px-4 py-3 text-slate-300">
                    {formatarTempoPermanencia(aluno.tempo_permanencia_meses)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={editingData.status || ''}
                        onChange={(e) => setEditingData({ ...editingData, status: e.target.value })}
                        className="bg-slate-700 border border-purple-500 rounded px-2 py-1 text-sm"
                      >
                        <option value="ativo">Ativo</option>
                        <option value="trancado">Trancado</option>
                        <option value="inativo">Inativo</option>
                      </select>
                    ) : (
                      getBadgeStatus(aluno.status)
                    )}
                  </td>

                  {/* Ações */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button
                            onClick={salvarEdicao}
                            disabled={saving}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded transition"
                            title="Salvar"
                          >
                            <Check className="w-4 h-4 text-white" />
                          </button>
                          <button
                            onClick={cancelarEdicao}
                            className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded transition"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Tooltip content="Ver histórico" side="top">
                            <button
                              className="p-1.5 hover:bg-slate-600 rounded transition"
                            >
                              <History className="w-4 h-4 text-slate-400" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Editar aluno" side="top">
                            <button
                              onClick={() => iniciarEdicao(aluno)}
                              className="p-1.5 hover:bg-slate-600 rounded transition"
                            >
                              <Edit2 className="w-4 h-4 text-blue-400" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Excluir aluno" side="top">
                            <button
                              onClick={() => setAlunoParaExcluir(aluno)}
                              className="p-1.5 hover:bg-slate-600 rounded transition"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="p-4 border-t border-slate-700 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Mostrando {((paginaAtual - 1) * itensPorPagina) + 1}-{Math.min(paginaAtual * itensPorPagina, alunos.length)} de {alunos.length} alunos
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
            disabled={paginaAtual === 1}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition disabled:opacity-50"
          >
            Anterior
          </button>
          {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
            let pageNum = i + 1;
            if (totalPaginas > 5) {
              if (paginaAtual > 3) {
                pageNum = paginaAtual - 2 + i;
              }
              if (pageNum > totalPaginas) {
                pageNum = totalPaginas - 4 + i;
              }
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPaginaAtual(pageNum)}
                className={`px-3 py-1.5 rounded text-sm transition ${
                  paginaAtual === pageNum
                    ? 'bg-purple-600'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
            disabled={paginaAtual === totalPaginas}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition disabled:opacity-50"
          >
            Próximo
          </button>
        </div>
      </div>

      {/* Alert Dialog de Exclusão */}
      <AlertDialog open={!!alunoParaExcluir} onOpenChange={() => setAlunoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aluno</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o aluno <strong className="text-white">{alunoParaExcluir?.nome}</strong>?
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
