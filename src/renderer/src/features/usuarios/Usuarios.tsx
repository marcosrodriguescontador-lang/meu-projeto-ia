import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Trash2, Unlock } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { PerfilDto, UsuarioDto } from '@shared/dto'
import { GRUPOS_PERMISSAO, PERMISSOES, type Permissao } from '@shared/permissoes'
import { criarUsuarioSchema, perfilSchema, POLITICA_SENHA, senhaSchema, usuarioSchema, type CriarUsuarioInput, type PerfilInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Abas, Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Confirmacao, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { dataHora } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { SeletorPessoa } from '@/features/pessoas/BuscaPessoa'

export function Usuarios() {
  const [aba, setAba] = useState<'usuarios' | 'perfis'>('usuarios')
  return (
    <>
      <CabecalhoPagina titulo="Usuários e perfis" subtitulo="Controle de acesso por perfil. Cada usuário possui um perfil com permissões específicas." />
      <Abas
        abas={[
          ['usuarios', 'Usuários'],
          ['perfis', 'Perfis e permissões']
        ]}
        ativa={aba}
        aoMudar={setAba}
      />
      {aba === 'usuarios' ? <ListaUsuarios /> : <ListaPerfis />}
    </>
  )
}

function ListaUsuarios() {
  const { pode, sessao } = useSessao()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => rpc('usuarios.listar') })
  const { data: perfis } = useQuery({ queryKey: ['perfis'], queryFn: () => rpc('perfis.listar') })
  const [editar, setEditar] = useState<UsuarioDto | 'novo' | null>(null)
  const [senha, setSenha] = useState<UsuarioDto | null>(null)
  const atualizar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })
  const gerenciar = pode('usuarios.gerenciar')
  return (
    <Cartao
      semPadding
      titulo={`${data?.length ?? 0} usuário(s)`}
      acoes={
        gerenciar && (
          <Botao tamanho="sm" variante="primario" icone={<Plus className="size-3.5" />} onClick={() => setEditar('novo')}>
            Novo usuário
          </Botao>
        )
      }
    >
      <Tabela colunas={['Nome', 'Login', 'Perfil', 'Situação', 'Último acesso', '']} vazio={data?.length === 0} carregando={isLoading}>
        {data?.map((u) => {
          const bloqueado = u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date()
          return (
            <tr key={u.id}>
              <td className="font-medium">
                {u.nome} {u.id === sessao?.usuario.id && <Selo>você</Selo>}
              </td>
              <td className="text-texto-2">{u.login}</td>
              <td>{u.perfilNome}</td>
              <td>
                <div className="flex gap-1">
                  {!u.ativo ? <Selo>Inativo</Selo> : bloqueado ? <Selo tom="perigo">Bloqueado</Selo> : <Selo tom="destaque">Ativo</Selo>}
                  {u.deveTrocarSenha && <Selo tom="alerta">Troca de senha pendente</Selo>}
                </div>
              </td>
              <td className="numeros text-texto-2">{dataHora(u.ultimoAcessoEm)}</td>
              <td className="text-right whitespace-nowrap">
                {gerenciar && (
                  <>
                    {bloqueado && (
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        icone={<Unlock className="size-3.5" />}
                        onClick={async () => {
                          try {
                            await rpc('usuarios.desbloquear', { id: u.id })
                            toast.sucesso('Usuário desbloqueado.')
                            await atualizar()
                          } catch (e) {
                            toast.erro(e)
                          }
                        }}
                      >
                        Desbloquear
                      </Botao>
                    )}
                    <Botao tamanho="sm" variante="fantasma" icone={<KeyRound className="size-3.5" />} onClick={() => setSenha(u)} title="Redefinir senha" />
                    <Botao tamanho="sm" variante="fantasma" icone={<Pencil className="size-3.5" />} onClick={() => setEditar(u)} title="Editar" />
                  </>
                )}
              </td>
            </tr>
          )
        })}
      </Tabela>
      {editar && perfis && <FormUsuario usuario={editar === 'novo' ? null : editar} perfis={perfis} aoFechar={() => setEditar(null)} aoSalvar={atualizar} />}
      {senha && <RedefinirSenha usuario={senha} aoFechar={() => setSenha(null)} aoSalvar={atualizar} />}
    </Cartao>
  )
}

function FormUsuario({ usuario, perfis, aoFechar, aoSalvar }: { usuario: UsuarioDto | null; perfis: PerfilDto[]; aoFechar: () => void; aoSalvar: () => void }) {
  const toast = useToast()
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, setError, watch, setValue } = useForm<CriarUsuarioInput>({
    resolver: resolverZod(usuario ? usuarioSchema : criarUsuarioSchema),
    defaultValues: { nome: usuario?.nome ?? '', login: usuario?.login ?? '', email: usuario?.email ?? '', perfilId: usuario?.perfilId ?? perfis.find((p) => p.nome === 'Atendimento')?.id ?? perfis[0]!.id, pessoaId: usuario?.pessoaId ?? null, ativo: usuario?.ativo ?? true, senhaInicial: '' }
  })
  const [pessoa, setPessoa] = useState(usuario?.pessoaId ? { id: usuario.pessoaId, nome: usuario.pessoaNome ?? '' } : null)
  const e = formState.errors
  const enviar = handleSubmit(async (v) => {
    setFalha(null)
    try {
      const dados = { ...v, perfilId: Number(v.perfilId) }
      if (usuario) {
        const { senhaInicial: _s, ...resto } = dados
        await rpc('usuarios.atualizar', { id: usuario.id, dados: resto })
      } else await rpc('usuarios.criar', dados)
      toast.sucesso('Usuário salvo.')
      aoSalvar()
      aoFechar()
    } catch (err) {
      setFalha(aplicarErrosServidor(err, setError))
    }
  })
  return (
    <Dialogo
      aberto
      titulo={usuario ? 'Editar usuário' : 'Novo usuário'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={enviar} carregando={formState.isSubmitting}>
            Salvar
          </Botao>
        </>
      }
    >
      <form className="space-y-3" onSubmit={enviar}>
        <Campo rotulo="Nome" obrigatorio erro={erroDe(e, 'nome')}>{(id) => <Entrada id={id} {...register('nome')} />}</Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Login" obrigatorio erro={erroDe(e, 'login')}>{(id) => <Entrada id={id} {...register('login')} />}</Campo>
          <Campo rotulo="Perfil" obrigatorio>{(id) => <Selecao id={id} opcoes={perfis.map((p) => [String(p.id), p.nome] as [string, string])} {...register('perfilId', { valueAsNumber: true })} />}</Campo>
        </div>
        <Campo rotulo="E-mail" erro={erroDe(e, 'email')}>{(id) => <Entrada id={id} type="email" {...register('email')} />}</Campo>
        <div>
          <div className="mb-1 text-xs font-medium text-texto-2">Pessoa vinculada (corretor)</div>
          <SeletorPessoa valor={pessoa} aoMudar={(p) => (setPessoa(p), setValue('pessoaId', p?.id ?? null))} />
          <div className="mt-1 text-xs text-texto-3">Para corretores: liga o usuário ao cadastro do corretor, limitando leads, negócios e comissões à própria carteira.</div>
        </div>
        {!usuario && (
          <Campo rotulo="Senha inicial (temporária)" obrigatorio erro={erroDe(e, 'senhaInicial')} ajuda={`${POLITICA_SENHA} O usuário deverá trocá-la no primeiro acesso.`}>
            {(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('senhaInicial')} />}
          </Campo>
        )}
        <Caixa rotulo="Usuário ativo" checked={!!watch('ativo')} onChange={(ev) => setValue('ativo', ev.target.checked)} />
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </form>
    </Dialogo>
  )
}

function RedefinirSenha({ usuario, aoFechar, aoSalvar }: { usuario: UsuarioDto; aoFechar: () => void; aoSalvar: () => void }) {
  const toast = useToast()
  const [senha, setSenha] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const valida = senhaSchema.safeParse(senha)
  return (
    <Dialogo
      aberto
      titulo={`Redefinir senha de ${usuario.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            disabled={!valida.success}
            onClick={async () => {
              try {
                await rpc('usuarios.redefinirSenha', { id: usuario.id, senhaTemporaria: senha })
                toast.sucesso('Senha temporária definida.')
                aoSalvar()
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Definir senha temporária
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-2">O usuário será obrigado a trocar a senha no próximo acesso. O bloqueio por tentativas também é removido.</p>
        <Campo rotulo="Senha temporária" ajuda={POLITICA_SENHA}>{(id) => <Entrada id={id} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />}</Campo>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

function ListaPerfis() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['perfis'], queryFn: () => rpc('perfis.listar') })
  const [editar, setEditar] = useState<PerfilDto | 'novo' | null>(null)
  const [excluir, setExcluir] = useState<PerfilDto | null>(null)
  const gerenciar = pode('perfis.gerenciar')
  return (
    <Cartao
      semPadding
      titulo="Perfis"
      acoes={
        gerenciar && (
          <Botao tamanho="sm" variante="primario" icone={<Plus className="size-3.5" />} onClick={() => setEditar('novo')}>
            Novo perfil
          </Botao>
        )
      }
    >
      <Tabela colunas={['Perfil', 'Descrição', 'Permissões', 'Usuários', '']} carregando={isLoading}>
        {data?.map((p) => (
          <tr key={p.id}>
            <td className="font-medium">
              {p.nome} {p.sistema && <Selo tom="escuro">Protegido</Selo>}
            </td>
            <td className="text-texto-2">{p.descricao}</td>
            <td className="numeros">
              {p.permissoes.length} de {Object.keys(PERMISSOES).length}
            </td>
            <td className="numeros">{p.usuarios}</td>
            <td className="text-right whitespace-nowrap">
              {gerenciar && !p.sistema && (
                <>
                  <Botao tamanho="sm" variante="fantasma" icone={<Pencil className="size-3.5" />} onClick={() => setEditar(p)} />
                  <Botao tamanho="sm" variante="fantasma" icone={<Trash2 className="size-3.5" />} onClick={() => setExcluir(p)} />
                </>
              )}
              {(!gerenciar || p.sistema) && (
                <Botao tamanho="sm" variante="fantasma" onClick={() => setEditar(p)}>
                  Ver
                </Botao>
              )}
            </td>
          </tr>
        ))}
      </Tabela>
      {editar && <FormPerfil perfil={editar === 'novo' ? null : editar} somenteLeitura={!gerenciar || (editar !== 'novo' && editar.sistema)} aoFechar={() => setEditar(null)} aoSalvar={() => qc.invalidateQueries({ queryKey: ['perfis'] })} />}
      <Confirmacao
        aberto={!!excluir}
        titulo="Excluir perfil"
        perigo
        textoConfirmar="Excluir"
        mensagem={`Excluir o perfil "${excluir?.nome}"?`}
        aoFechar={() => setExcluir(null)}
        aoConfirmar={async () => {
          await rpc('perfis.excluir', { id: excluir!.id })
          toast.sucesso('Perfil excluído.')
          await qc.invalidateQueries({ queryKey: ['perfis'] })
        }}
      />
    </Cartao>
  )
}

function FormPerfil({ perfil, somenteLeitura, aoFechar, aoSalvar }: { perfil: PerfilDto | null; somenteLeitura: boolean; aoFechar: () => void; aoSalvar: () => void }) {
  const toast = useToast()
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, setError, watch, setValue } = useForm<PerfilInput>({ resolver: resolverZod(perfilSchema), defaultValues: { nome: perfil?.nome ?? '', descricao: perfil?.descricao ?? '', permissoes: perfil?.permissoes ?? [] } })
  const marcadas = new Set(watch('permissoes'))
  const grupos = Object.entries(GRUPOS_PERMISSAO).map(([prefixo, titulo]) => ({ titulo, itens: (Object.entries(PERMISSOES) as [Permissao, string][]).filter(([k]) => k.startsWith(`${prefixo}.`)) }))
  const enviar = handleSubmit(async (v) => {
    try {
      if (perfil) await rpc('perfis.atualizar', { id: perfil.id, dados: v })
      else await rpc('perfis.criar', v)
      toast.sucesso('Perfil salvo.')
      aoSalvar()
      aoFechar()
    } catch (err) {
      setFalha(aplicarErrosServidor(err, setError))
    }
  })
  return (
    <Dialogo
      aberto
      largura="max-w-2xl"
      titulo={perfil ? `Perfil ${perfil.nome}` : 'Novo perfil'}
      aoFechar={aoFechar}
      rodape={
        !somenteLeitura && (
          <>
            <Botao variante="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={enviar} carregando={formState.isSubmitting}>
              Salvar
            </Botao>
          </>
        )
      }
    >
      <fieldset disabled={somenteLeitura} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome" obrigatorio erro={erroDe(formState.errors, 'nome')}>{(id) => <Entrada id={id} {...register('nome')} />}</Campo>
          <Campo rotulo="Descrição">{(id) => <Entrada id={id} {...register('descricao')} />}</Campo>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="mb-2 text-xs font-semibold tracking-wide text-texto-2 uppercase">{g.titulo}</div>
              <div className="space-y-1.5">
                {g.itens.map(([k, r]) => (
                  <Caixa
                    key={k}
                    rotulo={r}
                    checked={marcadas.has(k)}
                    onChange={(ev) => {
                      const s = new Set(marcadas)
                      if (ev.target.checked) s.add(k)
                      else s.delete(k)
                      setValue('permissoes', [...s])
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </fieldset>
    </Dialogo>
  )
}
