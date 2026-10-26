import { useQuery } from '@tanstack/react-query'
import { Cartao, Tabela } from '@/components/ui'
import { dataHora } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { DiferencaAuditoria, rotuloAcao } from '@/features/auditoria/rotulos'

export function Historico({ pessoaId }: { pessoaId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['historico', pessoaId], queryFn: () => rpc('pessoas.historico', { id: pessoaId }) })
  return (
    <Cartao titulo="Histórico de alterações" semPadding>
      <Tabela colunas={['Data', 'Usuário', 'Operação', 'Detalhes']} vazio={data?.length === 0} carregando={isLoading}>
        {data
          ?.slice()
          .reverse()
          .map((r) => (
            <tr key={r.id} className="align-top">
              <td className="numeros whitespace-nowrap text-texto-2">{dataHora(r.ts)}</td>
              <td>{r.usuarioLogin}</td>
              <td className="whitespace-nowrap">{rotuloAcao(r.acao)}</td>
              <td className="text-texto-2">
                {r.descricao && <div>{r.descricao}</div>}
                <DiferencaAuditoria antes={r.antes} depois={r.depois} />
              </td>
            </tr>
          ))}
      </Tabela>
    </Cartao>
  )
}
