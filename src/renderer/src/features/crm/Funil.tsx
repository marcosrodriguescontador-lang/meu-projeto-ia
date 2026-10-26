import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatarMoeda } from '@shared/dinheiro'
import type { NegocioCartao } from '@shared/dto-crm'
import { ETAPAS, MOTIVOS_PERDA, SEQUENCIA_ETAPAS, type Etapa } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Abas, Aviso, Botao, CabecalhoPagina, Caixa, Campo, cx, Dialogo, Entrada, Selecao, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { invalidarCrm, quando, useCorretores } from './comum'
import { DialogoNovoNegocio } from './NovoNegocio'


/** Funis de venda e de locação: arraste o cartão para mudar de etapa. */
export function Funil() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()
  const { data: corretores } = useCorretores()
  const [tipo, setTipo] = useState<'VENDA' | 'LOCACAO'>('VENDA')
  const [f, setF] = useState({ busca: '', corretorId: '' })
  const [novo, setNovo] = useState(false)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [sobre, setSobre] = useState<Etapa | null>(null)
  const [perda, setPerda] = useState<NegocioCartao | null>(null)
  const [verPerdidos, setVerPerdidos] = useState(false)
  const colunas: Etapa[] = verPerdidos ? [...SEQUENCIA_ETAPAS, 'PERDIDO'] : SEQUENCIA_ETAPAS
  const entrada = { tipo, busca: f.busca || undefined, corretorId: f.corretorId ? Number(f.corretorId) : undefined }
  const { data } = useQuery({ queryKey: ['negocios', 'funil', entrada], queryFn: () => rpc('negocios.listar', entrada), placeholderData: keepPreviousData })
  const mover = async (n: NegocioCartao, etapa: Etapa) => {
    if (n.etapa === etapa) return
    if (etapa === 'PERDIDO') return setPerda(n)
    try {
      await rpc('negocios.mover', { negocioId: n.id, etapa })
      invalidarCrm(qc)
    } catch (e) {
      toast.erro(e)
    }
  }
  return (
    <>
      <CabecalhoPagina
        titulo="Funil de negócios"
        subtitulo="Arraste os cartões entre as etapas (ou solte em “Perdido”, exibida pela opção ao lado). Contrato e conclusão acompanham a venda registrada ou o contrato de locação."
        acoes={
          pode('crm.gerenciar') && (
            <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
              Novo negócio
            </Botao>
          )
        }
      />
      <div className="flex items-end justify-between gap-3">
        <Abas<'VENDA' | 'LOCACAO'> abas={[['VENDA', 'Vendas'], ['LOCACAO', 'Locações']]} ativa={tipo} aoMudar={setTipo} />
        <div className="mb-4 flex gap-3">
          <div className="relative w-72">
            <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
            <Entrada className="pl-9" placeholder="Cliente, título ou código do imóvel" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} />
          </div>
          <Caixa rotulo="Mostrar perdidos" checked={verPerdidos} onChange={(e) => setVerPerdidos(e.target.checked)} className="self-center whitespace-nowrap" />
          {pode('crm.carteira_toda') && <Selecao aria-label="Corretor" className="w-52" opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="Todos os corretores" value={f.corretorId} onChange={(e) => setF({ ...f, corretorId: e.target.value })} />}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label={`Funil de ${tipo === 'VENDA' ? 'vendas' : 'locações'}`}>
        {colunas.map((etapa) => {
          const cartoes = (data ?? []).filter((n) => n.etapa === etapa)
          const total = cartoes.reduce((s, n) => s + (n.valorEstimadoCentavos ?? 0), 0)
          return (
            <section
              key={etapa}
              aria-label={ETAPAS[etapa]}
              className={cx('flex min-w-36 flex-1 flex-col rounded-lg border border-borda bg-superficie-2 transition', sobre === etapa && 'border-destaque bg-destaque-suave/40', etapa === 'PERDIDO' && 'opacity-80')}
              onDragOver={(e) => {
                if (arrastando === null || !pode('crm.gerenciar')) return
                e.preventDefault()
                setSobre(etapa)
              }}
              onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
              onDrop={(e) => {
                e.preventDefault()
                setSobre(null)
                const n = data?.find((x) => x.id === arrastando)
                setArrastando(null)
                if (n) void mover(n, etapa)
              }}
            >
              <header className="flex items-baseline justify-between px-3 pt-3 pb-2">
                <h2 className="text-xs font-semibold tracking-wide text-texto-2 uppercase">{ETAPAS[etapa]}</h2>
                <span className="numeros text-xs text-texto-3">{cartoes.length}</span>
              </header>
              {total > 0 && <div className="numeros -mt-1 px-3 pb-2 text-xs text-texto-3">{formatarMoeda(total)}</div>}
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {cartoes.map((n) => (
                  <article
                    key={n.id}
                    role="listitem"
                    draggable={pode('crm.gerenciar')}
                    onDragStart={(e) => {
                      setArrastando(n.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => (setArrastando(null), setSobre(null))}
                    onClick={() => navegar(`/crm/negocios/${n.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navegar(`/crm/negocios/${n.id}`)}
                    tabIndex={0}
                    className={cx('cursor-pointer rounded-md border border-borda bg-superficie p-2.5 text-sm shadow-sm hover:border-texto-3', arrastando === n.id && 'opacity-50')}
                  >
                    <div className="font-medium break-words">{n.titulo}</div>
                    <div className="text-xs text-texto-2">{n.cliente}</div>
                    {n.imovel && <div className="mt-1 truncate text-xs text-texto-3">{n.imovel}</div>}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="numeros font-medium">{n.valorEstimadoCentavos ? formatarMoeda(n.valorEstimadoCentavos) : ''}</span>
                      <span className="text-texto-3">{n.diasNaEtapa} d</span>
                    </div>
                    {n.proximaAtividade && (
                      <div className={cx('mt-1.5 flex items-center gap-1 text-xs', n.atrasada ? 'text-perigo' : 'text-texto-2')}>
                        <Clock className="size-3" /> {quando(n.proximaAtividade.agendadaPara)} · {n.proximaAtividade.titulo}
                      </div>
                    )}
                    {n.corretor && <div className="mt-1 text-[11px] text-texto-3">{n.corretor}</div>}
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      {novo && <DialogoNovoNegocio tipoInicial={tipo} aoFechar={() => setNovo(false)} />}
      {perda && <DialogoPerda negocio={perda} aoFechar={() => setPerda(null)} />}
    </>
  )
}

export function DialogoPerda({ negocio, aoFechar }: { negocio: { id: number; titulo: string }; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo={`Negócio perdido — ${negocio.titulo}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            disabled={!motivo}
            onClick={async () => {
              try {
                await rpc('negocios.mover', { negocioId: negocio.id, etapa: 'PERDIDO', motivoPerda: motivo, observacao: obs })
                toast.sucesso('Negócio marcado como perdido.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Marcar como perdido
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Campo rotulo="Motivo da perda">{(i) => <Selecao id={i} opcoes={MOTIVOS_PERDA.map((m) => [m, m] as [string, string])} vazio="Selecione" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
        <Campo rotulo="Observação">{(i) => <Entrada id={i} value={obs} onChange={(e) => setObs(e.target.value)} />}</Campo>
        <p className="text-xs text-texto-3">O motivo entra nos indicadores de conversão. O negócio pode ser reaberto depois.</p>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}
