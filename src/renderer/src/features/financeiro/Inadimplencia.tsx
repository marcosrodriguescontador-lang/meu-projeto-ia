import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import { adicionarDias, formatarData, hojeIso } from '@shared/financeiro/datas'
import { useSessao } from '@/app/sessao'
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Dialogo, Entrada, Indicador, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { rpc } from '@/lib/rpc'
import { DialogoTitulo, invalidarFinanceiro } from './comum'

export function Inadimplencia() {
  const { pode } = useSessao()
  const { data, isLoading } = useQuery({ queryKey: ['inadimplencia'], queryFn: () => rpc('titulos.inadimplencia') })
  const [sel, setSel] = useState<number[]>([])
  const [aberto, setAberto] = useState<number | null>(null)
  const [renegociar, setRenegociar] = useState(false)
  const selecionados = data?.filter((l) => sel.includes(l.tituloId)) ?? []
  const mesmoContrato = new Set(selecionados.map((l) => l.contratoId)).size === 1
  const total = (k: 'saldoCentavos' | 'totalCentavos') => data?.reduce((s, l) => s + l[k], 0) ?? 0
  return (
    <>
      <CabecalhoPagina
        titulo="Inadimplência"
        subtitulo="Títulos a receber vencidos, com multa e juros calculados até hoje."
        acoes={
          pode('financeiro.renegociar') && (
            <Botao variante="primario" disabled={!sel.length || !mesmoContrato} onClick={() => setRenegociar(true)} title={!mesmoContrato ? 'Selecione títulos do mesmo contrato' : undefined}>
              Renegociar selecionados ({sel.length})
            </Botao>
          )
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Indicador rotulo="Títulos vencidos" valor={data?.length ?? '—'} tom={data?.length ? 'perigo' : 'neutro'} />
        <Indicador rotulo="Saldo vencido" valor={formatarMoeda(total('saldoCentavos'))} tom="perigo" />
        <Indicador rotulo="Com multa e juros" valor={formatarMoeda(total('totalCentavos'))} />
      </div>
      <Cartao semPadding>
        <Tabela colunas={['', 'Devedor', 'Título', 'Vencimento', 'Atraso', { t: 'Saldo', cls: 'text-right' }, { t: 'Multa + juros', cls: 'text-right' }, { t: 'Total', cls: 'text-right' }]} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((l) => (
            <tr key={l.tituloId}>
              <td>
                <input type="checkbox" className="accent-[var(--destaque)]" checked={sel.includes(l.tituloId)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, l.tituloId] : s.filter((x) => x !== l.tituloId)))} />
              </td>
              <td className="font-medium">{l.pessoa}</td>
              <td className="cursor-pointer" onClick={() => setAberto(l.tituloId)}>
                <div className="underline decoration-dotted">{l.descricao}</div>
                {l.imovel && <div className="text-xs text-texto-3">{l.imovel}</div>}
              </td>
              <td className="numeros">{formatarData(l.vencimento)}</td>
              <td className="numeros text-perigo">{l.diasAtraso} dia(s)</td>
              <td className="numeros text-right">{formatarMoeda(l.saldoCentavos)}</td>
              <td className="numeros text-right">{formatarMoeda(l.multaCentavos + l.jurosCentavos)}</td>
              <td className="numeros text-right font-medium">{formatarMoeda(l.totalCentavos)}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {aberto !== null && <DialogoTitulo id={aberto} aoFechar={() => setAberto(null)} />}
      {renegociar && (
        <DialogoRenegociacao
          titulos={selecionados.map((l) => l.tituloId)}
          saldo={selecionados.reduce((s, l) => s + l.saldoCentavos, 0)}
          encargos={selecionados.reduce((s, l) => s + l.multaCentavos + l.jurosCentavos, 0)}
          aoFechar={(ok) => {
            setRenegociar(false)
            if (ok) setSel([])
          }}
        />
      )}
    </>
  )
}

function DialogoRenegociacao({ titulos, saldo, encargos, aoFechar }: { titulos: number[]; saldo: number; encargos: number; aoFechar: (ok: boolean) => void }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [parcelas, setParcelas] = useState('3')
  const [primeiro, setPrimeiro] = useState(adicionarDias(hojeIso(), 10))
  const [incluir, setIncluir] = useState(true)
  const [desconto, setDesconto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const total = saldo + (incluir ? encargos : 0)
  return (
    <Dialogo
      aberto
      titulo="Renegociação de débitos"
      aoFechar={() => aoFechar(false)}
      rodape={
        <>
          <Botao variante="fantasma" onClick={() => aoFechar(false)}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            disabled={motivo.trim().length < 5}
            onClick={async () => {
              setFalha(null)
              try {
                const r = await rpc('titulos.renegociar', { titulos, data: hojeIso(), incluirEncargos: incluir, descontoEncargos: desconto, parcelas: Number(parcelas), primeiroVencimento: primeiro, motivo })
                toast.sucesso(`Renegociação nº ${r.renegociacaoId}: ${r.titulos.length} parcela(s) geradas.`)
                invalidarFinanceiro(qc)
                aoFechar(true)
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Confirmar renegociação
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="numeros grid grid-cols-2 gap-1 rounded-md bg-superficie-2 p-3">
          <span className="text-texto-2">Saldo dos títulos</span>
          <span className="text-right">{formatarMoeda(saldo)}</span>
          <span className="text-texto-2">Multa e juros até hoje</span>
          <span className="text-right">{formatarMoeda(encargos)}</span>
          <span className="font-medium">Total a parcelar (antes do desconto)</span>
          <span className="text-right font-medium">{formatarMoeda(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Parcelas">{(i) => <Entrada id={i} type="number" min={1} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />}</Campo>
          <Campo rotulo="1º vencimento">{(i) => <Entrada id={i} type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />}</Campo>
        </div>
        {pode('financeiro.dispensar_encargos') && (
          <div className="grid grid-cols-2 items-end gap-3">
            <Caixa rotulo="Incluir multa e juros" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="pb-2" />
            <Campo rotulo="Desconto sobre os encargos">{(i) => <CampoMoeda id={i} disabled={!incluir} value={desconto} onChange={(e) => setDesconto(e.target.value)} />}</Campo>
          </div>
        )}
        <Aviso>Os títulos originais ficam como "renegociados". Cada parcela preserva a composição original (aluguel, condomínio, taxas), garantindo o repasse correto aos proprietários e terceiros.</Aviso>
        <Campo rotulo="Motivo / termos do acordo" obrigatorio>{(i) => <AreaTexto id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

export { formatarData }
