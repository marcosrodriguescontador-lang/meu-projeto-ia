import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatarMoeda } from '@shared/dinheiro'
import { formatarData } from '@shared/financeiro/datas'
import { SITUACOES_CONTRATO } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Botao, CabecalhoPagina, Cartao, Entrada, Selecao, Selo, Tabela } from '@/components/ui'
import { rpc } from '@/lib/rpc'

export function SeloContrato({ situacao }: { situacao: string }) {
  const tom = ({ ATIVO: 'destaque', RASCUNHO: 'alerta', ENCERRADO: 'neutro', RESCINDIDO: 'neutro' } as const)[situacao as 'ATIVO'] ?? 'neutro'
  return <Selo tom={tom}>{SITUACOES_CONTRATO[situacao as keyof typeof SITUACOES_CONTRATO] ?? situacao}</Selo>
}

export function ListaContratos() {
  const { pode } = useSessao()
  const nav = useNavigate()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('')
  const [vencendo, setVencendo] = useState(false)
  const filtro = { busca: busca || undefined, situacao: situacao || undefined, vencendoDias: vencendo ? 60 : undefined }
  const { data, isLoading } = useQuery({ queryKey: ['contratos', filtro], queryFn: () => rpc('contratos.listar', filtro) })
  return (
    <>
      <CabecalhoPagina
        titulo="Contratos de locação"
        subtitulo="Contratos, garantias, encargos e situação financeira."
        acoes={
          pode('locacoes.gerenciar') && (
            <Link to="/locacoes/novo">
              <Botao variante="primario" icone={<Plus className="size-4" />}>
                Novo contrato
              </Botao>
            </Link>
          )
        }
      />
      <Cartao semPadding>
        <div className="flex gap-3 border-b border-borda p-4">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
            <Entrada className="pl-9" placeholder="Nº do contrato, código do imóvel, endereço ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Selecao className="w-44" aria-label="Situação" opcoes={SITUACOES_CONTRATO} vazio="Todas as situações" value={situacao} onChange={(e) => setSituacao(e.target.value)} />
          <Botao variante={vencendo ? 'primario' : 'secundario'} onClick={() => setVencendo((v) => !v)}>
            Vencendo em 60 dias
          </Botao>
        </div>
        <Tabela colunas={['Nº', 'Imóvel', 'Locatário', 'Proprietário(s)', 'Vigência', { t: 'Aluguel', cls: 'text-right' }, 'Situação']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/locacoes/${c.id}`)}>
              <td className="numeros font-medium">{c.numero}</td>
              <td>
                <div>{c.imovelEndereco}</div>
                <div className="text-xs text-texto-3">Imóvel {c.imovelCodigo}</div>
              </td>
              <td>{c.locatario}</td>
              <td className="text-texto-2">{c.locadores}</td>
              <td className="numeros whitespace-nowrap text-texto-2">
                {formatarData(c.dataInicio)} a {formatarData(c.dataFim)}
              </td>
              <td className="numeros text-right">
                {formatarMoeda(c.aluguelCentavos)}
                <div className="text-xs text-texto-3">vence dia {c.diaVencimento}</div>
              </td>
              <td>
                <div className="flex flex-col items-start gap-1">
                  <SeloContrato situacao={c.situacao} />
                  {c.emAtraso > 0 && <Selo tom="perigo">{c.emAtraso} em atraso</Selo>}
                </div>
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
    </>
  )
}
