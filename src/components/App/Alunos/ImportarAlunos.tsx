import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download } from 'lucide-react';

interface ImportarAlunosProps {
  onRecarregar: () => void;
}

export function ImportarAlunos({ onRecarregar }: ImportarAlunosProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'validando' | 'importando' | 'sucesso' | 'erro'>('idle');
  const [erros, setErros] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setArquivo(file);
      setStatus('idle');
      setErros([]);
      // Aqui faria o parse do arquivo para preview
      setPreview([]);
    }
  }

  async function handleImportar() {
    if (!arquivo) return;
    
    setStatus('validando');
    // Simulação de validação
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setStatus('importando');
    // Simulação de importação
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setStatus('sucesso');
    onRecarregar();
  }

  function downloadModelo() {
    // Criar CSV modelo
    const headers = 'nome,data_nascimento,telefone,email,curso,professor,dia_aula,horario_aula,valor_parcela,tipo_matricula';
    const exemplo = 'João Silva,1990-05-15,21999999999,joao@email.com,Guitarra,Matheus Lana,Segunda,15:00,450,Regular';
    const csv = `${headers}\n${exemplo}`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_alunos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Instruções */}
      <div className="bg-slate-700/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">📤 Importar Alunos em Lote</h3>
        <p className="text-slate-400 mb-4">
          Importe múltiplos alunos de uma vez usando um arquivo CSV ou Excel.
        </p>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Instruções */}
          <div>
            <h4 className="font-medium text-white mb-2">Instruções:</h4>
            <ol className="list-decimal list-inside text-sm text-slate-400 space-y-1">
              <li>Baixe o modelo de planilha abaixo</li>
              <li>Preencha os dados dos alunos</li>
              <li>Salve como CSV (separado por vírgula)</li>
              <li>Faça upload do arquivo</li>
              <li>Revise os dados e confirme a importação</li>
            </ol>
          </div>
          
          {/* Colunas obrigatórias */}
          <div>
            <h4 className="font-medium text-white mb-2">Colunas obrigatórias:</h4>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• <code className="bg-slate-600 px-1 rounded">nome</code> - Nome completo do aluno</li>
              <li>• <code className="bg-slate-600 px-1 rounded">curso</code> - Nome do curso</li>
              <li>• <code className="bg-slate-600 px-1 rounded">professor</code> - Nome do professor</li>
              <li>• <code className="bg-slate-600 px-1 rounded">dia_aula</code> - Segunda, Terça, etc</li>
              <li>• <code className="bg-slate-600 px-1 rounded">horario_aula</code> - HH:MM</li>
            </ul>
          </div>
        </div>

        <button
          onClick={downloadModelo}
          className="mt-4 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Baixar Modelo CSV
        </button>
      </div>

      {/* Upload */}
      <div className="bg-slate-700/30 rounded-lg p-6">
        <h4 className="font-medium text-white mb-4">Upload do Arquivo</h4>
        
        <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-purple-500 transition">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <FileSpreadsheet className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">
              {arquivo ? arquivo.name : 'Arraste um arquivo ou clique para selecionar'}
            </p>
            <p className="text-xs text-slate-500">CSV ou Excel (máx. 5MB)</p>
          </label>
        </div>

        {arquivo && (
          <div className="mt-4 flex items-center justify-between bg-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-purple-400" />
              <div>
                <p className="font-medium text-white">{arquivo.name}</p>
                <p className="text-xs text-slate-500">{(arquivo.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              onClick={() => setArquivo(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Status da importação */}
      {status !== 'idle' && (
        <div className={`rounded-lg p-4 ${
          status === 'sucesso' ? 'bg-emerald-900/30 border border-emerald-500/50' :
          status === 'erro' ? 'bg-red-900/30 border border-red-500/50' :
          'bg-slate-700/30'
        }`}>
          <div className="flex items-center gap-3">
            {status === 'validando' && (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500" />
                <span className="text-slate-300">Validando dados...</span>
              </>
            )}
            {status === 'importando' && (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500" />
                <span className="text-slate-300">Importando alunos...</span>
              </>
            )}
            {status === 'sucesso' && (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400">Importação concluída com sucesso!</span>
              </>
            )}
            {status === 'erro' && (
              <>
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-400">Erro na importação</span>
              </>
            )}
          </div>
          
          {erros.length > 0 && (
            <ul className="mt-3 text-sm text-red-400 space-y-1">
              {erros.map((erro, i) => (
                <li key={i}>• {erro}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Botão de importar */}
      {arquivo && status === 'idle' && (
        <button
          onClick={handleImportar}
          className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
        >
          <Upload className="w-5 h-5" />
          Iniciar Importação
        </button>
      )}

      {/* Preview dos dados */}
      {preview.length > 0 && (
        <div className="bg-slate-700/30 rounded-lg p-6">
          <h4 className="font-medium text-white mb-4">Preview dos Dados ({preview.length} registros)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50">
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Curso</th>
                  <th className="px-4 py-2">Professor</th>
                  <th className="px-4 py-2">Dia</th>
                  <th className="px-4 py-2">Horário</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {preview.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-white">{row.nome}</td>
                    <td className="px-4 py-2 text-slate-300">{row.curso}</td>
                    <td className="px-4 py-2 text-slate-300">{row.professor}</td>
                    <td className="px-4 py-2 text-slate-300">{row.dia_aula}</td>
                    <td className="px-4 py-2 text-slate-300">{row.horario_aula}</td>
                    <td className="px-4 py-2">
                      {row.valido ? (
                        <span className="text-emerald-400">✓ OK</span>
                      ) : (
                        <span className="text-red-400">✕ Erro</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
