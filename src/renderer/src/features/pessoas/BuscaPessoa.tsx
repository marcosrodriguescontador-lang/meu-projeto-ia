import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import type { PessoaResumo } from '@shared/dto'
import { Entrada } from '@/components/ui'
import { formatarDocumento } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

export function BuscaPessoa({ aoSelecionar, ignorar = [] }: { aoSelecionar: (p: PessoaResumo) => void; ignorar?: number[] }) {
  const [termo, setTermo] = useState('')
  const { data } = useQuery({ queryKey: ['busca-pessoa', termo], queryFn: () => rpc('pessoas.listar', { busca: termo, porPagina: 10 }), enabled: termo.trim().length >= 2 })
  const itens = data?.itens.filter((p) => !ignorar.includes(p.id)) ?? []
  return (
    <div className="relative">
      <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
      <Entrada className="pl-9" placeholder="Buscar pessoa para vincular (nome ou CPF/CNPJ)" value={termo} onChange={(e) => setTermo(e.target.value)} />
      {termo.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-borda bg-superficie shadow-lg">
          {itens.length === 0 && <div className="p-3 text-sm text-texto-3">Nenhuma pessoa encontrada.</div>}
          {itens.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-superficie-2"
              onClick={() => {
                aoSelecionar(p)
                setTermo('')
              }}
            >
              <span>{p.nome}</span>
              <span className="numeros text-texto-2">{formatarDocumento(p.documento)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
