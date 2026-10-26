import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileDown, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { UFS } from '@shared/documentos'
import { aplicarPercentual, centavosParaTexto, formatarMoeda, paraCentavos, paraPontosBase } from '@shared/dinheiro'
import type { ImovelDetalhe } from '@shared/dto'
import { FINALIDADES_IMOVEL, imovelSchema, TIPOS_IMOVEL, type ImovelInput, type Modalidade } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Confirmacao, Entrada, Selecao, useToast, cx } from '@/components/ui'
import { Documentos } from '@/features/comum/Documentos'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { dataHora } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { CampoMoeda, CampoSufixo, SeloSituacao } from './comum'
import { Galeria } from './Galeria'
import { HistoricoImovel } from './HistoricoImovel'
import { DialogoSituacao } from './DialogoSituacao'
import { Proprietarios } from './Proprietarios'

type Aba = 'dados' | 'detalhes' | 'valores' | 'proprietarios' | 'fotos' | 'documentos' | 'historico'
const ABAS_FORM: Aba[] = ['dados', 'detalhes', 'valores', 'proprietarios']

const VAZIO: ImovelInput = {
  tipo: 'CASA',
  finalidade: 'RESIDENCIAL',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: 'SP',
  matricula: '',
  cartorio: '',
  inscricaoMunicipal: '',
  areaConstruida: '',
  areaTerreno: '',
  dormitorios: '0',
  suites: '0',
  banheiros: '0',
  vagas: '0',
  descricaoComercial: '',
  observacoesInternas: '',
  condominio: '',
  iptuAnual: '',
  corretorId: null,
  caracteristicas: [],
  proprietarios: [],
  venda: { ativa: false, valor: '', comissao: '6' },
  locacao: { ativa: false, valor: '', comissao: '10' }
}

const txt = (c: number | null | undefined) => centavosParaTexto(c)
const pct = (bp: number) => (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function paraFormulario(i: ImovelDetalhe): ImovelInput {
  const of = (m: Modalidade) => {
    const o = i.ofertas.find((x) => x.modalidade === m)
    return o ? { ativa: o.situacao !== 'INATIVO', valor: txt(o.valorCentavos), comissao: pct(o.comissaoBp) } : { ativa: false, valor: '', comissao: m === 'VENDA' ? '6' : '10' }
  }
  return {
    tipo: i.tipo as never,
    finalidade: i.finalidade as never,
    cep: i.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2'),
    logradouro: i.logradouro,
    numero: i.numero,
    complemento: i.complemento ?? '',
    bairro: i.bairro,
    cidade: i.cidade,
    uf: i.uf as never,
    matricula: i.internos?.matricula ?? '',
    cartorio: i.internos?.cartorio ?? '',
    inscricaoMunicipal: i.internos?.inscricaoMunicipal ?? '',
    areaConstruida: txt(i.areaConstruida),
    areaTerreno: txt(i.areaTerreno),
    dormitorios: String(i.dormitorios),
    suites: String(i.suites),
    banheiros: String(i.banheiros),
    vagas: String(i.vagas),
    descricaoComercial: i.descricaoComercial ?? '',
    observacoesInternas: i.internos?.observacoesInternas ?? '',
    condominio: txt(i.condominioCentavos),
    iptuAnual: txt(i.iptuAnualCentavos),
    corretorId: i.corretor?.id ?? null,
    caracteristicas: i.caracteristicas,
    proprietarios: (i.internos?.proprietarios ?? []).map((p) => ({ pessoaId: p.pessoaId, percentual: pct(p.percentualBp), principal: p.principal })),
    venda: of('VENDA'),
    locacao: of('LOCACAO')
  }
}

export function FormImovel() {
  const { id: idParam } = useParams()
  const id = idParam ? Number(idParam) : null
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = useSessao()
  const [aba, setAba] = useState<Aba>('dados')
  const [falha, setFalha] = useState<string | null>(null)
  const [excluir, setExcluir] = useState(false)
  const [nomesProp, setNomesProp] = useState<Record<number, string>>({})
  const internos = pode('imoveis.dados_internos.ver')

  const { data: imovel } = useQuery({ queryKey: ['imovel', id], queryFn: () => rpc('imoveis.obter', { id: id! }), enabled: !!id })
  const form = useForm<ImovelInput>({ resolver: resolverZod(imovelSchema), defaultValues: VAZIO })
  const { handleSubmit, formState, reset, setError } = form
  const editavel = id ? pode('imoveis.editar') : pode('imoveis.criar') && internos

  useEffect(() => {
    if (imovel) {
      reset(paraFormulario(imovel))
      setNomesProp(Object.fromEntries((imovel.internos?.proprietarios ?? []).map((p) => [p.pessoaId, p.nome])))
    }
  }, [imovel, reset])

  const salvar = handleSubmit(
    async (v) => {
      setFalha(null)
      try {
        if (id) {
          await rpc('imoveis.atualizar', { id, dados: v })
          toast.sucesso('Imóvel atualizado.')
          await qc.invalidateQueries({ queryKey: ['imovel', id] })
        } else {
          const r = await rpc('imoveis.criar', v)
          toast.sucesso('Imóvel cadastrado.')
          nav(`/imoveis/${r.id}`, { replace: true })
        }
        void qc.invalidateQueries({ queryKey: ['imoveis'] })
        void qc.invalidateQueries({ queryKey: ['localidades'] })
      } catch (err) {
        const msg = aplicarErrosServidor(err, setError)
        setFalha(msg)
        if (/propriet|participa/i.test(msg)) setAba('proprietarios')
      }
    },
    (e) => {
      if (e.tipo || e.cep || e.logradouro || e.numero || e.bairro || e.cidade || e.matricula || e.cartorio) setAba('dados')
      else if (e.dormitorios || e.suites || e.banheiros || e.vagas || e.areaConstruida || e.areaTerreno) setAba('detalhes')
      else if (e.venda || e.locacao || e.condominio || e.iptuAnual) setAba('valores')
    }
  )

  const ficha = async (interna: boolean) => {
    try {
      if (await rpc('imoveis.ficha', { id: id!, interna })) toast.sucesso('Ficha gerada.')
    } catch (e) {
      toast.erro(e)
    }
  }

  const abas: [Aba, string, number?][] = [
    ['dados', 'Identificação e endereço'],
    ['detalhes', 'Cômodos e características'],
    ['valores', 'Valores e disponibilidade']
  ]
  if (internos) abas.push(['proprietarios', 'Proprietários', form.watch('proprietarios')?.length])
  if (id) {
    abas.push(['fotos', 'Fotos'])
    if (pode('imoveis.documentos.ver')) abas.push(['documentos', 'Documentos'])
    abas.push(['historico', 'Histórico'])
  }

  if (!id && !internos) return <Aviso tom="alerta">Cadastrar imóveis exige acesso aos dados internos (proprietários e matrícula).</Aviso>

  return (
    <>
      <CabecalhoPagina
        voltar={
          <Link to="/imoveis" className="mb-1 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
            <ArrowLeft className="size-3" /> Imóveis
          </Link>
        }
        titulo={id ? (imovel ? `${TIPOS_IMOVEL[imovel.tipo as keyof typeof TIPOS_IMOVEL]} — ${imovel.bairro}` : 'Carregando…') : 'Novo imóvel'}
        subtitulo={imovel ? `Código ${imovel.codigo} · ${imovel.logradouro}, ${imovel.numero} · ${imovel.cidade}/${imovel.uf} · atualizado em ${dataHora(imovel.atualizadoEm)}` : undefined}
        acoes={
          <>
            {id && (
              <>
                <Botao variante="fantasma" icone={<FileDown className="size-4" />} onClick={() => ficha(false)}>
                  Ficha comercial
                </Botao>
                {internos && (
                  <Botao variante="fantasma" onClick={() => ficha(true)}>
                    Ficha interna
                  </Botao>
                )}
              </>
            )}
            {id && pode('imoveis.excluir') && <Botao variante="fantasma" icone={<Trash2 className="size-4" />} onClick={() => setExcluir(true)} title="Excluir" />}
            {editavel && ABAS_FORM.includes(aba) && (
              <Botao variante="primario" onClick={salvar} carregando={formState.isSubmitting}>
                Salvar
              </Botao>
            )}
          </>
        }
      />
      <Abas abas={abas} ativa={aba} aoMudar={setAba} />
      {falha && (
        <div className="mb-4">
          <Aviso tom="perigo">{falha}</Aviso>
        </div>
      )}
      <fieldset disabled={!editavel} className={cx(!ABAS_FORM.includes(aba) && 'hidden')}>
        {aba === 'dados' && <Dados form={form} internos={internos} />}
        {aba === 'detalhes' && <Detalhes form={form} internos={internos} />}
        {aba === 'valores' && <Valores form={form} imovel={imovel ?? null} />}
        {aba === 'proprietarios' && internos && <Proprietarios form={form} nomes={nomesProp} aoNomear={(pid, n) => setNomesProp((x) => ({ ...x, [pid]: n }))} />}
      </fieldset>
      {aba === 'fotos' && id && <Galeria imovelId={id} editavel={pode('imoveis.editar')} />}
      {aba === 'documentos' && id && <Documentos entidade="imovel" entidadeId={id} />}
      {aba === 'historico' && id && <HistoricoImovel imovelId={id} />}

      <Confirmacao
        aberto={excluir}
        titulo="Excluir imóvel"
        perigo
        exigirMotivo
        textoConfirmar="Excluir"
        mensagem="O imóvel deixa de aparecer nas consultas. A exclusão é lógica e permanece no histórico e na auditoria. Imóveis alugados, reservados ou em negociação não podem ser excluídos."
        aoFechar={() => setExcluir(false)}
        aoConfirmar={async (motivo) => {
          await rpc('imoveis.excluir', { id: id!, motivo })
          toast.sucesso('Imóvel excluído.')
          void qc.invalidateQueries({ queryKey: ['imoveis'] })
          nav('/imoveis')
        }}
      />
    </>
  )
}

function Dados({ form, internos }: { form: UseFormReturn<ImovelInput>; internos: boolean }) {
  const { register, formState } = form
  const e = formState.errors
  return (
    <div className="grid grid-cols-3 gap-6">
      <Cartao titulo="Identificação" className="col-span-1">
        <div className="space-y-3">
          <Campo rotulo="Tipo" obrigatorio>{(i) => <Selecao id={i} opcoes={TIPOS_IMOVEL} {...register('tipo')} />}</Campo>
          <Campo rotulo="Finalidade" obrigatorio>{(i) => <Selecao id={i} opcoes={FINALIDADES_IMOVEL} {...register('finalidade')} />}</Campo>
          {internos && (
            <>
              <Campo rotulo="Matrícula" erro={erroDe(e, 'matricula')}>{(i) => <Entrada id={i} {...register('matricula')} />}</Campo>
              <Campo rotulo="Cartório de registro" erro={erroDe(e, 'cartorio')}>{(i) => <Entrada id={i} placeholder="Ex.: 1º CRI de Campinas" {...register('cartorio')} />}</Campo>
              <Campo rotulo="Inscrição municipal / IPTU">{(i) => <Entrada id={i} {...register('inscricaoMunicipal')} />}</Campo>
            </>
          )}
        </div>
      </Cartao>
      <Cartao titulo="Endereço" className="col-span-2">
        <div className="grid grid-cols-12 gap-3">
          <Campo rotulo="CEP" obrigatorio className="col-span-3" erro={erroDe(e, 'cep')}>{(i) => <Entrada id={i} placeholder="00000-000" {...register('cep')} />}</Campo>
          <Campo rotulo="Logradouro" obrigatorio className="col-span-7" erro={erroDe(e, 'logradouro')}>{(i) => <Entrada id={i} {...register('logradouro')} />}</Campo>
          <Campo rotulo="Número" obrigatorio className="col-span-2" erro={erroDe(e, 'numero')}>{(i) => <Entrada id={i} {...register('numero')} />}</Campo>
          <Campo rotulo="Complemento" className="col-span-4">{(i) => <Entrada id={i} placeholder="Apto, bloco, lote…" {...register('complemento')} />}</Campo>
          <Campo rotulo="Bairro" obrigatorio className="col-span-3" erro={erroDe(e, 'bairro')}>{(i) => <Entrada id={i} {...register('bairro')} />}</Campo>
          <Campo rotulo="Cidade" obrigatorio className="col-span-3" erro={erroDe(e, 'cidade')}>{(i) => <Entrada id={i} {...register('cidade')} />}</Campo>
          <Campo rotulo="UF" className="col-span-2">{(i) => <Selecao id={i} opcoes={UFS.map((u) => [u, u] as [string, string])} {...register('uf')} />}</Campo>
        </div>
      </Cartao>
    </div>
  )
}

function Detalhes({ form, internos }: { form: UseFormReturn<ImovelInput>; internos: boolean }) {
  const { register, formState, watch, setValue } = form
  const e = formState.errors
  const { data: caracs } = useQuery({ queryKey: ['caracteristicas'], queryFn: () => rpc('imoveis.caracteristicas') })
  const marcadas = watch('caracteristicas') ?? []
  const grupos = useMemo(() => {
    const m = new Map<string, { id: number; nome: string }[]>()
    caracs?.forEach((c) => m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]))
    return [...m.entries()]
  }, [caracs])
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="space-y-6">
        <Cartao titulo="Cômodos e áreas">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Dormitórios" erro={erroDe(e, 'dormitorios')}>{(i) => <Entrada id={i} type="number" min={0} {...register('dormitorios')} />}</Campo>
            <Campo rotulo="Suítes" erro={erroDe(e, 'suites')}>{(i) => <Entrada id={i} type="number" min={0} {...register('suites')} />}</Campo>
            <Campo rotulo="Banheiros" erro={erroDe(e, 'banheiros')}>{(i) => <Entrada id={i} type="number" min={0} {...register('banheiros')} />}</Campo>
            <Campo rotulo="Vagas" erro={erroDe(e, 'vagas')}>{(i) => <Entrada id={i} type="number" min={0} {...register('vagas')} />}</Campo>
            <Campo rotulo="Área construída" erro={erroDe(e, 'areaConstruida')}>{(i) => <CampoSufixo id={i} sufixo="m²" {...register('areaConstruida')} />}</Campo>
            <Campo rotulo="Área do terreno" erro={erroDe(e, 'areaTerreno')}>{(i) => <CampoSufixo id={i} sufixo="m²" {...register('areaTerreno')} />}</Campo>
          </div>
        </Cartao>
        {internos && (
          <Cartao titulo="Observações internas">
            <AreaTexto rows={4} placeholder="Não aparecem na ficha comercial (chaves, horários de visita, restrições…)" {...register('observacoesInternas')} />
          </Cartao>
        )}
      </div>
      <div className="col-span-2 space-y-6">
        <Cartao titulo="Descrição comercial">
          <AreaTexto rows={6} placeholder="Texto usado na ficha do imóvel e, futuramente, em portais e site." {...register('descricaoComercial')} />
        </Cartao>
        <Cartao titulo={`Características (${marcadas.length})`}>
          <div className="grid grid-cols-3 gap-6">
            {grupos.map(([grupo, itens]) => (
              <div key={grupo}>
                <div className="mb-2 text-xs font-semibold tracking-wide text-texto-2 uppercase">{grupo}</div>
                <div className="space-y-1.5">
                  {itens.map((c) => (
                    <Caixa
                      key={c.id}
                      rotulo={c.nome}
                      checked={marcadas.includes(c.id)}
                      onChange={(ev) => setValue('caracteristicas', ev.target.checked ? [...marcadas, c.id] : marcadas.filter((x) => x !== c.id), { shouldDirty: true })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Cartao>
      </div>
    </div>
  )
}

function Valores({ form, imovel }: { form: UseFormReturn<ImovelInput>; imovel: ImovelDetalhe | null }) {
  const { register, formState, watch, setValue } = form
  const e = formState.errors
  const { pode } = useSessao()
  const [situacao, setSituacao] = useState<ImovelDetalhe['ofertas'][number] | null>(null)
  const { data: corretores } = useQuery({ queryKey: ['corretores'], queryFn: () => rpc('pessoas.listar', { papel: 'CORRETOR', porPagina: 200, situacao: 'ATIVO' }) })
  const corretorAtual = imovel?.corretor
  const opcoesCorretor = new Map((corretores?.itens ?? []).map((c) => [String(c.id), c.nome]))
  if (corretorAtual) opcoesCorretor.set(String(corretorAtual.id), corretorAtual.nome)

  const cartaoOferta = (m: Modalidade) => {
    const k = m === 'VENDA' ? 'venda' : 'locacao'
    const ativa = watch(`${k}.ativa`)
    const valor = paraCentavos(watch(`${k}.valor`) as string)
    const comissao = paraPontosBase(watch(`${k}.comissao`) as string)
    const salva = imovel?.ofertas.find((o) => o.modalidade === m)
    return (
      <Cartao
        titulo={m === 'VENDA' ? 'Venda' : 'Locação'}
        acoes={
          <>
            {salva && <SeloSituacao situacao={salva.situacao} />}
            {salva && pode('imoveis.situacao') && (
              <Botao tamanho="sm" onClick={() => setSituacao(salva)}>
                Alterar situação
              </Botao>
            )}
          </>
        }
      >
        <div className="space-y-3">
          <Caixa
            rotulo={`Ofertar para ${m === 'VENDA' ? 'venda' : 'locação'}`}
            descricao={salva && salva.situacao !== 'INATIVO' && !ativa ? 'Ao salvar, a oferta será inativada.' : undefined}
            checked={!!ativa}
            onChange={(ev) => setValue(`${k}.ativa`, ev.target.checked, { shouldDirty: true })}
          />
          <div className={cx('grid grid-cols-2 gap-3', !ativa && 'opacity-50')}>
            <Campo rotulo={m === 'VENDA' ? 'Valor de venda' : 'Aluguel mensal'} obrigatorio={!!ativa} erro={erroDe(e, `${k}.valor`)}>
              {(i) => <CampoMoeda id={i} disabled={!ativa} {...register(`${k}.valor`)} />}
            </Campo>
            <Campo rotulo={m === 'VENDA' ? 'Comissão prevista' : 'Taxa de intermediação prevista'} erro={erroDe(e, `${k}.comissao`)}>
              {(i) => <CampoSufixo id={i} sufixo="%" disabled={!ativa} {...register(`${k}.comissao`)} />}
            </Campo>
          </div>
          {ativa && valor != null && comissao != null && (
            <div className="numeros text-xs text-texto-2">
              Comissão estimada: <strong className="text-texto">{formatarMoeda(aplicarPercentual(valor, comissao))}</strong>
              {m === 'LOCACAO' && ' (sobre um aluguel; regras da taxa de administração serão definidas no contrato — Fase 3)'}
            </div>
          )}
          {salva && <div className="text-xs text-texto-3">Situação desde {dataHora(salva.situacaoDesde)}</div>}
        </div>
      </Cartao>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {cartaoOferta('VENDA')}
      {cartaoOferta('LOCACAO')}
      <Cartao titulo="Encargos e responsável">
        <div className="space-y-3">
          <Campo rotulo="Condomínio (mensal)" erro={erroDe(e, 'condominio')}>{(i) => <CampoMoeda id={i} {...register('condominio')} />}</Campo>
          <Campo rotulo="IPTU (anual)" erro={erroDe(e, 'iptuAnual')}>{(i) => <CampoMoeda id={i} {...register('iptuAnual')} />}</Campo>
          <Campo rotulo="Corretor responsável" erro={erroDe(e, 'corretorId')}>
            {(i) => (
              <Selecao
                id={i}
                opcoes={[...opcoesCorretor.entries()]}
                vazio="Nenhum"
                value={watch('corretorId') ? String(watch('corretorId')) : ''}
                onChange={(ev) => setValue('corretorId', ev.target.value ? Number(ev.target.value) : null, { shouldDirty: true })}
              />
            )}
          </Campo>
        </div>
      </Cartao>
      {situacao && <DialogoSituacao oferta={situacao} imovelId={imovel!.id} aoFechar={() => setSituacao(null)} />}
    </div>
  )
}
