import type { ItemInventario, Sala } from './types';
import { getCategoriaConfig } from './types';

// Função para gerar PDF do inventário de uma sala
export async function gerarPdfInventarioSala(sala: Sala, itens: ItemInventario[]) {
  // Criar conteúdo HTML para o PDF
  const dataAtual = new Date().toLocaleDateString('pt-BR');
  const valorTotal = itens.reduce((acc, item) => acc + (item.valor_compra || 0) * item.quantidade, 0);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Inventário - ${sala.nome}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #333;
        }
        .header h1 {
          font-size: 24px;
          margin-bottom: 5px;
        }
        .header h2 {
          font-size: 18px;
          font-weight: normal;
          color: #666;
        }
        .header .date {
          font-size: 12px;
          color: #999;
          margin-top: 10px;
        }
        .info-box {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
        }
        .info-item {
          text-align: center;
        }
        .info-item .label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
        }
        .info-item .value {
          font-size: 18px;
          font-weight: bold;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          margin: 20px 0 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #ddd;
        }
        .checklist {
          list-style: none;
        }
        .checklist li {
          padding: 10px 0;
          border-bottom: 1px solid #eee;
          display: flex;
          align-items: center;
        }
        .checkbox {
          width: 18px;
          height: 18px;
          border: 2px solid #333;
          margin-right: 12px;
          flex-shrink: 0;
        }
        .item-info {
          flex: 1;
        }
        .item-name {
          font-weight: bold;
        }
        .item-details {
          font-size: 11px;
          color: #666;
        }
        .item-qty {
          font-weight: bold;
          margin-left: 10px;
          color: #333;
        }
        .conferencia {
          margin-top: 40px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
        }
        .conferencia h3 {
          font-size: 14px;
          margin-bottom: 15px;
        }
        .conferencia .field {
          margin-bottom: 15px;
        }
        .conferencia .field label {
          font-size: 12px;
          color: #666;
          display: block;
          margin-bottom: 5px;
        }
        .conferencia .field .line {
          border-bottom: 1px solid #333;
          height: 25px;
        }
        .conferencia .obs-lines {
          height: 60px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #ddd;
          font-size: 11px;
          color: #666;
          text-align: center;
        }
        @media print {
          body {
            padding: 10px;
          }
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎵 LA MUSIC SCHOOL - ${sala.unidade_nome?.toUpperCase() || 'UNIDADE'}</h1>
        <h2>INVENTÁRIO DA SALA: ${sala.nome.toUpperCase()}</h2>
        <div class="date">Data de Emissão: ${dataAtual}</div>
      </div>

      <div class="info-box">
        <div class="info-item">
          <div class="label">Total de Itens</div>
          <div class="value">${itens.length}</div>
        </div>
        <div class="info-item">
          <div class="label">Valor Total</div>
          <div class="value">${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        </div>
        <div class="info-item">
          <div class="label">Tipo de Sala</div>
          <div class="value">${sala.tipo_sala || 'Geral'}</div>
        </div>
      </div>

      <div class="section-title">LISTA DE EQUIPAMENTOS</div>
      <ul class="checklist">
        ${itens.map(item => {
          const cat = getCategoriaConfig(item.categoria);
          return `
            <li>
              <div class="checkbox"></div>
              <div class="item-info">
                <div class="item-name">${cat.emoji} ${item.nome}</div>
                <div class="item-details">
                  ${item.marca || ''} ${item.modelo ? `- ${item.modelo}` : ''}
                  ${item.codigo_patrimonio ? ` | Patrimônio: ${item.codigo_patrimonio}` : ''}
                </div>
              </div>
              <div class="item-qty">(${item.quantidade} un.)</div>
            </li>
          `;
        }).join('')}
      </ul>

      <div class="conferencia">
        <h3>📋 CONFERÊNCIA DIÁRIA</h3>
        <div style="display: flex; gap: 20px;">
          <div class="field" style="flex: 1;">
            <label>Data:</label>
            <div class="line"></div>
          </div>
          <div class="field" style="flex: 2;">
            <label>Responsável:</label>
            <div class="line"></div>
          </div>
        </div>
        <div class="field">
          <label>Observações:</label>
          <div class="obs-lines"></div>
        </div>
      </div>

      <div class="footer">
        <p>⚠️ Qualquer irregularidade, comunicar imediatamente à coordenação.</p>
        <p style="margin-top: 5px;">LA Music School - Sistema de Gestão de Inventário</p>
      </div>
    </body>
    </html>
  `;

  // Abrir nova janela para impressão
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Aguardar carregamento e imprimir
    printWindow.onload = () => {
      printWindow.print();
    };
  }
}

// Função para gerar PDF geral do inventário
export async function gerarPdfInventarioGeral(
  itens: ItemInventario[], 
  unidadeNome?: string
) {
  const dataAtual = new Date().toLocaleDateString('pt-BR');
  const valorTotal = itens.reduce((acc, item) => acc + (item.valor_compra || 0) * item.quantidade, 0);

  // Agrupar por sala
  const itensPorSala = itens.reduce((acc, item) => {
    const salaNome = item.sala_nome || 'Sem sala definida';
    if (!acc[salaNome]) acc[salaNome] = [];
    acc[salaNome].push(item);
    return acc;
  }, {} as Record<string, ItemInventario[]>);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Inventário Geral${unidadeNome ? ` - ${unidadeNome}` : ''}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 11px; }
        .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #333; }
        .header h1 { font-size: 20px; margin-bottom: 5px; }
        .header .date { font-size: 10px; color: #999; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f5f5f5; font-weight: bold; font-size: 10px; text-transform: uppercase; }
        .sala-header { background: #333; color: white; padding: 8px; margin-top: 15px; font-weight: bold; }
        .total-row { font-weight: bold; background: #f9f9f9; }
        .footer { margin-top: 20px; font-size: 10px; color: #666; text-align: center; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎵 LA MUSIC SCHOOL${unidadeNome ? ` - ${unidadeNome.toUpperCase()}` : ''}</h1>
        <h2>INVENTÁRIO GERAL DE EQUIPAMENTOS</h2>
        <div class="date">Data de Emissão: ${dataAtual}</div>
      </div>

      <p style="margin-bottom: 15px;">
        <strong>Total de Itens:</strong> ${itens.length} | 
        <strong>Valor Total:</strong> ${valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </p>

      ${Object.entries(itensPorSala).map(([salaNome, itensNaSala]) => `
        <div class="sala-header">🚪 ${salaNome} (${itensNaSala.length} itens)</div>
        <table>
          <thead>
            <tr>
              <th>Patrimônio</th>
              <th>Item</th>
              <th>Marca/Modelo</th>
              <th>Qtd</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Condição</th>
            </tr>
          </thead>
          <tbody>
            ${itensNaSala.map(item => `
              <tr>
                <td>${item.codigo_patrimonio || '-'}</td>
                <td>${item.nome}</td>
                <td>${item.marca || ''} ${item.modelo ? `- ${item.modelo}` : ''}</td>
                <td>${item.quantidade}</td>
                <td>${item.valor_compra ? item.valor_compra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}</td>
                <td>${item.status}</td>
                <td>${item.condicao}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="4">Subtotal da Sala</td>
              <td colspan="3">${itensNaSala.reduce((acc, i) => acc + (i.valor_compra || 0) * i.quantidade, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            </tr>
          </tbody>
        </table>
      `).join('')}

      <div class="footer">
        <p>LA Music School - Sistema de Gestão de Inventário</p>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }
}
