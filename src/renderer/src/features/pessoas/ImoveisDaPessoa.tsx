import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { formatarPercentual } from '@shared/dinheiro'
import { Cartao, Tabela } from '@/components/ui'
import { SeloSituacao } from '@/features/imoveis/comum'
import { rotuloTipo } from '@/features/imoveis/ListaImoveis'
import { rpc } from '@/lib/rpc'

export function ImoveisDaPessoa({ pessoaId }: { pessoaId: number }) {
  const nav = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['imoveis-pessoa', pessoaId], queryFn: () => rpc('pessoas.imoveis', { id: pessoaId }) })
  return (
    <Cartao titulo="Imóveis de que é proprietário(a)" semPadding>
      <Tabela colunas={['Cód.', 'Imóvel', 'Endereço', 'Participação', 'Venda', 'Locação']} vazio={data?.length === 0} carregando={isLoading}>
        {data?.map((i) => (
          <tr key={i.id} className="cursor-pointer" onClick={() => nav(`/imoveis/${i.id}`)}>
            <td className="numeros text-texto-2">{i.codigo}</td>
            <td>{rotuloTipo(i.tipo)}</td>
            <td>{i.endereco}</td>
            <td className="numeros">{formatarPercentual(i.percentualBp)}</td>
            <td>{i.venda ? <SeloSituacao situacao={i.venda} /> : '—'}</td>
            <td>{i.locacao ? <SeloSituacao situacao={i.locacao} /> : '—'}</td>
          </tr>
        ))}
      </Tabela>
    </Cartao>
  )
}
