import { useQuery } from '@tanstack/react-query'
import { Cartao, Tabela } from '@/components/ui'
import { DiferencaAuditoria, rotuloAcao } from '@/features/auditoria/rotulos'
import { dataHora } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { SeloSituacao } from './comum'

export function HistoricoImovel({ imovelId }: { imovelId: number }) {
  const { data: situacoes } = useQuery({ queryKey: ['historico-situacao', imovelId], queryFn: () => rpc('imoveis.historicoSituacao', { id: imovelId }) })
  const { data: auditoria, isLoading } = useQuery({ queryKey: ['historico-imovel', imovelId], queryFn: () => rpc('imoveis.historico', { id: imovelId }) })
  return (
    <div className="space-y-6">
      <Cartao titulo="Disponibilidade" semPadding>
        <Tabela colunas={['Data', 'Modalidade', 'De', 'Para', 'Motivo', 'Usuário']} vazio={situacoes?.length === 0}>
          {situacoes?.map((h) => (
            <tr key={h.id}>
              <td className="numeros whitespace-nowrap text-texto-2">{dataHora(h.ts)}</td>
              <td>{h.modalidade === 'VENDA' ? 'Venda' : 'Locação'}</td>
              <td>{h.de ? <SeloSituacao situacao={h.de} /> : <span className="text-texto-3">—</span>}</td>
              <td>
                <SeloSituacao situacao={h.para} />
              </td>
              <td className="text-texto-2">{h.motivo}</td>
              <td className="text-texto-2">{h.usuario ?? 'sistema'}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Cartao titulo="Alterações do cadastro" semPadding>
        <Tabela colunas={['Data', 'Usuário', 'Operação', 'Detalhes']} vazio={auditoria?.length === 0} carregando={isLoading}>
          {auditoria
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
    </div>
  )
}
