import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TIPOS_NEGOCIO } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Campo, Dialogo, Entrada, Selecao, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { BuscaImovel } from '@/features/locacoes/BuscaImovel'
import { SeletorPessoa } from '@/features/pessoas/BuscaPessoa'
import { rpc } from '@/lib/rpc'
import { invalidarCrm, useCorretores } from './comum'

/** Abre um negócio a partir de um lead ou de um cliente já cadastrado. */
export function DialogoNovoNegocio({ lead, tipoInicial = 'VENDA', aoFechar }: { lead?: { id: number; nome: string; corretorId: number | null; interesse: string }; tipoInicial?: 'VENDA' | 'LOCACAO'; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()
  const { pode } = useSessao()
  const { data: corretores } = useCorretores()
  const [tipo, setTipo] = useState<'VENDA' | 'LOCACAO'>(lead ? (lead.interesse === 'LOCACAO' ? 'LOCACAO' : 'VENDA') : tipoInicial)
  const [cliente, setCliente] = useState<{ id: number; nome: string } | null>(null)
  const [imovel, setImovel] = useState<{ id: number; rotulo: string; valor: number | null } | null>(null)
  const [titulo, setTitulo] = useState(lead ? `${lead.nome}` : '')
  const [valor, setValor] = useState('')
  const [corretor, setCorretor] = useState(lead?.corretorId ? String(lead.corretorId) : '')
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      largura="max-w-xl"
      titulo={lead ? `Novo negócio — ${lead.nome}` : 'Novo negócio'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={async () => {
              setFalha(null)
              try {
                const r = await rpc('negocios.criar', { tipo, titulo, leadId: lead?.id ?? null, clienteId: cliente?.id ?? null, imovelId: imovel?.id ?? null, corretorId: corretor ? Number(corretor) : null, valorEstimado: valor })
                toast.sucesso('Negócio aberto.')
                invalidarCrm(qc)
                aoFechar()
                navegar(`/crm/negocios/${r.id}`)
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Abrir negócio
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Campo rotulo="Tipo">{(i) => <Selecao id={i} opcoes={TIPOS_NEGOCIO} value={tipo} onChange={(e) => (setTipo(e.target.value as 'VENDA'), setImovel(null))} />}</Campo>
        <Campo rotulo="Título">{(i) => <Entrada id={i} placeholder="Ex.: Apto Centro — Pedro" value={titulo} onChange={(e) => setTitulo(e.target.value)} />}</Campo>
        {!lead && (
          <div className="col-span-2">
            <div className="mb-1 text-xs font-medium text-texto-2">Cliente</div>
            <SeletorPessoa valor={cliente} aoMudar={setCliente} />
          </div>
        )}
        <div className="col-span-2">
          <div className="mb-1 text-xs font-medium text-texto-2">Imóvel (opcional)</div>
          {imovel ? (
            <div className="flex h-9 items-center justify-between rounded-md border border-borda px-3">
              {imovel.rotulo}
              <button type="button" className="text-xs underline" onClick={() => setImovel(null)}>
                trocar
              </button>
            </div>
          ) : (
            <BuscaImovel
              modalidade={tipo}
              aoSelecionar={(i) => {
                const oferta = tipo === 'VENDA' ? i.venda : i.locacao
                setImovel({ id: i.id, rotulo: `Cód. ${i.codigo} — ${i.endereco}`, valor: oferta?.valorCentavos ?? null })
                if (oferta && !valor) setValor((oferta.valorCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
              }}
            />
          )}
        </div>
        <Campo rotulo="Valor estimado">{(i) => <CampoMoeda id={i} value={valor} onChange={(e) => setValor(e.target.value)} />}</Campo>
        {pode('crm.carteira_toda') && (
          <Campo rotulo="Corretor">{(i) => <Selecao id={i} opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="—" value={corretor} onChange={(e) => setCorretor(e.target.value)} />}</Campo>
        )}
        {falha && (
          <div className="col-span-2">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}
