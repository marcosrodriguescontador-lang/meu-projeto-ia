import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatarMoeda } from '@shared/dinheiro'
import { formatarCompetencia, formatarData } from '@shared/financeiro/datas'
import { useSessao } from '@/app/sessao'
import { Botao, CabecalhoPagina, Cartao, Confirmacao, Selo, Tabela, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'

export function Reajustes() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['reajustes'], queryFn: () => rpc('reajustes.pendentes', {}) })
  const [dispensar, setDispensar] = useState<number | null>(null)
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ['reajustes'] })
    void qc.invalidateQueries({ queryKey: ['previa-cobrancas'] })
    void qc.invalidateQueries({ queryKey: ['contrato'] })
  }
  return (
    <>
      <CabecalhoPagina titulo="Reajustes" subtitulo="Aniversários de contrato nos próximos 45 dias e pendentes. Nenhum reajuste é aplicado sem confirmação." />
      <Cartao semPadding>
        <Tabela colunas={['Contrato', 'Locatário', 'Data base', 'Índice (12 meses)', { t: 'Aluguel atual', cls: 'text-right' }, { t: 'Novo aluguel', cls: 'text-right' }, '']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((r) => (
            <tr key={r.contratoId} className="align-top">
              <td>
                <Link className="underline" to={`/locacoes/${r.contratoId}`}>
                  nº {r.contratoNumero}
                </Link>
                <div className="text-xs text-texto-3">{r.imovel}</div>
              </td>
              <td>{r.locatario}</td>
              <td className="numeros">{formatarData(r.dataBase)}</td>
              <td className="numeros">
                {r.indiceSigla}{' '}
                {r.acumuladoPpm != null ? (
                  <>
                    {(r.acumuladoPpm / 10_000).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%
                    {r.aplicadoPpm === 0 && r.acumuladoPpm < 0 && <div className="text-xs text-texto-3">negativo: valor mantido</div>}
                  </>
                ) : (
                  <Selo tom="alerta">Faltam {r.faltantes.length} mês(es)</Selo>
                )}
                {r.faltantes.length > 0 && <div className="text-xs text-texto-3">{r.faltantes.map(formatarCompetencia).join(', ')}</div>}
              </td>
              <td className="numeros text-right">{formatarMoeda(r.valorAtualCentavos)}</td>
              <td className="numeros text-right font-medium">{r.novoValorCentavos != null ? formatarMoeda(r.novoValorCentavos) : '—'}</td>
              <td className="text-right whitespace-nowrap">
                {pode('locacoes.reajustar') && (
                  <>
                    <Botao
                      tamanho="sm"
                      variante="primario"
                      disabled={r.novoValorCentavos == null}
                      onClick={async () => {
                        try {
                          await rpc('reajustes.aplicar', { contratoId: r.contratoId })
                          toast.sucesso(`Contrato nº ${r.contratoNumero} reajustado.`)
                          atualizar()
                        } catch (e) {
                          toast.erro(e)
                        }
                      }}
                    >
                      Aplicar
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setDispensar(r.contratoId)}>
                      Dispensar
                    </Botao>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Confirmacao
        aberto={dispensar !== null}
        titulo="Dispensar reajuste"
        exigirMotivo
        textoConfirmar="Dispensar"
        mensagem="O aluguel permanece igual e o próximo reajuste passa para o aniversário seguinte."
        aoFechar={() => setDispensar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('reajustes.dispensar', { contratoId: dispensar!, motivo })
          atualizar()
        }}
      />
    </>
  )
}
