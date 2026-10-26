import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatarMoeda, paraPontosBase } from '@shared/dinheiro'
import type { ComissaoDto } from '@shared/dto-crm'
import { PAPEIS_RATEIO } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Abas, Aviso, Botao, CabecalhoPagina, Cartao, Dialogo, Entrada, Indicador, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { PainelComissao } from './comissao'

type Aba = 'comissoes' | 'beneficiarios'

export function Comissoes() {
  const { pode } = useSessao()
  const toast = useToast()
  const [aba, setAba] = useState<Aba>('comissoes')
  const [situacao, setSituacao] = useState<'ATIVA' | 'CANCELADA'>('ATIVA')
  const [aberta, setAberta] = useState<ComissaoDto | null>(null)
  const [modelo, setModelo] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['comissoes', situacao], queryFn: () => rpc('comissoes.listar', { situacao }) })
  const { data: porBenef } = useQuery({ queryKey: ['comissoes', 'beneficiarios'], queryFn: () => rpc('comissoes.porBeneficiario') })
  const soma = (k: 'valorCentavos' | 'recebidoCentavos') => (data ?? []).reduce((s, c) => s + c[k], 0)
  const exportar = async (formato: 'PDF' | 'XLSX') => {
    try {
      if (await rpc('relatorios.exportar', { codigo: 'comissoes', parametros: {}, formato })) toast.sucesso('Relatório exportado.')
    } catch (e) {
      toast.erro(e)
    }
  }
  useEffect(() => {
    if (aberta) setAberta(data?.find((c) => c.id === aberta.id) ?? null)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <CabecalhoPagina
        titulo="Comissões"
        subtitulo="Comissões de venda e de intermediação de locação. A parte dos corretores vira conta a pagar somente após o recebimento pela imobiliária."
        acoes={
          pode('comissoes.gerenciar') && (
            <Botao onClick={() => setModelo(true)}>Modelo padrão de rateio</Botao>
          )
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Indicador rotulo="Comissões ativas" valor={formatarMoeda(soma('valorCentavos'))} detalhe={`${data?.length ?? 0} comissão(ões)`} />
        <Indicador rotulo="Recebido pela imobiliária" valor={formatarMoeda(soma('recebidoCentavos'))} tom="destaque" />
        <Indicador rotulo="A receber" valor={formatarMoeda(soma('valorCentavos') - soma('recebidoCentavos'))} />
      </div>
      <Abas<Aba> abas={[['comissoes', 'Comissões'], ['beneficiarios', 'Por corretor']]} ativa={aba} aoMudar={setAba} />
      {aba === 'comissoes' && (
        <Cartao semPadding acoes={<Selecao aria-label="Situação" className="h-8 w-36" opcoes={{ ATIVA: 'Ativas', CANCELADA: 'Canceladas' }} value={situacao} onChange={(e) => setSituacao(e.target.value as 'ATIVA')} />} titulo="Comissões">
          <Tabela colunas={['Origem', 'Negócio', { t: 'Valor', cls: 'text-right' }, { t: 'Recebido', cls: 'text-right' }, 'Participantes', 'Situação']} vazio={data?.length === 0} carregando={isLoading}>
            {data?.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => setAberta(c)}>
                <td>
                  {c.origem === 'VENDA' ? 'Venda' : 'Locação'}
                  <div className="text-xs text-texto-3">{c.descricao}</div>
                </td>
                <td>
                  {c.negocioId ? (
                    <Link className="hover:underline" to={`/crm/negocios/${c.negocioId}`} onClick={(e) => e.stopPropagation()}>
                      Negócio nº {c.negocioId}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="numeros text-right">{formatarMoeda(c.valorCentavos)}</td>
                <td className="numeros text-right">{formatarMoeda(c.recebidoCentavos)}</td>
                <td className="text-texto-2">{c.rateio.filter((r) => r.beneficiario).map((r) => `${r.beneficiario} (${PAPEIS_RATEIO[r.papel as keyof typeof PAPEIS_RATEIO].toLowerCase()})`).join(', ') || 'Somente a imobiliária'}</td>
                <td>{c.situacao === 'CANCELADA' ? <Selo tom="perigo">Cancelada</Selo> : c.recebidoCentavos >= c.valorCentavos ? <Selo tom="destaque">Recebida</Selo> : c.recebidoCentavos > 0 ? <Selo tom="alerta">Parcial</Selo> : <Selo tom="alerta">A receber</Selo>}</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}
      {aba === 'beneficiarios' && (
        <Cartao
          semPadding
          titulo="Posição por corretor"
          acoes={
            <div className="flex gap-2">
              <Botao tamanho="sm" icone={<FileDown className="size-3.5" />} onClick={() => exportar('PDF')}>
                PDF
              </Botao>
              <Botao tamanho="sm" icone={<FileSpreadsheet className="size-3.5" />} onClick={() => exportar('XLSX')}>
                Excel
              </Botao>
            </div>
          }
        >
          <Tabela colunas={['Corretor / parceiro', { t: 'Comissões', cls: 'text-right' }, { t: 'Previsto', cls: 'text-right' }, { t: 'Liberado', cls: 'text-right' }, { t: 'Pago', cls: 'text-right' }, { t: 'A pagar', cls: 'text-right' }, { t: 'Aguardando recebimento', cls: 'text-right' }]} vazio={porBenef?.length === 0}>
            {porBenef?.map((b) => (
              <tr key={b.pessoaId}>
                <td className="font-medium">{b.nome}</td>
                <td className="numeros text-right">{b.comissoes}</td>
                <td className="numeros text-right">{formatarMoeda(b.previstoCentavos)}</td>
                <td className="numeros text-right">{formatarMoeda(b.liberadoCentavos)}</td>
                <td className="numeros text-right">{formatarMoeda(b.pagoCentavos)}</td>
                <td className="numeros text-right font-medium">{formatarMoeda(b.liberadoCentavos - b.pagoCentavos)}</td>
                <td className="numeros text-right text-texto-2">{formatarMoeda(b.previstoCentavos - b.liberadoCentavos)}</td>
              </tr>
            ))}
          </Tabela>
          <div className="border-t border-borda px-5 py-3 text-xs text-texto-3">
            Os valores liberados aparecem em{' '}
            <Link className="underline" to="/financeiro/pagar">
              Contas a pagar
            </Link>{' '}
            (origem “Comissão a pagar”), onde o pagamento é registrado.
          </div>
        </Cartao>
      )}
      {aberta && (
        <Dialogo aberto largura="max-w-3xl" titulo={`Comissão — ${aberta.descricao}`} aoFechar={() => setAberta(null)}>
          <PainelComissao comissao={aberta} />
        </Dialogo>
      )}
      {modelo && <DialogoModelo aoFechar={() => setModelo(false)} />}
    </>
  )
}

function DialogoModelo({ aoFechar }: { aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['rateio-padrao'], queryFn: () => rpc('comissoes.rateioPadrao') })
  const [itens, setItens] = useState<{ papel: string; percentual: string }[] | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const lista = itens ?? data?.itens.map((i) => ({ papel: i.papel, percentual: (i.percentualBp / 100).toLocaleString('pt-BR') })) ?? []
  const soma = lista.reduce((s, i) => s + (paraPontosBase(i.percentual) ?? 0), 0)
  return (
    <Dialogo
      aberto
      titulo="Modelo padrão de rateio"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={async () => {
              try {
                await rpc('comissoes.salvarRateioPadrao', { itens: lista.map((i) => ({ papel: i.papel as 'CAPTADOR', percentualBp: paraPontosBase(i.percentual) ?? 0 })) })
                toast.sucesso('Modelo salvo.')
                void qc.invalidateQueries({ queryKey: ['rateio-padrao'] })
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-texto-2">Sugerido em cada nova venda ou locação (o captador é o corretor do imóvel; o vendedor, o corretor do negócio). Pode ser ajustado em cada comissão.</p>
        {lista.map((i, k) => (
          <div key={i.papel} className="grid grid-cols-[1fr_7rem] items-center gap-2">
            <span>{PAPEIS_RATEIO[i.papel as keyof typeof PAPEIS_RATEIO]}</span>
            <Entrada aria-label={`Percentual ${i.papel}`} className="numeros text-right" value={i.percentual} onChange={(e) => setItens(lista.map((x, j) => (j === k ? { ...x, percentual: e.target.value } : x)))} />
          </div>
        ))}
        <div className={soma === 10_000 ? 'text-xs text-texto-3' : 'text-xs font-medium text-perigo'}>Soma: {(soma / 100).toLocaleString('pt-BR')}%</div>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}
