import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { EmpresaConfig } from "@shared/dto"
import type { BackupConfig, EmpresaInput, SegurancaConfig } from "@shared/schemas"
import { backupConfigSchema, empresaSchema, POLITICA_SENHA, segurancaConfigSchema, senhaSchema } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { FormTrocarSenha } from '@/features/auth/TrocarSenha'
import { Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Entrada, useToast } from '@/components/ui'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { formatarDocumento } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

export function Configuracoes() {
  const { pode } = useSessao()
  const { data } = useQuery({ queryKey: ['config'], queryFn: () => rpc('config.obter') })
  const podeEditar = pode('configuracoes.gerenciar')
  if (!data) return null
  return (
    <>
      <CabecalhoPagina titulo="Configurações" subtitulo={`Dados armazenados em: ${data.caminhoDados}`} />
      {!podeEditar && (
        <div className="mb-4">
          <Aviso>Somente administradores podem alterar as configurações.</Aviso>
        </div>
      )}
      <div className="grid grid-cols-2 gap-6">
        <Empresa inicial={data.empresa!} editavel={podeEditar} />
        <div className="space-y-6">
          <Seguranca inicial={data.seguranca} editavel={podeEditar} />
          <BackupAuto inicial={data.backup} editavel={podeEditar} />
          {podeEditar && <SenhaBackup />}
        </div>
      </div>
    </>
  )
}

function useSalvar() {
  const qc = useQueryClient()
  const toast = useToast()
  const { recarregar } = useSessao()
  return async (f: () => Promise<unknown>) => {
    await f()
    toast.sucesso('Configuração salva.')
    await qc.invalidateQueries({ queryKey: ['config'] })
    await recarregar()
  }
}

function Empresa({ inicial, editavel }: { inicial: EmpresaConfig; editavel: boolean }) {
  const salvar = useSalvar()
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, setError } = useForm<EmpresaInput>({ resolver: resolverZod(empresaSchema), defaultValues: { ...inicial, cnpj: inicial.cnpj ? formatarDocumento(inicial.cnpj) : '', endereco: inicial.endereco ?? '', telefone: inicial.telefone ?? '', email: inicial.email ?? '' } })
  const e = formState.errors
  return (
    <Cartao titulo="Empresa" acoes={editavel && <Botao tamanho="sm" variante="primario" carregando={formState.isSubmitting} onClick={handleSubmit((v) => salvar(() => rpc('config.salvarEmpresa', v)).catch((err) => setFalha(aplicarErrosServidor(err, setError))))}>Salvar</Botao>}>
      <fieldset disabled={!editavel} className="space-y-3">
        <Campo rotulo="Razão social" obrigatorio erro={erroDe(e, 'razaoSocial')}>{(id) => <Entrada id={id} {...register('razaoSocial')} />}</Campo>
        <Campo rotulo="Nome fantasia" obrigatorio erro={erroDe(e, 'nomeFantasia')}>{(id) => <Entrada id={id} {...register('nomeFantasia')} />}</Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="CNPJ" erro={erroDe(e, 'cnpj')}>{(id) => <Entrada id={id} {...register('cnpj')} />}</Campo>
          <Campo rotulo="CRECI" obrigatorio erro={erroDe(e, 'creci')}>{(id) => <Entrada id={id} {...register('creci')} />}</Campo>
        </div>
        <Campo rotulo="Endereço" ajuda="Usado em relatórios e documentos.">{(id) => <Entrada id={id} {...register('endereco')} />}</Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Telefone">{(id) => <Entrada id={id} {...register('telefone')} />}</Campo>
          <Campo rotulo="E-mail" erro={erroDe(e, 'email')}>{(id) => <Entrada id={id} {...register('email')} />}</Campo>
        </div>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </fieldset>
    </Cartao>
  )
}

function Seguranca({ inicial, editavel }: { inicial: SegurancaConfig; editavel: boolean }) {
  const salvar = useSalvar()
  const { register, handleSubmit, formState } = useForm<SegurancaConfig>({ resolver: resolverZod(segurancaConfigSchema), defaultValues: inicial })
  const e = formState.errors
  return (
    <Cartao titulo="Segurança de acesso" acoes={editavel && <Botao tamanho="sm" variante="primario" onClick={handleSubmit((v) => salvar(() => rpc('config.salvarSeguranca', v)))}>Salvar</Botao>}>
      <fieldset disabled={!editavel} className="grid grid-cols-3 gap-3">
        <Campo rotulo="Bloqueio por inatividade (min)" erro={erroDe(e, 'inatividadeMinutos')}>{(id) => <Entrada id={id} type="number" {...register('inatividadeMinutos', { valueAsNumber: true })} />}</Campo>
        <Campo rotulo="Tentativas até bloquear" erro={erroDe(e, 'tentativasBloqueio')}>{(id) => <Entrada id={id} type="number" {...register('tentativasBloqueio', { valueAsNumber: true })} />}</Campo>
        <Campo rotulo="Duração do bloqueio (min)" erro={erroDe(e, 'minutosBloqueio')}>{(id) => <Entrada id={id} type="number" {...register('minutosBloqueio', { valueAsNumber: true })} />}</Campo>
      </fieldset>
    </Cartao>
  )
}

function BackupAuto({ inicial, editavel }: { inicial: BackupConfig; editavel: boolean }) {
  const salvar = useSalvar()
  const { register, handleSubmit, formState, watch, setValue } = useForm<BackupConfig>({ resolver: resolverZod(backupConfigSchema), defaultValues: inicial })
  const e = formState.errors
  return (
    <Cartao titulo="Backup automático" acoes={editavel && <Botao tamanho="sm" variante="primario" onClick={handleSubmit((v) => salvar(() => rpc('config.salvarBackup', v)))}>Salvar</Botao>}>
      <fieldset disabled={!editavel} className="space-y-3">
        <Caixa rotulo="Ativar backup automático" checked={watch('automatico')} onChange={(ev) => setValue('automatico', ev.target.checked)} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Intervalo (horas)" erro={erroDe(e, 'intervaloHoras')}>{(id) => <Entrada id={id} type="number" {...register('intervaloHoras', { valueAsNumber: true })} />}</Campo>
          <Campo rotulo="Cópias automáticas mantidas" erro={erroDe(e, 'reterQuantidade')}>{(id) => <Entrada id={id} type="number" {...register('reterQuantidade', { valueAsNumber: true })} />}</Campo>
        </div>
        <Campo rotulo="Pasta de destino" ajuda="Vazio = pasta padrão do sistema. Pode ser unidade externa ou pasta de rede.">
          {(id) => (
            <div className="flex gap-2">
              <Entrada id={id} readOnly value={watch('destino') ?? ''} placeholder="Padrão" />
              <Botao icone={<FolderOpen className="size-4" />} onClick={async () => setValue('destino', await rpc('backup.escolherDestino'))} />
              <Botao variante="fantasma" onClick={() => setValue('destino', null)}>
                Padrão
              </Botao>
            </div>
          )}
        </Campo>
      </fieldset>
    </Cartao>
  )
}

function SenhaBackup() {
  const toast = useToast()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  useEffect(() => setFalha(null), [atual, nova])
  return (
    <Cartao titulo="Senha de backup">
      <div className="space-y-3">
        <Aviso tom="alerta">Backups já gerados continuam exigindo a senha com que foram criados.</Aviso>
        <div className="grid grid-cols-2 gap-3">
          <Entrada type="password" placeholder="Senha atual" value={atual} onChange={(e) => setAtual(e.target.value)} />
          <Entrada type="password" placeholder="Nova senha" value={nova} onChange={(e) => setNova(e.target.value)} title={POLITICA_SENHA} />
        </div>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
        <Botao
          disabled={!atual || !senhaSchema.safeParse(nova).success}
          onClick={async () => {
            try {
              await rpc('backup.alterarSenha', { senhaAtual: atual, novaSenha: nova })
              toast.sucesso('Senha de backup alterada.')
              setAtual('')
              setNova('')
            } catch (e) {
              setFalha(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Alterar senha de backup
        </Botao>
      </div>
    </Cartao>
  )
}

export function MinhaConta() {
  const { sessao } = useSessao()
  const toast = useToast()
  return (
    <>
      <CabecalhoPagina titulo="Minha conta" subtitulo={`${sessao?.usuario.nome} · ${sessao?.usuario.login} · perfil ${sessao?.usuario.perfil}`} />
      <Cartao titulo="Alterar senha" className="max-w-md">
        <FormTrocarSenha aoConcluir={() => toast.sucesso('Senha alterada.')} />
      </Cartao>
    </>
  )
}
