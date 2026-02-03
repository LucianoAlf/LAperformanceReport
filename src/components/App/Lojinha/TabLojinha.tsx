'use client';

import React, { useState } from 'react';
import { Package, ShoppingCart, BarChart3, Wallet, Settings, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TabProdutos } from './TabProdutos';
import { TabVendas } from './TabVendas';
import { TabEstoque } from './TabEstoque';
import { TabComissoes } from './TabComissoes';
import { TabConfiguracoes } from './TabConfiguracoes';
import { ModalRelatorioVendas } from './ModalRelatorioVendas';

type TabId = 'produtos' | 'vendas' | 'estoque' | 'comissoes' | 'config';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: 'produtos', label: 'Produtos', icon: Package },
  { id: 'vendas', label: 'Vendas', icon: ShoppingCart },
  { id: 'estoque', label: 'Estoque', icon: BarChart3 },
  { id: 'comissoes', label: 'Comissões', icon: Wallet },
  { id: 'config', label: 'Configurações', icon: Settings },
];

interface TabLojinhaProps {
  unidadeId: string;
}

export function TabLojinha({ unidadeId }: TabLojinhaProps) {
  const [activeTab, setActiveTab] = useState<TabId>('produtos');
  const [modalRelatorio, setModalRelatorio] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏪</span>
          <div>
            <h2 className="text-xl font-bold text-white">Lojinha</h2>
            <p className="text-sm text-slate-400">Gestão de Produtos, Vendas e Estoque</p>
          </div>
        </div>
        <Button
          onClick={() => setModalRelatorio(true)}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          <FileText className="w-4 h-4 mr-2" />
          Gerar Relatório WhatsApp
        </Button>
      </div>

      {/* Tabs (padrão cockpit - igual Fideliza+) */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'produtos' && <TabProdutos unidadeId={unidadeId} />}
        {activeTab === 'vendas' && <TabVendas unidadeId={unidadeId} />}
        {activeTab === 'estoque' && <TabEstoque unidadeId={unidadeId} />}
        {activeTab === 'comissoes' && <TabComissoes unidadeId={unidadeId} />}
        {activeTab === 'config' && <TabConfiguracoes unidadeId={unidadeId} />}
      </div>

      {/* Modal Relatório de Vendas */}
      <ModalRelatorioVendas
        open={modalRelatorio}
        onOpenChange={setModalRelatorio}
        unidadeId={unidadeId}
      />
    </div>
  );
}
