import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import { adicionarMeses, competenciaDe, formatarCompetencia, formatarData, hojeIso } from '@shared/financeiro/datas'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, CabecalhoPagina, Cartao, Entrada, Selo, Tabela, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { invalidarFinanceiro } from './comum'

export function Cobrancas() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [competencia, setCompetencia] = useState(adicionarMeses(competenciaDe(hojeIso()), -1))
  const [gerando, setGerando] = useState(false)
  const { data, isLoading, error } = useQuery({ queryKey: ['previa-cobrancas', competencia], queryFn: () => rpc('cobrancas.previa', { competencia }), enabled: /^\d{4}-\d{2}$/.test(competencia) })
  const aGerar = data?.filter((p) => p.situacao === 'GERAR') ?? []
  return (
    <>
      <CabecalhoPagina
        titulo="Cobranças do mês"
        subtitulo="Geração das cobranças de aluguel por competência (mês de uso). O aluguel vence no mês seguinte. Gerar novamente nunca duplica."
        acoes={
          pode('financeiro.gerar_cobrancas') && (
            <Botao
              variante="primario"
              icone={<Play className="size-4" />}
              disabled={!aGerar.length}
              carregando={gerando}
              onClick={async () => {
                setGerando(true)
                try {
                  const r = await rpc('cobrancas.gerar', { competencia })
                  toast.sucesso(`${r.geradas} cobrança(s) gerada(s) — ${formatarMoeda(r.valorCentavos)}.`)
                  invalidarFinanceiro(qc)
                } catch (e) {
                  toast.erro(e)
                } finally {
                  setGerando(false)
                }
              }}
            >
              Gerar {aGerar.length} cobrança(s)
            </Botao>
          )
        }
      />
      <Cartao semPadding>
        <div className="flex items-center gap-3 border-b border-borda p-4 text-sm">
          <span>Competência</span>
          <Entrada type="month" className="w-48" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          <span className="text-texto-2">{/^\d{4}-\d{2}$/.test(competencia) && formatarCompetencia(competencia)}</span>
          {aGerar.length > 0 && (
            <span className="numeros ml-auto">
              Total a gerar: <strong>{formatarMoeda(aGerar.reduce((s, p) => s + p.valorCentavos, 0))}</strong>
            </span>
          )}
        </div>
        {error && (
          <div className="p-4">
            <Aviso tom="perigo">{(error as Error).message}</Aviso>
          </div>
        )}
        <Tabela colunas={['Contrato', 'Locatário', 'Composição', 'Vencimento', { t: 'Valor', cls: 'text-right' }, 'Situação']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((p) => (
            <tr key={p.contratoId} className="align-top">
              <td className="numeros">nº {p.contratoNumero}</td>
              <td>{p.locatario}</td>
              <td className="text-xs text-texto-2">
                {p.itens.map((i, k) => (
                  <div key={k} className="numeros flex justify-between gap-4">
                    <span>{i.descricao}</span>
                    <span>{formatarMoeda(i.valorCentavos)}</span>
                  </div>
                ))}
                {p.motivo && <span className="text-alerta">{p.motivo}</span>}
              </td>
              <td className="numeros">{p.vencimento ? formatarData(p.vencimento) : '—'}</td>
              <td className="numeros text-right font-medium">{p.valorCentavos ? formatarMoeda(p.valorCentavos) : '—'}</td>
              <td>{p.situacao === 'GERAR' ? <Selo tom="alerta">A gerar</Selo> : p.situacao === 'JA_GERADA' ? <Selo tom="destaque">Gerada</Selo> : <Selo tom="perigo">Bloqueada</Selo>}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
    </>
  )
}
