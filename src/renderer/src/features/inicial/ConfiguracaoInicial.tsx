import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { ResumoBackup } from '@shared/dto'
import { configuracaoInicialSchema, POLITICA_SENHA, type ConfiguracaoInicialInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { TelaAcesso } from '@/features/auth/TelaAcesso'
import { Abas, Aviso, Botao, Campo, Entrada } from '@/components/ui'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { dataHora, tamanhoArquivo } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

export function ConfiguracaoInicial() {
  const [aba, setAba] = useState<'nova' | 'restaurar'>('nova')
  return (
    <TelaAcesso titulo="Bem-vindo ao STATUS ERP" subtitulo="Primeira utilização neste computador." largura="max-w-xl">
      <Abas
        abas={[
          ['nova', 'Nova instalação'],
          ['restaurar', 'Restaurar de um backup']
        ]}
        ativa={aba}
        aoMudar={setAba}
      />
      {aba === 'nova' ? <NovaInstalacao /> : <RestaurarInicial />}
    </TelaAcesso>
  )
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-5 items-center justify-center rounded-full bg-marca text-[11px] text-marca-texto">{n}</span>
        {titulo}
      </legend>
      {children}
    </fieldset>
  )
}

function NovaInstalacao() {
  const { recarregar } = useSessao()
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, setError } = useForm<ConfiguracaoInicialInput>({
    resolver: resolverZod(configuracaoInicialSchema),
    defaultValues: {
      empresa: { razaoSocial: '', nomeFantasia: 'Status Negócios Imobiliários', cnpj: '', creci: '038595-J' },
      admin: { nome: '', login: '', senha: '', confirmacao: '' },
      backup: { senha: '', confirmacao: '' }
    }
  })
  const e = formState.errors
  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit(async (v) => {
        setFalha(null)
        try {
          await rpc('sistema.configurarInicial', v)
          await recarregar()
        } catch (err) {
          setFalha(aplicarErrosServidor(err, setError))
        }
      })}
    >
      <Secao n={1} titulo="Empresa">
        <Campo rotulo="Razão social" obrigatorio erro={erroDe(e, 'empresa.razaoSocial')}>{(id) => <Entrada id={id} {...register('empresa.razaoSocial')} />}</Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome fantasia" obrigatorio erro={erroDe(e, 'empresa.nomeFantasia')}>{(id) => <Entrada id={id} {...register('empresa.nomeFantasia')} />}</Campo>
          <Campo rotulo="CRECI" obrigatorio erro={erroDe(e, 'empresa.creci')}>{(id) => <Entrada id={id} {...register('empresa.creci')} />}</Campo>
        </div>
        <Campo rotulo="CNPJ" erro={erroDe(e, 'empresa.cnpj')} ajuda="Aceita CNPJ numérico ou alfanumérico.">{(id) => <Entrada id={id} {...register('empresa.cnpj')} />}</Campo>
      </Secao>
      <Secao n={2} titulo="Administrador do sistema">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome" obrigatorio erro={erroDe(e, 'admin.nome')}>{(id) => <Entrada id={id} {...register('admin.nome')} />}</Campo>
          <Campo rotulo="Usuário (login)" obrigatorio erro={erroDe(e, 'admin.login')}>{(id) => <Entrada id={id} autoComplete="username" {...register('admin.login')} />}</Campo>
          <Campo rotulo="Senha" obrigatorio erro={erroDe(e, 'admin.senha')} ajuda={POLITICA_SENHA}>{(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('admin.senha')} />}</Campo>
          <Campo rotulo="Confirmação" obrigatorio erro={erroDe(e, 'admin.confirmacao')}>{(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('admin.confirmacao')} />}</Campo>
        </div>
      </Secao>
      <Secao n={3} titulo="Senha de backup">
        <Aviso tom="alerta">
          Esta senha protege as cópias de segurança e é <strong>exigida para restaurar</strong> em outro computador. Guarde-a em local seguro (ex.: com a diretoria). Ela não pode ser recuperada.
        </Aviso>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Senha de backup" obrigatorio erro={erroDe(e, 'backup.senha')}>{(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('backup.senha')} />}</Campo>
          <Campo rotulo="Confirmação" obrigatorio erro={erroDe(e, 'backup.confirmacao')}>{(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('backup.confirmacao')} />}</Campo>
        </div>
      </Secao>
      {falha && <Aviso tom="perigo">{falha}</Aviso>}
      <Botao type="submit" variante="primario" className="w-full" carregando={formState.isSubmitting}>
        Concluir configuração
      </Botao>
    </form>
  )
}

function RestaurarInicial() {
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [senha, setSenha] = useState('')
  const [resumo, setResumo] = useState<ResumoBackup | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<'escolher' | 'conferir' | 'restaurando'>('escolher')
  const [carregando, setCarregando] = useState(false)

  const executar = async (f: () => Promise<void>) => {
    setFalha(null)
    setCarregando(true)
    try {
      await f()
    } catch (e) {
      setFalha(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  if (etapa === 'restaurando') return <Aviso tom="sucesso">Backup validado. O sistema será reiniciado para concluir a restauração…</Aviso>

  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-2">Use esta opção para migrar de computador ou recuperar após reinstalação do Windows. Você precisará da senha de backup.</p>
      <div className="flex gap-2">
        <Entrada readOnly value={arquivo ?? ''} placeholder="Nenhum arquivo selecionado" />
        <Botao onClick={() => executar(async () => setArquivo(await rpc('sistema.escolherBackup')))}>Selecionar…</Botao>
      </div>
      <Campo rotulo="Senha de backup">{(id) => <Entrada id={id} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />}</Campo>
      {resumo && <ResumoBackupView r={resumo} />}
      {falha && <Aviso tom="perigo">{falha}</Aviso>}
      {etapa === 'escolher' ? (
        <Botao
          variante="primario"
          disabled={!arquivo || !senha}
          carregando={carregando}
          onClick={() =>
            executar(async () => {
              setResumo(await rpc('sistema.inspecionarBackup', { arquivo: arquivo!, senha }))
              setEtapa('conferir')
            })
          }
        >
          Validar backup
        </Botao>
      ) : (
        <Botao
          variante="primario"
          carregando={carregando}
          onClick={() =>
            executar(async () => {
              await rpc('sistema.restaurarInicial', { arquivo: arquivo!, senha })
              setEtapa('restaurando')
            })
          }
        >
          Restaurar e reiniciar
        </Botao>
      )}
    </div>
  )
}

export function ResumoBackupView({ r }: { r: ResumoBackup }) {
  return (
    <div className="rounded-md border border-borda bg-superficie p-4 text-sm">
      <div className="mb-2 font-medium">Backup íntegro ✓</div>
      <dl className="numeros grid grid-cols-2 gap-x-6 gap-y-1 text-texto-2">
        <dt>Gerado em</dt>
        <dd className="text-texto">{dataHora(r.criadoEm)}</dd>
        <dt>Empresa</dt>
        <dd className="text-texto">{r.empresa ?? '—'}</dd>
        <dt>Versão</dt>
        <dd className="text-texto">
          {r.versaoApp} (schema {r.versaoSchema})
        </dd>
        <dt>Pessoas / usuários</dt>
        <dd className="text-texto">
          {r.contagens.pessoas} / {r.contagens.usuarios}
        </dd>
        <dt>Anexos</dt>
        <dd className="text-texto">{r.contagens.anexos}</dd>
        <dt>Tamanho</dt>
        <dd className="text-texto">{tamanhoArquivo(r.tamanhoTotal)}</dd>
      </dl>
    </div>
  )
}
