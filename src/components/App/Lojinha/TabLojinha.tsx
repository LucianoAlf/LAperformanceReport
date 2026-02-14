'use client';

import React, { useState } from 'react';
import { Package, ShoppingCart, BarChart3, Wallet, Settings, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { TabProdutos } from './TabProdutos';
import { TabVendas } from './TabVendas';
import { TabEstoque } from './TabEstoque';
import { TabComissoes } from './TabComissoes';
import { TabConfiguracoes } from './TabConfiguracoes';
import { ModalRelatorioVendas } from './ModalRelatorioVendas';

type TabId = 'produtos' | 'vendas' | 'estoque' | 'comissoes' | 'config';

const lojinhaTabs: PageTab<TabId>[] = [
  { id: 'produtos', label: 'Produtos', shortLabel: 'Prod.', icon: Package },
  { id: 'vendas', label: 'Vendas', shortLabel: 'Vendas', icon: ShoppingCart },
  { id: 'estoque', label: 'Estoque', shortLabel: 'Estoq.', icon: BarChart3 },
  { id: 'comissoes', label: 'Comissões', shortLabel: 'Comiss.', icon: Wallet },
  { id: 'config', label: 'Configurações', shortLabel: 'Config', icon: Settings },
];

interface TabLojinhaProps {
  unidadeId: string;
}

export function TabLojinha({ unidadeId }: TabLojinhaProps) {
  const [activeTab, setActiveTab] = useState<TabId>('produtos');
  const [modalRelatorio, setModalRelatorio] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setModalRelatorio(true)}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          <FileText className="w-4 h-4 mr-2" />
          Gerar Relatório WhatsApp
        </Button>
      </div>

      {/* Abas */}
      <PageTabs
        tabs={lojinhaTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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
