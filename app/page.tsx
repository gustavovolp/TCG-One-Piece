'use client';

import { useState, FormEvent } from 'react';

interface Carta {
  descricao: string;
  preco: string;
  imagem: string;
}

interface ItemCarrinho extends Carta {
  id: string;
  quantidade: number;
  precoNumerico: number;
}

export default function Home() {
  const [nome, setNome] = useState<string>('');
  const [codigo, setCodigo] = useState<string>('');
  const [resultados, setResultados] = useState<Carta[]>([]);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);

  const converterPrecoParaNumero = (precoStr: string): number => {
    if (precoStr === "R$ --,--" || !precoStr) return 0;
    const limpo = precoStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(limpo);
  };

  const formatarMoeda = (valor: number): string => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const lidarComBusca = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCarregando(true);
    setResultados([]);

    try {
      const resposta = await fetch('/api/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, codigo }),
      });

      const dados = await resposta.json();
      if (dados.cartas) {
        setResultados(dados.cartas);
      }
    } catch (erro) {
      console.error('Erro ao buscar dados:', erro);
    } finally {
      setCarregando(false);
    }
  };

  const adicionarAoCarrinho = (carta: Carta) => {
    const precoNum = converterPrecoParaNumero(carta.preco);
    if (precoNum === 0) {
      alert("Cartas sem preço listado não podem ser adicionadas.");
      return;
    }

    setCarrinho((prev) => {
      const indexExistente = prev.findIndex((item) => item.descricao === carta.descricao);
      
      if (indexExistente >= 0) {
        const novoCarrinho = [...prev];
        novoCarrinho[indexExistente].quantidade += 1;
        return novoCarrinho;
      } else {
        return [...prev, { ...carta, id: carta.descricao, quantidade: 1, precoNumerico: precoNum }];
      }
    });
  };

  const atualizarQuantidade = (id: string, delta: number) => {
    setCarrinho((prev) => {
      return prev.map((item) => {
        if (item.id === id) {
          const novaQuantidade = item.quantidade + delta;
          return { ...item, quantidade: Math.max(0, novaQuantidade) };
        }
        return item;
      }).filter((item) => item.quantidade > 0);
    });
  };

  const totalCarrinho = carrinho.reduce((total, item) => total + (item.precoNumerico * item.quantidade), 0);

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 flex flex-col lg:flex-row">
      <div className="flex-1 p-8 lg:border-r border-gray-700 overflow-y-auto">
        <h1 className="text-3xl font-extrabold text-center mb-8 text-yellow-500 tracking-wide">
          One Piece TCG Broker
        </h1>

        <div className="bg-gray-800 p-6 rounded-xl shadow-lg max-w-2xl mx-auto mb-10 border border-gray-700">
          <form onSubmit={lidarComBusca} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Personagem</label>
              <input
                type="text"
                required
                placeholder="Ex: Ms. All Sunday"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Código (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: OP04-064"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2.5 rounded-lg disabled:opacity-50"
            >
              {carregando ? 'Buscando rapidamente...' : 'Consultar Preços'}
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mx-auto">
          {resultados.map((carta, idx) => (
            <div key={idx} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-md flex flex-col">
              <div className="bg-gray-950 p-4 flex justify-center items-center h-64 border-b border-gray-700">
                <img
                  src={carta.imagem}
                  alt={carta.descricao}
                  className="max-h-full object-contain rounded-md"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/200x280/1f2937/9ca3af?text=Carta'; }}
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <p className="text-sm font-semibold text-gray-200 line-clamp-3 mb-3">{carta.descricao}</p>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-400 font-medium">Preço Base</span>
                    <span className="text-lg font-black text-green-400">{carta.preco}</span>
                  </div>
                  <button 
                    onClick={() => adicionarAoCarrinho(carta)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-bold transition-colors"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full lg:w-96 bg-gray-950 p-6 flex flex-col h-auto lg:h-screen sticky top-0 border-t lg:border-t-0 border-gray-700 shadow-2xl z-10">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          🛒 Orçamento / Deck
        </h2>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {carrinho.length === 0 ? (
            <p className="text-gray-500 text-sm text-center mt-10">Nenhuma carta adicionada.</p>
          ) : (
            carrinho.map((item) => (
              <div key={item.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex gap-3 items-center">
                <img src={item.imagem} className="w-12 h-16 object-cover rounded border border-gray-600" />
                
                <div className="flex-1">
                  <p className="text-xs text-gray-300 line-clamp-2 leading-tight mb-1">{item.descricao}</p>
                  <p className="text-green-400 font-bold text-sm">{formatarMoeda(item.precoNumerico)}</p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <button 
                      onClick={() => atualizarQuantidade(item.id, -1)}
                      className="bg-gray-700 hover:bg-gray-600 w-6 h-6 rounded flex items-center justify-center text-white"
                    >
                      -
                    </button>
                    <span className="text-sm font-medium w-4 text-center">{item.quantidade}</span>
                    <button 
                      onClick={() => atualizarQuantidade(item.id, 1)}
                      className="bg-gray-700 hover:bg-gray-600 w-6 h-6 rounded flex items-center justify-center text-white"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-4 mt-4 border-t border-gray-800">
          <div className="flex justify-between items-end mb-4">
            <span className="text-gray-400 font-medium">Total Estimado</span>
            <span className="text-3xl font-black text-yellow-500">{formatarMoeda(totalCarrinho)}</span>
          </div>
          <button 
            disabled={carrinho.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-lg shadow-lg transition-all"
          >
            Exportar Lista
          </button>
        </div>
      </div>
    </main>
  );
}