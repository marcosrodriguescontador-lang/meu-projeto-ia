import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { AtividadeDto, VisitaDto } from '@shared/dto-crm'
import { agoraLocal } from '@shared/financeiro/datas'
import { ETAPAS, SITUACOES_VISITA, TIPOS_ATIVIDADE, type Etapa } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Campo, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { BuscaImovel } from '@/features/locacoes/BuscaImovel'
import { rpc } from '@/lib/rpc'

export const quando = (v: string) => {
  const [d, h] = v.split('T')
  const [a, m, dia] = d!.split('-')
  return `${dia}/${m}/${a}${h ? ` ${h.slice(0, 5)}` : ''}`
}

export function SeloEtapa({ etapa }: { etapa: string }) {
  const tom = etapa === 'CONCLUIDO' ? 'destaque' : etapa === 'PERDIDO' ? 'perigo' : etapa === 'CONTRATO' ? 'escuro' : 'neutro'
  return <Selo tom={tom}>{ETAPAS[etapa as Etapa] ?? etapa}</Selo>
}

export function useCorretores() {
  return useQuery({ queryKey: ['crm-corretores'], queryFn: () => rpc('crm.corretores'), staleTime: 60_000 })
}

export function useOrigens() {
  return useQuery({ queryKey: ['origens-lead'], queryFn: () => rpc('crm.origens'), staleTime: 60_000 })
}

export function invalidarCrm(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['leads', 'lead', 'negocios', 'negocio', 'agenda', 'painel', 'indicadores-funil', 'comissoes', 'titulos']) void qc.invalidateQueries({ queryKey: [k] })
}

const proximaHora = () => {
  const d = new Date(Date.now() + 60 * 60_000)
  d.setMinutes(0)
  return agoraLocal(d)
}

/** Nova atividade (ligação, WhatsApp, tarefa…) vinculada a um lead ou negócio. */
export function DialogoAtividade({ negocioId, leadId, aoFechar }: { negocioId?: number; leadId?: number; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ tipo: 'LIGACAO', titulo: '', descricao: '', agendadaPara: proximaHora() })
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo="Nova atividade"
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
                await rpc('atividades.criar', { negocioId: negocioId ?? null, leadId: leadId ?? null, tipo: f.tipo as 'LIGACAO', titulo: f.titulo, descricao: f.descricao, agendadaPara: f.agendadaPara })
                toast.sucesso('Atividade agendada.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Agendar
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Campo rotulo="Tipo">{(i) => <Selecao id={i} opcoes={TIPOS_ATIVIDADE} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />}</Campo>
        <Campo rotulo="Quando">{(i) => <Entrada id={i} type="datetime-local" value={f.agendadaPara} onChange={(e) => setF({ ...f, agendadaPara: e.target.value })} />}</Campo>
        <Campo rotulo="Título" className="col-span-2">{(i) => <Entrada id={i} placeholder="Ex.: Retornar sobre a proposta" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />}</Campo>
        <Campo rotulo="Detalhes" className="col-span-2">{(i) => <Entrada id={i} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />}</Campo>
        {falha && (
          <div className="col-span-2">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}

/** Concluir (com resultado) uma atividade. */
export function DialogoConcluir({ atividade, aoFechar }: { atividade: { id: number; titulo: string }; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [resultado, setResultado] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo={`Concluir: ${atividade.titulo}`}
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
                await rpc('atividades.concluir', { id: atividade.id, resultado })
                toast.sucesso('Atividade concluída.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Concluir
          </Botao>
        </>
      }
    >
      <Campo rotulo="Resultado do contato">{(i) => <Entrada id={i} autoFocus value={resultado} onChange={(e) => setResultado(e.target.value)} />}</Campo>
      {falha && (
        <div className="mt-3">
          <Aviso tom="perigo">{falha}</Aviso>
        </div>
      )}
    </Dialogo>
  )
}

export function ListaAtividades({ itens, negocioId, leadId }: { itens: AtividadeDto[]; negocioId?: number; leadId?: number }) {
  const { pode } = useSessao()
  const [nova, setNova] = useState(false)
  const [concluir, setConcluir] = useState<AtividadeDto | null>(null)
  return (
    <div>
      {pode('crm.gerenciar') && (
        <div className="mb-2 flex justify-end">
          <Botao tamanho="sm" onClick={() => setNova(true)}>
            Nova atividade
          </Botao>
        </div>
      )}
      <div className="rounded-md border border-borda">
        <Tabela colunas={['Quando', 'Atividade', 'Responsável', 'Situação', '']} vazio={itens.length === 0}>
          {itens.map((a) => (
            <tr key={a.id}>
              <td className="numeros whitespace-nowrap">{quando(a.agendadaPara)}</td>
              <td>
                <span className="text-texto-2">{TIPOS_ATIVIDADE[a.tipo as keyof typeof TIPOS_ATIVIDADE]}: </span>
                {a.titulo}
                {a.resultado && <div className="text-xs text-texto-2">↳ {a.resultado}</div>}
              </td>
              <td className="text-texto-2">{a.responsavel}</td>
              <td>
                {a.concluidaEm ? (
                  <Selo tom="destaque">
                    <CheckCircle2 className="mr-1 size-3" /> Concluída
                  </Selo>
                ) : a.canceladaEm ? (
                  <Selo>
                    <XCircle className="mr-1 size-3" /> Cancelada
                  </Selo>
                ) : a.atrasada ? (
                  <Selo tom="perigo">
                    <Clock className="mr-1 size-3" /> Atrasada
                  </Selo>
                ) : (
                  <Selo tom="alerta">Pendente</Selo>
                )}
              </td>
              <td className="text-right">
                {!a.concluidaEm && !a.canceladaEm && pode('crm.gerenciar') && (
                  <Botao tamanho="sm" variante="fantasma" onClick={() => setConcluir(a)}>
                    Concluir
                  </Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      </div>
      {nova && <DialogoAtividade negocioId={negocioId} leadId={leadId} aoFechar={() => setNova(false)} />}
      {concluir && <DialogoConcluir atividade={concluir} aoFechar={() => setConcluir(null)} />}
    </div>
  )
}

export function DialogoVisita({ negocioId, leadId, imovel, modalidade, aoFechar }: { negocioId?: number; leadId?: number; imovel?: { id: number; rotulo: string } | null; modalidade: 'VENDA' | 'LOCACAO'; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: corretores } = useCorretores()
  const [im, setIm] = useState(imovel ?? null)
  const [dataHora, setDataHora] = useState(proximaHora())
  const [corretor, setCorretor] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo="Agendar visita"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            disabled={!im}
            onClick={async () => {
              setFalha(null)
              try {
                await rpc('visitas.agendar', { imovelId: im!.id, negocioId: negocioId ?? null, leadId: leadId ?? null, corretorId: corretor ? Number(corretor) : null, dataHora })
                toast.sucesso('Visita agendada.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Agendar
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-medium text-texto-2">Imóvel</div>
          {im ? (
            <div className="flex h-9 items-center justify-between rounded-md border border-borda px-3">
              {im.rotulo}
              <button type="button" className="text-xs underline" onClick={() => setIm(null)}>
                trocar
              </button>
            </div>
          ) : (
            <BuscaImovel modalidade={modalidade} aoSelecionar={(i) => setIm({ id: i.id, rotulo: `Cód. ${i.codigo} — ${i.endereco}` })} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data e hora">{(i) => <Entrada id={i} type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />}</Campo>
          <Campo rotulo="Corretor" ajuda="Vazio: o corretor do negócio">{(i) => <Selecao id={i} opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="—" value={corretor} onChange={(e) => setCorretor(e.target.value)} />}</Campo>
        </div>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

function DialogoResultadoVisita({ visita, aoFechar }: { visita: VisitaDto; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ situacao: 'REALIZADA', feedback: '', avaliacao: '' })
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo={`Visita de ${quando(visita.dataHora)}`}
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
                await rpc('visitas.resultado', { visitaId: visita.id, situacao: f.situacao as 'REALIZADA', feedback: f.feedback, avaliacao: f.avaliacao ? Number(f.avaliacao) : null })
                toast.sucesso('Visita registrada.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Campo rotulo="Resultado">{(i) => <Selecao id={i} opcoes={{ REALIZADA: 'Realizada', NAO_COMPARECEU: 'Cliente não compareceu', CANCELADA: 'Cancelada' }} value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value })} />}</Campo>
        <Campo rotulo="Interesse do cliente">{(i) => <Selecao id={i} opcoes={{ '1': '1 — nenhum', '2': '2 — baixo', '3': '3 — médio', '4': '4 — alto', '5': '5 — muito alto' }} vazio="—" value={f.avaliacao} onChange={(e) => setF({ ...f, avaliacao: e.target.value })} />}</Campo>
        <Campo rotulo="Comentários do cliente" className="col-span-2">{(i) => <Entrada id={i} value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} />}</Campo>
        {falha && (
          <div className="col-span-2">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}

export function ListaVisitas({ itens, negocioId, leadId, imovel, modalidade }: { itens: VisitaDto[]; negocioId?: number; leadId?: number; imovel?: { id: number; rotulo: string } | null; modalidade: 'VENDA' | 'LOCACAO' }) {
  const { pode } = useSessao()
  const [nova, setNova] = useState(false)
  const [resultado, setResultado] = useState<VisitaDto | null>(null)
  return (
    <div>
      {pode('crm.gerenciar') && (
        <div className="mb-2 flex justify-end">
          <Botao tamanho="sm" onClick={() => setNova(true)}>
            Agendar visita
          </Botao>
        </div>
      )}
      <div className="rounded-md border border-borda">
        <Tabela colunas={['Data', 'Imóvel', 'Corretor', 'Situação', 'Retorno', '']} vazio={itens.length === 0}>
          {itens.map((v) => (
            <tr key={v.id}>
              <td className="numeros whitespace-nowrap">{quando(v.dataHora)}</td>
              <td>
                Cód. {v.imovelCodigo} <span className="text-texto-2">· {v.imovelEndereco}</span>
              </td>
              <td className="text-texto-2">{v.corretor ?? '—'}</td>
              <td>
                <Selo tom={v.situacao === 'REALIZADA' ? 'destaque' : v.situacao === 'AGENDADA' ? 'alerta' : 'neutro'}>{SITUACOES_VISITA[v.situacao]}</Selo>
              </td>
              <td className="text-texto-2">
                {v.avaliacao ? `${'★'.repeat(v.avaliacao)} ` : ''}
                {v.feedback}
              </td>
              <td className="text-right">
                {v.situacao === 'AGENDADA' && pode('crm.gerenciar') && (
                  <Botao tamanho="sm" variante="fantasma" onClick={() => setResultado(v)}>
                    Registrar
                  </Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      </div>
      {nova && <DialogoVisita negocioId={negocioId} leadId={leadId} imovel={imovel} modalidade={modalidade} aoFechar={() => setNova(false)} />}
      {resultado && <DialogoResultadoVisita visita={resultado} aoFechar={() => setResultado(null)} />}
    </div>
  )
}
