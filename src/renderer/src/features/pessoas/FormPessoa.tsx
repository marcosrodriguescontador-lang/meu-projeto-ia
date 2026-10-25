import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { UFS } from '@shared/documentos'
import type { PessoaDetalhe } from '@shared/dto'
import { ESTADOS_CIVIS, PAPEIS, pessoaSchema, REGIMES_BENS, RELACOES, SITUACOES_PESSOA, TIPOS_CONTATO, TIPOS_ENDERECO, type Papel, type PessoaInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Confirmacao, Entrada, Selecao, useToast, cx } from '@/components/ui'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { dataHora, formatarDocumento } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { BuscaPessoa } from './BuscaPessoa'
import { DadosBancarios } from './DadosBancarios'
import { Documentos } from '@/features/comum/Documentos'
import { Historico } from './Historico'
import { ImoveisDaPessoa } from './ImoveisDaPessoa'

type Aba = 'dados' | 'enderecos' | 'contatos' | 'relacoes' | 'bancarios' | 'imoveis' | 'documentos' | 'historico'

const VAZIO: PessoaInput = {
  tipo: 'PF',
  nome: '',
  nomeFantasia: '',
  documento: '',
  rgIe: '',
  orgaoEmissor: '',
  nascimento: '',
  nacionalidade: 'Brasileira',
  estadoCivil: '',
  regimeBens: '',
  profissao: '',
  creci: '',
  situacao: 'ATIVO',
  observacoes: '',
  papeis: [],
  enderecos: [],
  contatos: [],
  relacoes: []
}

function paraFormulario(p: PessoaDetalhe): PessoaInput {
  const s = (v: string | null | undefined) => v ?? ''
  return {
    tipo: p.tipo,
    nome: p.nome,
    nomeFantasia: s(p.nomeFantasia),
    documento: formatarDocumento(p.documento),
    rgIe: s(p.rgIe),
    orgaoEmissor: s(p.orgaoEmissor),
    nascimento: s(p.nascimento),
    nacionalidade: s(p.nacionalidade),
    estadoCivil: (p.estadoCivil ?? '') as never,
    regimeBens: (p.regimeBens ?? '') as never,
    profissao: s(p.profissao),
    creci: s(p.creci),
    situacao: p.situacao,
    observacoes: s(p.observacoes),
    papeis: p.papeis,
    enderecos: p.enderecos.map((e) => ({ ...e, complemento: s(e.complemento) })),
    contatos: p.contatos.map((c) => ({ ...c, nomeContato: s(c.nomeContato) })),
    relacoes: p.relacoes.map((r) => ({ pessoaId: r.pessoaId, tipo: r.tipo as keyof typeof RELACOES }))
  }
}

export function FormPessoa() {
  const { id: idParam } = useParams()
  const id = idParam ? Number(idParam) : null
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = useSessao()
  const [aba, setAba] = useState<Aba>('dados')
  const [falha, setFalha] = useState<string | null>(null)
  const [excluir, setExcluir] = useState(false)
  const [duplicado, setDuplicado] = useState<{ id: number; nome: string } | null>(null)
  const [nomesRelacoes, setNomesRelacoes] = useState<Record<number, string>>({})

  const { data: pessoa } = useQuery({ queryKey: ['pessoa', id], queryFn: () => rpc('pessoas.obter', { id: id! }), enabled: !!id })
  const form = useForm<PessoaInput>({ resolver: resolverZod(pessoaSchema), defaultValues: VAZIO })
  const { register, handleSubmit, formState, watch, reset, setValue, setError } = form
  const e = formState.errors
  const editavel = id ? pode('pessoas.editar') : pode('pessoas.criar')

  useEffect(() => {
    if (pessoa) {
      reset(paraFormulario(pessoa))
      setNomesRelacoes(Object.fromEntries(pessoa.relacoes.map((r) => [r.pessoaId, r.nome])))
    }
  }, [pessoa, reset])

  const tipo = watch('tipo')
  const papeis = watch('papeis') ?? []
  const estadoCivil = watch('estadoCivil')

  const salvar = handleSubmit(
    async (v) => {
      setFalha(null)
      try {
        if (id) {
          await rpc('pessoas.atualizar', { id, dados: v })
          toast.sucesso('Cadastro atualizado.')
          await qc.invalidateQueries({ queryKey: ['pessoa', id] })
        } else {
          const r = await rpc('pessoas.criar', v)
          toast.sucesso('Pessoa cadastrada.')
          nav(`/pessoas/${r.id}`, { replace: true })
        }
        void qc.invalidateQueries({ queryKey: ['pessoas'] })
      } catch (err) {
        setFalha(aplicarErrosServidor(err, setError))
      }
    },
    (erros) => {
      if (erros.enderecos) setAba('enderecos')
      else if (erros.contatos) setAba('contatos')
      else setAba('dados')
    }
  )

  const verificarDocumento = async (doc: string) => {
    if (doc.replace(/\W/g, '').length < 11) return setDuplicado(null)
    setDuplicado(await rpc('pessoas.verificarDocumento', { documento: doc, ignorarId: id ?? undefined }))
  }

  const abas: [Aba, string, number?][] = [
    ['dados', 'Dados gerais'],
    ['enderecos', 'Endereços', watch('enderecos')?.length],
    ['contatos', 'Contatos', watch('contatos')?.length],
    ['relacoes', 'Relações', watch('relacoes')?.length]
  ]
  if (id) {
    if (pessoa?.dadosBancarios) abas.push(['bancarios', 'Dados bancários', pessoa.dadosBancarios.length])
    if (pessoa?.papeis.includes('PROPRIETARIO') && pode('imoveis.ver') && pode('imoveis.dados_internos.ver')) abas.push(['imoveis', 'Imóveis'])
    if (pode('pessoas.documentos.ver')) abas.push(['documentos', 'Documentos'])
    abas.push(['historico', 'Histórico'])
  }

  return (
    <>
      <CabecalhoPagina
        voltar={
          <Link to="/pessoas" className="mb-1 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
            <ArrowLeft className="size-3" /> Pessoas
          </Link>
        }
        titulo={id ? (pessoa?.nome ?? 'Carregando…') : 'Nova pessoa'}
        subtitulo={pessoa ? `Código ${pessoa.codigo} · cadastrado em ${dataHora(pessoa.criadoEm)} · atualizado em ${dataHora(pessoa.atualizadoEm)}` : undefined}
        acoes={
          <>
            {id && pode('pessoas.excluir') && (
              <Botao variante="fantasma" icone={<Trash2 className="size-4" />} onClick={() => setExcluir(true)}>
                Excluir
              </Botao>
            )}
            {editavel && ['dados', 'enderecos', 'contatos', 'relacoes'].includes(aba) && (
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

      <fieldset disabled={!editavel} className={cx(!['dados', 'enderecos', 'contatos', 'relacoes'].includes(aba) && 'hidden')}>
        {aba === 'dados' && (
          <div className="grid grid-cols-3 gap-6">
            <Cartao titulo="Identificação" className="col-span-2">
              <div className="grid grid-cols-6 gap-4">
                <Campo rotulo="Tipo" className="col-span-2" erro={erroDe(e, 'tipo')}>
                  {(i) => <Selecao id={i} opcoes={{ PF: 'Pessoa física', PJ: 'Pessoa jurídica' }} disabled={!!id} {...register('tipo')} />}
                </Campo>
                <Campo rotulo={tipo === 'PF' ? 'CPF' : 'CNPJ'} obrigatorio className="col-span-2" erro={erroDe(e, 'documento')}>
                  {(i) => <Entrada id={i} invalido={!!erroDe(e, 'documento')} {...register('documento', { onBlur: (ev) => void verificarDocumento(ev.target.value) })} />}
                </Campo>
                <Campo rotulo="Situação" className="col-span-2">
                  {(i) => <Selecao id={i} opcoes={SITUACOES_PESSOA} {...register('situacao')} />}
                </Campo>
                {duplicado && (
                  <div className="col-span-6">
                    <Aviso tom="alerta">
                      Documento já cadastrado para <strong>{duplicado.nome}</strong>.{' '}
                      <Link className="underline" to={`/pessoas/${duplicado.id}`}>
                        Abrir cadastro existente
                      </Link>{' '}
                      e adicionar o novo papel, em vez de duplicar.
                    </Aviso>
                  </div>
                )}
                <Campo rotulo={tipo === 'PF' ? 'Nome completo' : 'Razão social'} obrigatorio className="col-span-4" erro={erroDe(e, 'nome')}>
                  {(i) => <Entrada id={i} invalido={!!erroDe(e, 'nome')} {...register('nome')} />}
                </Campo>
                <Campo rotulo={tipo === 'PF' ? 'Nome social / apelido' : 'Nome fantasia'} className="col-span-2">
                  {(i) => <Entrada id={i} {...register('nomeFantasia')} />}
                </Campo>
                <Campo rotulo={tipo === 'PF' ? 'RG' : 'Inscrição estadual'} className="col-span-2">
                  {(i) => <Entrada id={i} {...register('rgIe')} />}
                </Campo>
                {tipo === 'PF' ? (
                  <>
                    <Campo rotulo="Órgão emissor" className="col-span-2">
                      {(i) => <Entrada id={i} {...register('orgaoEmissor')} />}
                    </Campo>
                    <Campo rotulo="Nascimento" className="col-span-2" erro={erroDe(e, 'nascimento')}>
                      {(i) => <Entrada id={i} type="date" {...register('nascimento')} />}
                    </Campo>
                    <Campo rotulo="Nacionalidade" className="col-span-2">
                      {(i) => <Entrada id={i} {...register('nacionalidade')} />}
                    </Campo>
                    <Campo rotulo="Estado civil" className="col-span-2">
                      {(i) => <Selecao id={i} opcoes={ESTADOS_CIVIS} vazio="—" {...register('estadoCivil', { onChange: (ev) => !['CASADO', 'UNIAO_ESTAVEL'].includes(ev.target.value) && setValue('regimeBens', '') })} />}
                    </Campo>
                    <Campo rotulo="Regime de bens" className="col-span-2" erro={erroDe(e, 'regimeBens')}>
                      {(i) => <Selecao id={i} opcoes={REGIMES_BENS} vazio="—" disabled={!['CASADO', 'UNIAO_ESTAVEL'].includes(estadoCivil ?? '')} {...register('regimeBens')} />}
                    </Campo>
                    <Campo rotulo="Profissão" className="col-span-3">
                      {(i) => <Entrada id={i} {...register('profissao')} />}
                    </Campo>
                  </>
                ) : null}
                <Campo rotulo="Observações" className="col-span-6">
                  {(i) => <AreaTexto id={i} rows={3} {...register('observacoes')} />}
                </Campo>
              </div>
            </Cartao>
            <Cartao titulo="Papéis no sistema">
              <div className="space-y-2.5">
                {(Object.entries(PAPEIS) as [Papel, string][]).map(([k, r]) => (
                  <Caixa
                    key={k}
                    rotulo={r}
                    checked={papeis.includes(k)}
                    onChange={(ev) =>
                      setValue(
                        'papeis',
                        ev.target.checked ? [...papeis, k] : papeis.filter((p) => p !== k),
                        { shouldValidate: formState.isSubmitted }
                      )
                    }
                  />
                ))}
                {erroDe(e, 'papeis') && <div className="text-xs text-perigo">{erroDe(e, 'papeis')}</div>}
                {papeis.includes('CORRETOR') && (
                  <Campo rotulo="CRECI do corretor" obrigatorio erro={erroDe(e, 'creci')}>
                    {(i) => <Entrada id={i} {...register('creci')} />}
                  </Campo>
                )}
              </div>
            </Cartao>
          </div>
        )}
        {aba === 'enderecos' && <Enderecos form={form} />}
        {aba === 'contatos' && <Contatos form={form} />}
        {aba === 'relacoes' && <Relacoes form={form} nomes={nomesRelacoes} aoNomear={(pid, n) => setNomesRelacoes((x) => ({ ...x, [pid]: n }))} idAtual={id} />}
      </fieldset>

      {aba === 'bancarios' && id && pessoa?.dadosBancarios && <DadosBancarios pessoaId={id} itens={pessoa.dadosBancarios} titular={{ nome: pessoa.nome, documento: pessoa.documento }} />}
      {aba === 'imoveis' && id && <ImoveisDaPessoa pessoaId={id} />}
      {aba === 'documentos' && id && <Documentos entidade="pessoa" entidadeId={id} />}
      {aba === 'historico' && id && <Historico pessoaId={id} />}

      <Confirmacao
        aberto={excluir}
        titulo="Excluir pessoa"
        perigo
        exigirMotivo
        textoConfirmar="Excluir"
        mensagem={
          <>
            O cadastro de <strong>{pessoa?.nome}</strong> será removido das consultas. A exclusão é lógica: os dados permanecem no histórico e na auditoria.
          </>
        }
        aoFechar={() => setExcluir(false)}
        aoConfirmar={async (motivo) => {
          await rpc('pessoas.excluir', { id: id!, motivo })
          toast.sucesso('Pessoa excluída.')
          void qc.invalidateQueries({ queryKey: ['pessoas'] })
          nav('/pessoas')
        }}
      />
    </>
  )
}

function Enderecos({ form }: { form: UseFormReturn<PessoaInput> }) {
  const { control, register, formState, setValue, watch } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'enderecos' })
  const e = formState.errors
  return (
    <Cartao
      titulo="Endereços"
      acoes={
        <Botao tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => append({ tipo: 'RESIDENCIAL', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SP', principal: fields.length === 0 })}>
          Adicionar endereço
        </Botao>
      }
    >
      {fields.length === 0 && <div className="text-sm text-texto-3">Nenhum endereço cadastrado.</div>}
      {erroDe(e, 'enderecos.root') || (e.enderecos as { message?: string } | undefined)?.message ? <Aviso tom="perigo">{(e.enderecos as { message?: string }).message}</Aviso> : null}
      <div className="space-y-5">
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-12 gap-3 border-b border-borda pb-5 last:border-0 last:pb-0">
            <Campo rotulo="Tipo" className="col-span-2">
              {(id) => <Selecao id={id} opcoes={TIPOS_ENDERECO} {...register(`enderecos.${i}.tipo`)} />}
            </Campo>
            <Campo rotulo="CEP" obrigatorio className="col-span-2" erro={erroDe(e, `enderecos.${i}.cep`)}>
              {(id) => <Entrada id={id} placeholder="00000-000" {...register(`enderecos.${i}.cep`)} />}
            </Campo>
            <Campo rotulo="Logradouro" obrigatorio className="col-span-6" erro={erroDe(e, `enderecos.${i}.logradouro`)}>
              {(id) => <Entrada id={id} {...register(`enderecos.${i}.logradouro`)} />}
            </Campo>
            <Campo rotulo="Número" obrigatorio className="col-span-2" erro={erroDe(e, `enderecos.${i}.numero`)}>
              {(id) => <Entrada id={id} {...register(`enderecos.${i}.numero`)} />}
            </Campo>
            <Campo rotulo="Complemento" className="col-span-3">
              {(id) => <Entrada id={id} {...register(`enderecos.${i}.complemento`)} />}
            </Campo>
            <Campo rotulo="Bairro" obrigatorio className="col-span-3" erro={erroDe(e, `enderecos.${i}.bairro`)}>
              {(id) => <Entrada id={id} {...register(`enderecos.${i}.bairro`)} />}
            </Campo>
            <Campo rotulo="Cidade" obrigatorio className="col-span-3" erro={erroDe(e, `enderecos.${i}.cidade`)}>
              {(id) => <Entrada id={id} {...register(`enderecos.${i}.cidade`)} />}
            </Campo>
            <Campo rotulo="UF" className="col-span-1">
              {(id) => <Selecao id={id} opcoes={UFS.map((u) => [u, u] as [string, string])} {...register(`enderecos.${i}.uf`)} />}
            </Campo>
            <div className="col-span-2 flex items-end justify-between gap-2 pb-2">
              <Caixa
                rotulo="Principal"
                checked={!!watch(`enderecos.${i}.principal`)}
                onChange={(ev) => fields.forEach((_, j) => setValue(`enderecos.${j}.principal`, ev.target.checked ? j === i : false))}
              />
              <button type="button" className="text-texto-3 hover:text-perigo" onClick={() => remove(i)} title="Remover">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-texto-3">A consulta automática de CEP depende de internet e será oferecida como recurso opcional; o preenchimento manual funciona offline.</p>
    </Cartao>
  )
}

function Contatos({ form }: { form: UseFormReturn<PessoaInput> }) {
  const { control, register, formState, watch, setValue } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'contatos' })
  const e = formState.errors
  return (
    <Cartao
      titulo="Contatos"
      acoes={
        <Botao tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => append({ tipo: 'CELULAR', valor: '', nomeContato: '', principal: fields.length === 0 })}>
          Adicionar contato
        </Botao>
      }
    >
      {fields.length === 0 && <div className="text-sm text-texto-3">Nenhum contato cadastrado.</div>}
      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-12 items-start gap-3">
            <Campo className="col-span-2">{(id) => <Selecao id={id} opcoes={TIPOS_CONTATO} {...register(`contatos.${i}.tipo`)} />}</Campo>
            <Campo className="col-span-4" erro={erroDe(e, `contatos.${i}.valor`)}>
              {(id) => <Entrada id={id} placeholder={watch(`contatos.${i}.tipo`) === 'EMAIL' ? 'email@exemplo.com' : '(00) 00000-0000'} {...register(`contatos.${i}.valor`)} />}
            </Campo>
            <Campo className="col-span-4">{(id) => <Entrada id={id} placeholder="Falar com (opcional)" {...register(`contatos.${i}.nomeContato`)} />}</Campo>
            <div className="col-span-2 flex h-9 items-center justify-between">
              <Caixa rotulo="Principal" checked={!!watch(`contatos.${i}.principal`)} onChange={(ev) => setValue(`contatos.${i}.principal`, ev.target.checked)} />
              <button type="button" className="text-texto-3 hover:text-perigo" onClick={() => remove(i)} title="Remover">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Cartao>
  )
}

function Relacoes({ form, nomes, aoNomear, idAtual }: { form: UseFormReturn<PessoaInput>; nomes: Record<number, string>; aoNomear: (id: number, nome: string) => void; idAtual: number | null }) {
  const { control, register } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'relacoes' })
  return (
    <Cartao titulo="Relações com outras pessoas">
      <p className="mb-4 text-sm text-texto-2">Cônjuge, representante legal, sócios e procuradores (usados nos contratos).</p>
      <div className="mb-4 space-y-2">
        {fields.map((f, i) => (
          <div key={f.id} className="flex items-center gap-3">
            <div className="flex-1 text-sm font-medium">{nomes[f.pessoaId] ?? `Pessoa #${f.pessoaId}`}</div>
            <Selecao className="w-64" opcoes={RELACOES} {...register(`relacoes.${i}.tipo`)} />
            <button type="button" className="text-texto-3 hover:text-perigo" onClick={() => remove(i)} title="Remover">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <BuscaPessoa
        ignorar={[...(idAtual ? [idAtual] : []), ...fields.map((f) => f.pessoaId)]}
        aoSelecionar={(p) => {
          aoNomear(p.id, p.nome)
          append({ pessoaId: p.id, tipo: 'CONJUGE' })
        }}
      />
    </Cartao>
  )
}
