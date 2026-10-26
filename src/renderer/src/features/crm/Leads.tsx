import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus, Search, Star, StarOff, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { centavosParaTexto, formatarMoeda } from '@shared/dinheiro'
import type { LeadDetalhe } from '@shared/dto-crm'
import { TIPOS_IMOVEL } from '@shared/schemas'
import { INTERESSES, SITUACOES_LEAD } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Confirmacao, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { SeletorPessoa } from '@/features/pessoas/BuscaPessoa'
import { telefone } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { invalidarCrm, ListaAtividades, ListaVisitas, quando, SeloEtapa, useCorretores, useOrigens } from './comum'
import { DialogoNovoNegocio } from './NovoNegocio'

export function ListaLeads() {
  const { pode } = useSessao()
  const navegar = useNavigate()
  const { data: origens } = useOrigens()
  const [f, setF] = useState({ busca: '', situacao: '', origemId: '', interesse: '' })
  const [novo, setNovo] = useState(false)
  const entrada = { busca: f.busca || undefined, situacao: f.situacao || undefined, origemId: f.origemId ? Number(f.origemId) : undefined, interesse: f.interesse || undefined }
  const { data, isLoading } = useQuery({ queryKey: ['leads', entrada], queryFn: () => rpc('leads.listar', entrada), placeholderData: keepPreviousData })
  return (
    <>
      <CabecalhoPagina
        titulo="Leads"
        subtitulo="Interessados em comprar ou alugar, com origem do contato e perfil de busca."
        acoes={
          pode('crm.gerenciar') && (
            <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
              Novo lead
            </Botao>
          )
        }
      />
      <Cartao semPadding>
        <div className="grid grid-cols-5 gap-3 border-b border-borda p-4">
          <div className="relative col-span-2">
            <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
            <Entrada className="pl-9" placeholder="Nome, telefone ou e-mail" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} />
          </div>
          <Selecao aria-label="Situação" opcoes={SITUACOES_LEAD} vazio="Ativos e em negociação" value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value })} />
          <Selecao aria-label="Origem" opcoes={(origens ?? []).map((o) => [String(o.id), o.nome] as [string, string])} vazio="Todas as origens" value={f.origemId} onChange={(e) => setF({ ...f, origemId: e.target.value })} />
          <Selecao aria-label="Interesse" opcoes={INTERESSES} vazio="Compra e locação" value={f.interesse} onChange={(e) => setF({ ...f, interesse: e.target.value })} />
        </div>
        <Tabela colunas={['Lead', 'Contato', 'Interesse', 'Origem', 'Corretor', 'Próxima atividade', 'Situação']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((l) => (
            <tr key={l.id} className="cursor-pointer" onClick={() => navegar(`/crm/leads/${l.id}`)}>
              <td className="font-medium">{l.nome}</td>
              <td className="text-texto-2">{[l.telefone && telefone(l.telefone), l.email].filter(Boolean).join(' · ') || '—'}</td>
              <td>{INTERESSES[l.interesse]}</td>
              <td className="text-texto-2">{l.origem}</td>
              <td className="text-texto-2">{l.corretor ?? '—'}</td>
              <td className="numeros text-texto-2">{l.proximaAtividade ? quando(l.proximaAtividade) : '—'}</td>
              <td>
                <Selo tom={l.situacao === 'CONVERTIDO' ? 'destaque' : l.situacao === 'DESCARTADO' ? 'neutro' : 'alerta'}>{SITUACOES_LEAD[l.situacao]}</Selo>
                {l.negocios > 0 && <span className="ml-1 text-xs text-texto-3">{l.negocios} negócio(s)</span>}
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {novo && <FormLead lead={null} aoFechar={() => setNovo(false)} aoSalvar={(id) => navegar(`/crm/leads/${id}`)} />}
    </>
  )
}

function FormLead({ lead, aoFechar, aoSalvar }: { lead: LeadDetalhe | null; aoFechar: () => void; aoSalvar?: (id: number) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = useSessao()
  const { data: origens } = useOrigens()
  const { data: corretores } = useCorretores()
  const reais = (c: number | null | undefined) => (c != null ? centavosParaTexto(c) : '')
  const [f, setF] = useState({
    nome: lead?.nome ?? '',
    telefone: lead?.telefone ?? '',
    email: lead?.email ?? '',
    origemId: lead ? String(lead.origemId) : '',
    corretorId: lead?.corretorId ? String(lead.corretorId) : '',
    interesse: lead?.interesse ?? 'COMPRA',
    tipoImovel: lead?.tipoImovel ?? '',
    bairros: lead?.bairros ?? '',
    valorMin: reais(lead?.valorMinCentavos),
    valorMax: reais(lead?.valorMaxCentavos),
    dormitoriosMin: lead?.dormitoriosMin != null ? String(lead.dormitoriosMin) : '',
    observacoes: lead?.observacoes ?? '',
    consentimentoContato: lead?.consentimentoContato ?? false,
    idExterno: lead?.idExterno ?? ''
  })
  const [pessoa, setPessoa] = useState(lead?.pessoaId ? { id: lead.pessoaId, nome: lead.pessoaNome ?? '' } : null)
  const [falha, setFalha] = useState<string | null>(null)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  return (
    <Dialogo
      aberto
      largura="max-w-2xl"
      titulo={lead ? 'Editar lead' : 'Novo lead'}
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
              const dados = { ...f, origemId: Number(f.origemId), corretorId: f.corretorId ? Number(f.corretorId) : null, pessoaId: pessoa?.id ?? null, interesse: f.interesse as 'COMPRA' }
              try {
                if (lead) await rpc('leads.atualizar', { id: lead.id, dados })
                const id = lead ? lead.id : (await rpc('leads.criar', dados)).id
                toast.sucesso('Lead salvo.')
                invalidarCrm(qc)
                aoFechar()
                aoSalvar?.(id)
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
      <div className="grid grid-cols-6 gap-3 text-sm">
        <Campo rotulo="Nome" className="col-span-6">{(i) => <Entrada id={i} value={f.nome} onChange={(e) => set({ nome: e.target.value })} />}</Campo>
        <Campo rotulo="Telefone / WhatsApp" className="col-span-3">{(i) => <Entrada id={i} value={f.telefone} onChange={(e) => set({ telefone: e.target.value })} />}</Campo>
        <Campo rotulo="E-mail" className="col-span-3">{(i) => <Entrada id={i} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />}</Campo>
        <Campo rotulo="Origem do contato" className="col-span-2">{(i) => <Selecao id={i} opcoes={(origens ?? []).filter((o) => o.ativa).map((o) => [String(o.id), o.nome] as [string, string])} vazio="Selecione" value={f.origemId} onChange={(e) => set({ origemId: e.target.value })} />}</Campo>
        <Campo rotulo="Interesse" className="col-span-2">{(i) => <Selecao id={i} opcoes={INTERESSES} value={f.interesse} onChange={(e) => set({ interesse: e.target.value as 'COMPRA' })} />}</Campo>
        <Campo rotulo="Corretor" className="col-span-2" ajuda={pode('crm.carteira_toda') ? undefined : 'Você será o corretor'}>
          {(i) => <Selecao id={i} disabled={!pode('crm.carteira_toda')} opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="—" value={f.corretorId} onChange={(e) => set({ corretorId: e.target.value })} />}
        </Campo>
        <div className="col-span-6 mt-1 text-xs font-semibold tracking-wide text-texto-3 uppercase">Perfil de busca</div>
        <Campo rotulo="Tipo de imóvel" className="col-span-2">{(i) => <Selecao id={i} opcoes={TIPOS_IMOVEL} vazio="Qualquer" value={f.tipoImovel} onChange={(e) => set({ tipoImovel: e.target.value })} />}</Campo>
        <Campo rotulo="Bairros (separados por vírgula)" className="col-span-4">{(i) => <Entrada id={i} value={f.bairros} onChange={(e) => set({ bairros: e.target.value })} />}</Campo>
        <Campo rotulo="Valor mínimo" className="col-span-2">{(i) => <CampoMoeda id={i} value={f.valorMin} onChange={(e) => set({ valorMin: e.target.value })} />}</Campo>
        <Campo rotulo="Valor máximo" className="col-span-2">{(i) => <CampoMoeda id={i} value={f.valorMax} onChange={(e) => set({ valorMax: e.target.value })} />}</Campo>
        <Campo rotulo="Dormitórios (mín.)" className="col-span-2">{(i) => <Entrada id={i} type="number" min={0} value={f.dormitoriosMin} onChange={(e) => set({ dormitoriosMin: e.target.value })} />}</Campo>
        <div className="col-span-6">
          <div className="mb-1 text-xs font-medium text-texto-2">Vincular ao cadastro de pessoas (opcional)</div>
          <SeletorPessoa valor={pessoa} aoMudar={setPessoa} />
        </div>
        <Campo rotulo="Observações" className="col-span-4">{(i) => <Entrada id={i} value={f.observacoes} onChange={(e) => set({ observacoes: e.target.value })} />}</Campo>
        <Campo rotulo="Código no portal/site" className="col-span-2" ajuda="Evita duplicar o mesmo contato">{(i) => <Entrada id={i} value={f.idExterno} onChange={(e) => set({ idExterno: e.target.value })} />}</Campo>
        <div className="col-span-6">
          <Caixa rotulo="O contato autorizou receber comunicações (LGPD)" checked={f.consentimentoContato} onChange={(e) => set({ consentimentoContato: e.target.checked })} />
        </div>
        {falha && (
          <div className="col-span-6">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}

export function PaginaLead() {
  const id = Number(useParams().id)
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: l } = useQuery({ queryKey: ['lead', id], queryFn: () => rpc('leads.obter', { id }) })
  const { data: sugestoes } = useQuery({ queryKey: ['lead', id, 'sugestoes'], queryFn: () => rpc('leads.sugestoes', { id }), enabled: !!l && pode('imoveis.ver') })
  const { data: atividades } = useQuery({ queryKey: ['lead', id, 'atividades'], queryFn: () => rpc('leads.atividades', { id }) })
  const { data: visitas } = useQuery({ queryKey: ['lead', id, 'visitas'], queryFn: () => rpc('leads.visitas', { id }) })
  const { data: negocios } = useQuery({ queryKey: ['negocios', 'lead', id], queryFn: () => rpc('negocios.listar', { leadId: id, incluirEncerrados: true }) })
  const [editar, setEditar] = useState(false)
  const [negocio, setNegocio] = useState(false)
  const [descartar, setDescartar] = useState(false)
  if (!l) return null
  const interesse = async (imovelId: number, incluir: boolean) => {
    try {
      await rpc('leads.interesse', { leadId: id, imovelId, incluir })
      void qc.invalidateQueries({ queryKey: ['lead', id] })
    } catch (e) {
      toast.erro(e)
    }
  }
  const valorImovel = (i: { valorVendaCentavos: number | null; valorLocacaoCentavos: number | null }) =>
    [i.valorVendaCentavos != null && `venda ${formatarMoeda(i.valorVendaCentavos)}`, i.valorLocacaoCentavos != null && `aluguel ${formatarMoeda(i.valorLocacaoCentavos)}`].filter(Boolean).join(' · ')
  return (
    <>
      <CabecalhoPagina
        titulo={l.nome}
        subtitulo={`${INTERESSES[l.interesse]} · origem: ${l.origem}${l.corretor ? ` · corretor: ${l.corretor}` : ''}`}
        voltar={
          <Link to="/crm/leads" className="inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
            <ArrowLeft className="size-3.5" /> Leads
          </Link>
        }
        acoes={
          pode('crm.gerenciar') && (
            <>
              {l.situacao === 'DESCARTADO' ? (
                <Botao icone={<Undo2 className="size-4" />} onClick={async () => (await rpc('leads.reativar', { id }), invalidarCrm(qc))}>
                  Reativar
                </Botao>
              ) : (
                <Botao variante="fantasma" icone={<Trash2 className="size-4" />} onClick={() => setDescartar(true)}>
                  Descartar
                </Botao>
              )}
              <Botao icone={<Pencil className="size-4" />} onClick={() => setEditar(true)}>
                Editar
              </Botao>
              {l.situacao !== 'DESCARTADO' && (
                <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNegocio(true)}>
                  Abrir negócio
                </Botao>
              )}
            </>
          )
        }
      />
      {l.situacao === 'DESCARTADO' && (
        <div className="mb-4">
          <Aviso tom="alerta">Lead descartado: {l.motivoDescarte}</Aviso>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        <Cartao titulo="Contato e perfil">
          <dl className="space-y-2 text-sm">
            <Item rotulo="Telefone" valor={l.telefone ? telefone(l.telefone) : '—'} />
            <Item rotulo="E-mail" valor={l.email ?? '—'} />
            <Item rotulo="Cadastro de pessoas" valor={l.pessoaNome ?? 'Não vinculado'} />
            <Item rotulo="Tipo de imóvel" valor={l.tipoImovel ? (TIPOS_IMOVEL[l.tipoImovel as keyof typeof TIPOS_IMOVEL] ?? l.tipoImovel) : 'Qualquer'} />
            <Item rotulo="Bairros" valor={l.bairros ?? 'Qualquer'} />
            <Item rotulo="Faixa de valor" valor={l.valorMinCentavos != null || l.valorMaxCentavos != null ? `${l.valorMinCentavos != null ? formatarMoeda(l.valorMinCentavos) : '…'} a ${l.valorMaxCentavos != null ? formatarMoeda(l.valorMaxCentavos) : '…'}` : 'Qualquer'} />
            <Item rotulo="Dormitórios" valor={l.dormitoriosMin != null ? `${l.dormitoriosMin} ou mais` : 'Qualquer'} />
            <Item rotulo="Comunicações (LGPD)" valor={l.consentimentoContato ? 'Autorizadas' : 'Sem autorização registrada'} />
            {l.observacoes && <Item rotulo="Observações" valor={l.observacoes} />}
          </dl>
        </Cartao>
        <Cartao titulo="Imóveis de interesse" className="col-span-2">
          {l.imoveis.length === 0 && <div className="text-sm text-texto-3">Nenhum imóvel marcado.</div>}
          <ul className="space-y-1 text-sm">
            {l.imoveis.map((i) => (
              <li key={i.imovelId} className="flex items-center justify-between gap-2">
                <span>
                  <Link className="font-medium hover:underline" to={`/imoveis/${i.imovelId}`}>
                    Cód. {i.codigo}
                  </Link>{' '}
                  <span className="text-texto-2">
                    {i.endereco} · {valorImovel(i)}
                  </span>
                </span>
                {pode('crm.gerenciar') && <Botao tamanho="sm" variante="fantasma" title="Remover" icone={<StarOff className="size-3.5" />} onClick={() => interesse(i.imovelId, false)} />}
              </li>
            ))}
          </ul>
          {!!sugestoes?.length && (
            <>
              <div className="mt-4 mb-1 text-xs font-semibold tracking-wide text-texto-3 uppercase">Sugestões compatíveis com o perfil</div>
              <ul className="space-y-1 text-sm">
                {sugestoes.map((i) => (
                  <li key={i.imovelId} className="flex items-center justify-between gap-2">
                    <span>
                      Cód. {i.codigo} <span className="text-texto-2">{i.endereco} · {i.dormitorios ?? 0} dorm. · {valorImovel(i)}</span>
                    </span>
                    {pode('crm.gerenciar') && (
                      <Botao tamanho="sm" variante="fantasma" icone={<Star className="size-3.5" />} onClick={() => interesse(i.imovelId, true)}>
                        Marcar
                      </Botao>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>
      </div>
      <Cartao titulo="Negócios" className="mt-4" semPadding>
        <Tabela colunas={['Negócio', 'Tipo', 'Imóvel', 'Etapa', 'Corretor']} vazio={negocios?.length === 0}>
          {negocios?.map((n) => (
            <tr key={n.id}>
              <td>
                <Link className="font-medium hover:underline" to={`/crm/negocios/${n.id}`}>
                  {n.titulo}
                </Link>
              </td>
              <td>{n.tipo === 'VENDA' ? 'Venda' : 'Locação'}</td>
              <td className="text-texto-2">{n.imovel ?? '—'}</td>
              <td>
                <SeloEtapa etapa={n.etapa} />
              </td>
              <td className="text-texto-2">{n.corretor ?? '—'}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Cartao titulo="Histórico de atendimento">{atividades && <ListaAtividades itens={atividades} leadId={id} />}</Cartao>
        <Cartao titulo="Visitas">{visitas && <ListaVisitas itens={visitas} leadId={id} modalidade={l.interesse === 'LOCACAO' ? 'LOCACAO' : 'VENDA'} />}</Cartao>
      </div>
      {editar && <FormLead lead={l} aoFechar={() => setEditar(false)} />}
      {negocio && <DialogoNovoNegocio lead={l} aoFechar={() => setNegocio(false)} />}
      <Confirmacao
        aberto={descartar}
        titulo="Descartar lead"
        exigirMotivo
        textoConfirmar="Descartar"
        mensagem="O lead sai das listas de atendimento. Pode ser reativado depois."
        aoFechar={() => setDescartar(false)}
        aoConfirmar={async (motivo) => {
          await rpc('leads.descartar', { id, motivo })
          toast.sucesso('Lead descartado.')
          invalidarCrm(qc)
        }}
      />
    </>
  )
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2">
      <dt className="text-texto-2">{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  )
}
