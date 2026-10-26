import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FotoDto } from '@shared/dto'
import { Botao, Cartao, Confirmacao, Entrada, useToast, cx } from '@/components/ui'
import { rpc } from '@/lib/rpc'

export function Galeria({ imovelId, editavel }: { imovelId: number; editavel: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const chave = ['fotos', imovelId]
  const { data: fotos, isLoading } = useQuery({ queryKey: chave, queryFn: () => rpc('imoveis.fotos.listar', { imovelId }) })
  const [enviando, setEnviando] = useState(false)
  const [aberta, setAberta] = useState<number | null>(null)
  const [remover, setRemover] = useState<FotoDto | null>(null)
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: chave })
    void qc.invalidateQueries({ queryKey: ['imoveis'] })
  }
  const acao = async (f: () => Promise<unknown>) => {
    try {
      await f()
      atualizar()
    } catch (e) {
      toast.erro(e)
    }
  }
  const mover = (i: number, d: -1 | 1) => {
    if (!fotos) return
    const ids = fotos.map((f) => f.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    void acao(() => rpc('imoveis.fotos.reordenar', { imovelId, ids }))
  }

  return (
    <Cartao
      titulo={`Fotos (${fotos?.length ?? 0})`}
      acoes={
        editavel && (
          <Botao
            tamanho="sm"
            variante="primario"
            icone={<ImagePlus className="size-3.5" />}
            carregando={enviando}
            onClick={async () => {
              setEnviando(true)
              try {
                qc.setQueryData(chave, await rpc('imoveis.fotos.adicionar', { imovelId }))
                void qc.invalidateQueries({ queryKey: ['imoveis'] })
              } catch (e) {
                toast.erro(e)
              } finally {
                setEnviando(false)
              }
            }}
          >
            Adicionar fotos…
          </Botao>
        )
      }
    >
      {isLoading && <Loader2 className="mx-auto size-5 animate-spin text-texto-3" />}
      {fotos?.length === 0 && <div className="py-10 text-center text-sm text-texto-3">Nenhuma foto. JPG, PNG ou WEBP até 20 MB; até 60 fotos por imóvel.</div>}
      <div className="grid grid-cols-4 gap-4">
        {fotos?.map((f, i) => (
          <figure key={f.id} className={cx('group overflow-hidden rounded-lg border bg-superficie-2', f.capa ? 'border-marca ring-1 ring-marca' : 'border-borda')}>
            <button type="button" className="relative block w-full" onClick={() => setAberta(i)}>
              <img src={f.miniatura} alt={f.legenda ?? f.nome} className="h-40 w-full object-cover" draggable={false} />
              {f.capa && <span className="absolute top-2 left-2 rounded bg-marca px-1.5 py-0.5 text-[10px] font-medium text-marca-texto">CAPA</span>}
            </button>
            <figcaption className="space-y-2 p-2">
              {editavel ? (
                <Entrada
                  className="h-8 text-xs"
                  placeholder="Legenda"
                  defaultValue={f.legenda ?? ''}
                  onBlur={(e) => e.target.value !== (f.legenda ?? '') && void acao(() => rpc('imoveis.fotos.legenda', { id: f.id, legenda: e.target.value }))}
                />
              ) : (
                <div className="truncate text-xs text-texto-2">{f.legenda ?? f.nome}</div>
              )}
              {editavel && (
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <Botao tamanho="sm" variante="fantasma" disabled={i === 0} onClick={() => mover(i, -1)} icone={<ChevronLeft className="size-3.5" />} title="Mover para a esquerda" />
                    <Botao tamanho="sm" variante="fantasma" disabled={i === fotos.length - 1} onClick={() => mover(i, 1)} icone={<ChevronRight className="size-3.5" />} title="Mover para a direita" />
                  </div>
                  <div className="flex">
                    {!f.capa && <Botao tamanho="sm" variante="fantasma" onClick={() => acao(() => rpc('imoveis.fotos.capa', { id: f.id }))} icone={<Star className="size-3.5" />} title="Definir como capa" />}
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setRemover(f)} icone={<Trash2 className="size-3.5" />} title="Remover" />
                  </div>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {aberta !== null && fotos && <Visualizador fotos={fotos} inicial={aberta} aoFechar={() => setAberta(null)} />}
      <Confirmacao
        aberto={!!remover}
        titulo="Remover foto"
        perigo
        exigirMotivo
        textoConfirmar="Remover"
        mensagem="A foto sai da galeria; o arquivo original é preservado para auditoria."
        aoFechar={() => setRemover(null)}
        aoConfirmar={async (motivo) => {
          await rpc('imoveis.fotos.remover', { id: remover!.id, motivo })
          atualizar()
        }}
      />
    </Cartao>
  )
}

function Visualizador({ fotos, inicial, aoFechar }: { fotos: FotoDto[]; inicial: number; aoFechar: () => void }) {
  const [i, setI] = useState(inicial)
  const foto = fotos[i]!
  const { data } = useQuery({ queryKey: ['foto', foto.id], queryFn: () => rpc('imoveis.fotos.ver', { id: foto.id }), staleTime: 60_000 })
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      if (e.key === 'ArrowRight') setI((x) => Math.min(fotos.length - 1, x + 1))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fotos.length, aoFechar])
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" onClick={aoFechar}>
      <div className="flex items-center justify-between p-4 text-sm">
        <span>
          {i + 1} / {fotos.length} {foto.legenda && `— ${foto.legenda}`}
        </span>
        <button type="button" aria-label="Fechar">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-between gap-4 px-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-20">
          <ChevronLeft className="size-8" />
        </button>
        <img src={data ?? foto.miniatura} alt={foto.legenda ?? foto.nome} className="max-h-[80vh] max-w-full object-contain" />
        <button type="button" disabled={i === fotos.length - 1} onClick={() => setI(i + 1)} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-20">
          <ChevronRight className="size-8" />
        </button>
      </div>
    </div>
  )
}
