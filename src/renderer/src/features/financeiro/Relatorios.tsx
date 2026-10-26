import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { competenciaDe, hojeIso, primeiroDia, ultimoDia } from '@shared/financeiro/datas'
import { formatarCelula, RELATORIOS, type CodigoRelatorio, type ParametrosRelatorio } from '@shared/relatorios'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, CabecalhoPagina, Campo, Cartao, cx, Entrada, Selecao, useToast } from '@/components/ui'
import { SeletorPessoa } from '@/features/pessoas/BuscaPessoa'
import { rpc } from '@/lib/rpc'

type Param = 'periodo' | 'ano' | 'regime' | 'situacao' | 'pessoa' | 'titularidade'

const GRUPOS: { titulo: string; itens: [CodigoRelatorio, Param[]][] }[] = [
  { titulo: 'Contas', itens: [['receber', ['periodo', 'situacao']], ['pagar', ['periodo', 'situacao']], ['inadimplencia', []]] },
  { titulo: 'Resultado da imobiliária', itens: [['receitas', ['periodo']], ['despesas', ['periodo']], ['resultado', ['ano', 'regime']], ['rentabilidade', ['periodo']], ['fluxo', ['titularidade']]] },
  { titulo: 'Recursos de terceiros', itens: [['repassar', []], ['terceiros', []], ['extratoProprietario', ['pessoa', 'periodo']]] },
  { titulo: 'Comercial', itens: [['comissoes', []]] },
  { titulo: 'Obrigações acessórias', itens: [['dimob', ['ano']]] }
]
const PARAMS = Object.fromEntries(GRUPOS.flatMap((g) => g.itens)) as Record<CodigoRelatorio, Param[]>

/** Central de relatórios: escolha, parâmetros, prévia na tela e exportação em PDF ou Excel. */
export function Relatorios() {
  const { pode } = useSessao()
  const toast = useToast()
  const hoje = hojeIso()
  const [codigo, setCodigo] = useState<CodigoRelatorio>('resultado')
  const [p, setP] = useState({ de: primeiroDia(competenciaDe(hoje)), ate: ultimoDia(competenciaDe(hoje)), ano: String(Number(hoje.slice(0, 4))), regime: 'CAIXA', situacao: 'EM_ABERTO', titularidade: 'PROPRIO' })
  const [pessoa, setPessoa] = useState<{ id: number; nome: string } | null>(null)
  const [exportando, setExportando] = useState<'PDF' | 'XLSX' | null>(null)
  const usa = PARAMS[codigo]
  const parametros: ParametrosRelatorio = {
    ...(usa.includes('periodo') && { de: p.de, ate: p.ate }),
    ...(usa.includes('ano') && { ano: Number(p.ano) }),
    ...(usa.includes('regime') && { regime: p.regime as 'CAIXA' }),
    ...(usa.includes('situacao') && { situacao: p.situacao as 'EM_ABERTO' }),
    ...(usa.includes('titularidade') && { titularidade: p.titularidade as 'PROPRIO' }),
    ...(usa.includes('pessoa') && pessoa && { pessoaId: pessoa.id })
  }
  const pronto = !usa.includes('pessoa') || !!pessoa
  const { data, error, isFetching } = useQuery({ queryKey: ['relatorio', codigo, parametros], queryFn: () => rpc('relatorios.gerar', { codigo, parametros }), enabled: pronto, placeholderData: keepPreviousData, retry: false })
  const exportar = async (formato: 'PDF' | 'XLSX') => {
    setExportando(formato)
    try {
      if (await rpc('relatorios.exportar', { codigo, parametros, formato })) toast.sucesso('Relatório exportado.')
    } catch (e) {
      toast.erro(e)
    } finally {
      setExportando(null)
    }
  }
  const relatorio = data?.codigo === codigo ? data : null
  const set = (x: Partial<typeof p>) => setP((v) => ({ ...v, ...x }))
  return (
    <>
      <CabecalhoPagina titulo="Relatórios" subtitulo="Calculados a partir do razão e dos títulos. A prévia é exatamente o que vai para o PDF e para o Excel." />
      <div className="grid grid-cols-[15rem_1fr] gap-4">
        <nav aria-label="Relatórios" className="space-y-4">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <div className="mb-1 px-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">{g.titulo}</div>
              {g.itens
                .filter(([c]) => (c !== 'dimob' || pode('pessoas.ver')) && (c !== 'comissoes' || pode('comissoes.ver')))
                .map(([c]) => (
                  <button key={c} type="button" onClick={() => setCodigo(c)} aria-current={c === codigo ? 'page' : undefined} className={cx('block w-full rounded-md px-2 py-1.5 text-left text-sm', c === codigo ? 'bg-superficie font-medium text-texto shadow-sm' : 'text-texto-2 hover:bg-superficie-2')}>
                    {RELATORIOS[c]}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <Cartao>
            <div className="flex flex-wrap items-end gap-3">
              {usa.includes('pessoa') && (
                <div className="w-72">
                  <div className="mb-1 text-xs font-medium text-texto-2">Proprietário</div>
                  <SeletorPessoa valor={pessoa} aoMudar={setPessoa} />
                </div>
              )}
              {usa.includes('periodo') && (
                <>
                  <Campo rotulo="De">{(i) => <Entrada id={i} type="date" value={p.de} onChange={(e) => set({ de: e.target.value })} />}</Campo>
                  <Campo rotulo="Até">{(i) => <Entrada id={i} type="date" value={p.ate} onChange={(e) => set({ ate: e.target.value })} />}</Campo>
                </>
              )}
              {usa.includes('ano') && <Campo rotulo="Ano">{(i) => <Entrada id={i} type="number" className="w-28" min={2000} max={2100} value={p.ano} onChange={(e) => set({ ano: e.target.value })} />}</Campo>}
              {usa.includes('regime') && <Campo rotulo="Regime">{(i) => <Selecao id={i} opcoes={{ CAIXA: 'Caixa (data do pagamento)', COMPETENCIA: 'Competência (mês de referência)' }} value={p.regime} onChange={(e) => set({ regime: e.target.value })} />}</Campo>}
              {usa.includes('situacao') && <Campo rotulo="Situação">{(i) => <Selecao id={i} opcoes={{ EM_ABERTO: 'Em aberto', TODOS: 'Todos' }} value={p.situacao} onChange={(e) => set({ situacao: e.target.value })} />}</Campo>}
              {usa.includes('titularidade') && <Campo rotulo="Contas">{(i) => <Selecao id={i} opcoes={{ PROPRIO: 'Próprias', TERCEIROS: 'De terceiros', TODAS: 'Todas' }} value={p.titularidade} onChange={(e) => set({ titularidade: e.target.value })} />}</Campo>}
              <div className="ml-auto flex gap-2">
                <Botao icone={<FileDown className="size-4" />} disabled={!relatorio} carregando={exportando === 'PDF'} onClick={() => exportar('PDF')}>
                  PDF
                </Botao>
                <Botao icone={<FileSpreadsheet className="size-4" />} disabled={!relatorio} carregando={exportando === 'XLSX'} onClick={() => exportar('XLSX')}>
                  Excel
                </Botao>
              </div>
            </div>
          </Cartao>
          {!pronto && <Aviso>Selecione o proprietário para gerar o extrato.</Aviso>}
          {error && <Aviso tom="perigo">{error instanceof Error ? error.message : String(error)}</Aviso>}
          {relatorio && (
            <Cartao semPadding titulo={relatorio.titulo} className={cx('transition-opacity', isFetching && 'opacity-60')}>
              <div className="border-b border-borda px-5 py-2 text-xs text-texto-2">{relatorio.subtitulo}</div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-superficie-2 text-xs text-texto-2">
                    <tr>
                      {relatorio.colunas.map((c) => (
                        <th key={c.chave} className={cx('px-3 py-2 font-medium whitespace-nowrap', ['moeda', 'numero', 'percentual'].includes(c.tipo) ? 'text-right' : 'text-left')}>
                          {c.rotulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.linhas.length === 0 && (
                      <tr>
                        <td colSpan={relatorio.colunas.length} className="px-3 py-8 text-center text-texto-3">
                          Nenhum registro no período.
                        </td>
                      </tr>
                    )}
                    {relatorio.linhas.map((l, i) => (
                      <tr key={i} className={cx('border-t border-borda', l.destaque === 'total' && 'bg-superficie-2 font-semibold', l.destaque === 'subtotal' && 'font-medium')}>
                        {relatorio.colunas.map((c) => (
                          <td key={c.chave} className={cx('px-3 py-1.5', ['moeda', 'numero', 'percentual'].includes(c.tipo) ? 'numeros text-right whitespace-nowrap' : (c.largura ?? 0) <= 42 && 'whitespace-nowrap', c.tipo === 'moeda' && Number(l[c.chave]) < 0 && 'text-perigo')}>
                            {formatarCelula(c, l[c.chave])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {relatorio.totais && (
                    <tfoot className="sticky bottom-0 border-t-2 border-borda bg-superficie font-semibold">
                      <tr>
                        {relatorio.colunas.map((c) => (
                          <td key={c.chave} className={cx('px-3 py-2', ['moeda', 'numero', 'percentual'].includes(c.tipo) && 'numeros text-right whitespace-nowrap')}>
                            {relatorio.totais![c.chave] != null ? (typeof relatorio.totais![c.chave] === 'string' ? relatorio.totais![c.chave] : formatarCelula(c, relatorio.totais![c.chave])) : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {relatorio.observacoes?.length ? (
                <div className="space-y-1 border-t border-borda px-5 py-3 text-xs text-texto-2">
                  {relatorio.observacoes.map((o) => (
                    <p key={o}>{o}</p>
                  ))}
                </div>
              ) : null}
            </Cartao>
          )}
        </div>
      </div>
    </>
  )
}
