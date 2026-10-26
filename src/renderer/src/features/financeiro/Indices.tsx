import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { adicionarMeses, competenciaDe, formatarCompetencia, formatarData, hojeIso } from '@shared/financeiro/datas'
import { feriadosNacionais } from '@shared/financeiro/calendario'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, CabecalhoPagina, Cartao, Entrada, Selecao, Tabela, useToast } from '@/components/ui'
import { CampoSufixo } from '@/features/imoveis/comum'
import { rpc } from '@/lib/rpc'

export function Indices() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: indices } = useQuery({ queryKey: ['indices'], queryFn: () => rpc('indices.listar') })
  const { data: feriados } = useQuery({ queryKey: ['feriados'], queryFn: () => rpc('feriados.listar') })
  const [indice, setIndice] = useState('')
  const [comp, setComp] = useState(adicionarMeses(competenciaDe(hojeIso()), -1))
  const [variacao, setVariacao] = useState('')
  const [fData, setFData] = useState('')
  const [fDesc, setFDesc] = useState('')
  const sel = indices?.find((i) => String(i.id) === indice) ?? indices?.[0]
  const ano = new Date().getFullYear()
  const editar = pode('indices.gerenciar')
  return (
    <>
      <CabecalhoPagina titulo="Índices e feriados" subtitulo="Os índices de reajuste são informados manualmente (o sistema funciona offline). Feriados locais afetam os vencimentos." />
      <div className="grid grid-cols-3 gap-6">
        <Cartao titulo="Índices econômicos (variação mensal)" className="col-span-2" semPadding>
          <div className="flex items-end gap-3 border-b border-borda p-4">
            <Selecao className="w-40" aria-label="Índice" opcoes={(indices ?? []).map((i) => [String(i.id), i.sigla] as [string, string])} value={String(sel?.id ?? '')} onChange={(e) => setIndice(e.target.value)} />
            {editar && (
              <>
                <Entrada type="month" className="w-44" aria-label="Competência" value={comp} onChange={(e) => setComp(e.target.value)} />
                <div className="w-36">
                  <CampoSufixo sufixo="%" aria-label="Variação" placeholder="0,4500" value={variacao} onChange={(e) => setVariacao(e.target.value)} />
                </div>
                <Botao
                  variante="primario"
                  disabled={!sel || !variacao}
                  onClick={async () => {
                    try {
                      await rpc('indices.salvarValor', { indiceId: sel!.id, competencia: comp, variacao })
                      toast.sucesso(`${sel!.sigla} ${formatarCompetencia(comp)} registrado.`)
                      setVariacao('')
                      setComp(adicionarMeses(comp, 1))
                      void qc.invalidateQueries({ queryKey: ['indices'] })
                      void qc.invalidateQueries({ queryKey: ['reajustes'] })
                    } catch (e) {
                      toast.erro(e)
                    }
                  }}
                >
                  Registrar
                </Botao>
              </>
            )}
          </div>
          <div className="px-4 pt-3 text-xs text-texto-2">{sel?.nome}. Informe a variação mensal divulgada (ex.: 0,45 para 0,45%; negativos com sinal de menos).</div>
          <Tabela colunas={['Competência', { t: 'Variação', cls: 'text-right' }]} vazio={sel?.valores.length === 0}>
            {sel?.valores.slice(0, 36).map((v) => (
              <tr key={v.competencia}>
                <td>{formatarCompetencia(v.competencia)}</td>
                <td className={`numeros text-right ${v.variacaoPpm < 0 ? 'text-perigo' : ''}`}>{(v.variacaoPpm / 10_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
        <Cartao titulo="Feriados locais" semPadding>
          {editar && (
            <div className="space-y-2 border-b border-borda p-4">
              <Entrada type="date" aria-label="Data do feriado" value={fData} onChange={(e) => setFData(e.target.value)} />
              <Entrada placeholder="Descrição (ex.: Aniversário da cidade)" value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
              <Botao
                className="w-full"
                disabled={!fData || !fDesc}
                onClick={async () => {
                  try {
                    await rpc('feriados.salvar', { data: fData, descricao: fDesc, abrangencia: 'MUNICIPAL' })
                    setFData('')
                    setFDesc('')
                    void qc.invalidateQueries({ queryKey: ['feriados'] })
                  } catch (e) {
                    toast.erro(e)
                  }
                }}
              >
                Adicionar feriado
              </Botao>
            </div>
          )}
          <Tabela colunas={['Data', 'Descrição', '']} vazio={feriados?.length === 0}>
            {feriados?.map((f) => (
              <tr key={f.id}>
                <td className="numeros">{formatarData(f.data)}</td>
                <td>{f.descricao}</td>
                <td>
                  {editar && (
                    <button
                      type="button"
                      className="text-texto-3 hover:text-perigo"
                      onClick={async () => {
                        await rpc('feriados.remover', { id: f.id })
                        void qc.invalidateQueries({ queryKey: ['feriados'] })
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
          <div className="p-4">
            <Aviso>
              Feriados nacionais, Carnaval, Sexta-feira Santa e Corpus Christi são calculados automaticamente ({ano}: {[...feriadosNacionais(ano).keys()].length} datas).
            </Aviso>
          </div>
        </Cartao>
      </div>
    </>
  )
}
