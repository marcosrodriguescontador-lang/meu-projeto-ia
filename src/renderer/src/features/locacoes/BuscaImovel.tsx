import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import type { ImovelResumo } from '@shared/dto'
import { Entrada } from '@/components/ui'
import { SeloSituacao } from '@/features/imoveis/comum'
import { rpc } from '@/lib/rpc'

export function BuscaImovel({ aoSelecionar, modalidade = 'LOCACAO' }: { aoSelecionar: (i: ImovelResumo) => void; modalidade?: 'VENDA' | 'LOCACAO' }) {
  const [termo, setTermo] = useState('')
  const { data } = useQuery({ queryKey: ['busca-imovel', modalidade, termo], queryFn: () => rpc('imoveis.listar', { busca: termo, modalidade, porPagina: 10 }), enabled: termo.trim().length >= 1 })
  return (
    <div className="relative">
      <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
      <Entrada className="pl-9" placeholder={`Buscar imóvel com oferta de ${modalidade === 'VENDA' ? 'venda' : 'locação'} (código ou endereço)`} value={termo} onChange={(e) => setTermo(e.target.value)} />
      {termo.trim() && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-borda bg-superficie shadow-lg">
          {data?.itens.length === 0 && <div className="p-3 text-sm text-texto-3">Nenhum imóvel encontrado.</div>}
          {data?.itens.map((i) => (
            <button
              key={i.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-superficie-2"
              onClick={() => {
                aoSelecionar(i)
                setTermo('')
              }}
            >
              <span>
                <span className="numeros text-texto-3">#{i.codigo}</span> {i.endereco} — {i.bairro}
              </span>
              <span className="flex items-center gap-2">
                {i.locacao && <span className="numeros">{formatarMoeda(i.locacao.valorCentavos)}</span>}
                {i.locacao && <SeloSituacao situacao={i.locacao.situacao} />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
