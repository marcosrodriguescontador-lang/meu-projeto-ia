// Design system Status: componentes padronizados de botão, formulário, tabela, diálogo e mensagens.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const cx = (...c: ClassValue[]) => twMerge(clsx(c))

// ───── Botões ─────

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'destaque'
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca text-marca-texto hover:opacity-90',
  destaque: 'bg-destaque text-white hover:opacity-90 dark:text-black',
  secundario: 'bg-superficie text-texto border border-borda hover:bg-superficie-2',
  fantasma: 'text-texto-2 hover:bg-superficie-2 hover:text-texto',
  perigo: 'bg-perigo text-white hover:opacity-90 dark:text-black'
}

export const Botao = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean; icone?: ReactNode; tamanho?: 'sm' | 'md' }>(
  ({ variante = 'secundario', carregando, icone, tamanho = 'md', className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      type={p.type ?? 'button'}
      disabled={disabled || carregando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
        tamanho === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        VARIANTES[variante],
        className
      )}
      {...p}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" /> : icone}
      {children}
    </button>
  )
)

// ───── Campos ─────

export function Campo({ rotulo, erro, ajuda, obrigatorio, children, className }: { rotulo?: string; erro?: string; ajuda?: string; obrigatorio?: boolean; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {rotulo && (
        <label htmlFor={id} className="text-xs font-medium text-texto-2">
          {rotulo}
          {obrigatorio && (
            <span className="text-perigo" aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
      )}
      {children(id)}
      {erro ? <span className="text-xs text-perigo">{erro}</span> : ajuda ? <span className="text-xs text-texto-3">{ajuda}</span> : null}
    </div>
  )
}

const baseInput = 'h-9 w-full rounded-md border bg-superficie px-3 text-sm text-texto placeholder:text-texto-3 outline-none transition focus:border-destaque disabled:bg-superficie-2 disabled:text-texto-2'

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(({ invalido, className, ...p }, ref) => (
  <input ref={ref} className={cx(baseInput, invalido ? 'border-perigo' : 'border-borda', className)} {...p} />
))

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean; opcoes: Record<string, string> | [string, string][]; vazio?: string }>(
  ({ invalido, className, opcoes, vazio, ...p }, ref) => (
    <select ref={ref} className={cx(baseInput, 'pr-8', invalido ? 'border-perigo' : 'border-borda', className)} {...p}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {(Array.isArray(opcoes) ? opcoes : Object.entries(opcoes)).map(([v, r]) => (
        <option key={v} value={v}>
          {r}
        </option>
      ))}
    </select>
  )
)

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalido?: boolean }>(({ invalido, className, ...p }, ref) => (
  <textarea ref={ref} className={cx(baseInput, 'h-auto min-h-20 py-2', invalido ? 'border-perigo' : 'border-borda', className)} {...p} />
))

export const Caixa = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { rotulo: ReactNode; descricao?: string }>(({ rotulo, descricao, className, ...p }, ref) => (
  <label className={cx('flex items-start gap-2 cursor-pointer select-none', className)}>
    <input ref={ref} type="checkbox" className="mt-0.5 size-4 accent-[var(--destaque)]" {...p} />
    <span className="text-sm">
      {rotulo}
      {descricao && <span className="block text-xs text-texto-3">{descricao}</span>}
    </span>
  </label>
))

// ───── Estrutura ─────

export function Cartao({ titulo, acoes, children, className, semPadding }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; semPadding?: boolean }) {
  return (
    <section className={cx('rounded-lg border border-borda bg-superficie', className)}>
      {(titulo || acoes) && (
        <header className="flex items-center justify-between gap-4 border-b border-borda px-5 py-3">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <div className="flex items-center gap-2">{acoes}</div>
        </header>
      )}
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  )
}

export function CabecalhoPagina({ titulo, subtitulo, acoes, voltar }: { titulo: string; subtitulo?: string; acoes?: ReactNode; voltar?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {voltar}
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-texto-2">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-2">{acoes}</div>
    </div>
  )
}

export function Indicador({ rotulo, valor, detalhe, tom = 'neutro', icone }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: 'neutro' | 'destaque' | 'alerta' | 'perigo'; icone?: ReactNode }) {
  const cor = { neutro: 'text-texto', destaque: 'text-destaque', alerta: 'text-alerta', perigo: 'text-perigo' }[tom]
  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-texto-2">
        {rotulo}
        <span className="text-texto-3">{icone}</span>
      </div>
      <div className={cx('numeros mt-2 text-2xl font-semibold', cor)}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-texto-3">{detalhe}</div>}
    </div>
  )
}

export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'destaque' | 'alerta' | 'perigo' | 'escuro' }) {
  const cls = {
    neutro: 'bg-superficie-2 text-texto-2 border-borda',
    destaque: 'bg-destaque-suave text-destaque border-transparent',
    alerta: 'bg-alerta-suave text-alerta border-transparent',
    perigo: 'bg-perigo-suave text-perigo border-transparent',
    escuro: 'bg-marca text-marca-texto border-transparent'
  }[tom]
  return <span className={cx('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium', cls)}>{children}</span>
}

export function Tabela({ colunas, children, vazio, carregando }: { colunas: (string | { t: string; cls?: string })[]; children: ReactNode; vazio?: boolean; carregando?: boolean }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-xs uppercase tracking-wide text-texto-2">
            {colunas.map((c) => {
              const t = typeof c === 'string' ? { t: c } : c
              return (
                <th key={t.t} className={cx('px-4 py-2.5 font-medium', t.cls)}>
                  {t.t}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-borda [&>tr:last-child]:border-0 [&>tr:hover]:bg-superficie-2 [&_td]:px-4 [&_td]:py-2.5">{children}</tbody>
      </table>
      {carregando && (
        <div className="flex justify-center p-8 text-texto-3">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {!carregando && vazio && <div className="p-10 text-center text-sm text-texto-3">Nenhum registro encontrado.</div>}
    </div>
  )
}

export function Paginacao({ pagina, porPagina, total, aoMudar }: { pagina: number; porPagina: number; total: number; aoMudar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  return (
    <div className="flex items-center justify-between border-t border-borda px-4 py-2 text-xs text-texto-2">
      <span className="numeros">
        {total} registro(s) · página {pagina} de {paginas}
      </span>
      <div className="flex gap-1">
        <Botao tamanho="sm" variante="fantasma" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>
          Anterior
        </Botao>
        <Botao tamanho="sm" variante="fantasma" disabled={pagina >= paginas} onClick={() => aoMudar(pagina + 1)}>
          Próxima
        </Botao>
      </div>
    </div>
  )
}

export function Abas<T extends string>({ abas, ativa, aoMudar }: { abas: [T, string, number?][]; ativa: T; aoMudar: (a: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-borda">
      {abas.map(([id, rotulo, n]) => (
        <button
          key={id}
          type="button"
          onClick={() => aoMudar(id)}
          className={cx('-mb-px border-b-2 px-3 py-2 text-sm transition', ativa === id ? 'border-marca font-medium text-texto' : 'border-transparent text-texto-2 hover:text-texto')}
        >
          {rotulo}
          {n ? <span className="ml-1.5 rounded bg-superficie-2 px-1.5 text-[11px] text-texto-2">{n}</span> : null}
        </button>
      ))}
    </div>
  )
}

// ───── Diálogos ─────

export function Dialogo({ aberto, titulo, aoFechar, children, rodape, largura = 'max-w-lg' }: { aberto: boolean; titulo: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode; largura?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberto && !d.open) d.showModal()
    if (!aberto && d.open) d.close()
  }, [aberto])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      className={cx('m-auto w-full rounded-lg border border-borda bg-superficie p-0 text-texto shadow-2xl backdrop:bg-black/50', largura)}
    >
      {aberto && (
        <>
          <header className="flex items-center justify-between border-b border-borda px-5 py-3">
            <h2 className="text-sm font-semibold">{titulo}</h2>
            <button type="button" onClick={aoFechar} className="text-texto-3 hover:text-texto" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </header>
          <div className="max-h-[70vh] overflow-auto p-5">{children}</div>
          {rodape && <footer className="flex justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</footer>}
        </>
      )}
    </dialog>
  )
}

/** Confirmação para operações críticas; opcionalmente exige motivo ou digitação de palavra-chave. */
export function Confirmacao({
  aberto,
  titulo,
  mensagem,
  aoConfirmar,
  aoFechar,
  textoConfirmar = 'Confirmar',
  perigo,
  exigirMotivo,
  palavraChave
}: {
  aberto: boolean
  titulo: string
  mensagem: ReactNode
  aoConfirmar: (motivo: string) => Promise<void> | void
  aoFechar: () => void
  textoConfirmar?: string
  perigo?: boolean
  exigirMotivo?: boolean
  palavraChave?: string
}) {
  const [motivo, setMotivo] = useState('')
  const [chave, setChave] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  useEffect(() => {
    if (aberto) {
      setMotivo('')
      setChave('')
      setFalha(null)
    }
  }, [aberto])
  const valido = (!exigirMotivo || motivo.trim().length >= 5) && (!palavraChave || chave === palavraChave)
  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante={perigo ? 'perigo' : 'primario'}
            disabled={!valido}
            carregando={carregando}
            onClick={async () => {
              setCarregando(true)
              setFalha(null)
              try {
                await aoConfirmar(motivo.trim())
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setCarregando(false)
              }
            }}
          >
            {textoConfirmar}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="text-texto-2">{mensagem}</div>
        {exigirMotivo && (
          <Campo rotulo="Motivo" obrigatorio ajuda="Mínimo de 5 caracteres. Fica registrado na auditoria.">
            {(id) => <AreaTexto id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />}
          </Campo>
        )}
        {palavraChave && (
          <Campo rotulo={`Digite ${palavraChave} para confirmar`}>{(id) => <Entrada id={id} value={chave} onChange={(e) => setChave(e.target.value)} />}</Campo>
        )}
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

export function Aviso({ tom = 'info', titulo, children }: { tom?: 'info' | 'sucesso' | 'alerta' | 'perigo'; titulo?: string; children: ReactNode }) {
  const m = {
    info: ['bg-superficie-2 border-borda text-texto-2', Info],
    sucesso: ['bg-destaque-suave border-transparent text-destaque', CheckCircle2],
    alerta: ['bg-alerta-suave border-transparent text-alerta', AlertTriangle],
    perigo: ['bg-perigo-suave border-transparent text-perigo', XCircle]
  } as const
  const [cls, Icone] = m[tom]
  return (
    <div className={cx('flex gap-2 rounded-md border px-3 py-2.5 text-sm', cls)} role={tom === 'perigo' ? 'alert' : 'status'}>
      <Icone className="mt-0.5 size-4 shrink-0" />
      <div>
        {titulo && <div className="font-medium">{titulo}</div>}
        {children}
      </div>
    </div>
  )
}

// ───── Notificações (toasts) ─────

type Toast = { id: number; tom: 'sucesso' | 'perigo' | 'info'; texto: string }
const ContextoToast = createContext<(tom: Toast['tom'], texto: string) => void>(() => {})

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Toast[]>([])
  const notificar = useCallback((tom: Toast['tom'], texto: string) => {
    const id = Date.now() + Math.random()
    setItens((x) => [...x, { id, tom, texto }])
    setTimeout(() => setItens((x) => x.filter((t) => t.id !== id)), tom === 'perigo' ? 7000 : 3500)
  }, [])
  return (
    <ContextoToast.Provider value={notificar}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 flex-col gap-2">
        {itens.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-md border border-borda bg-superficie shadow-lg">
            <Aviso tom={t.tom}>{t.texto}</Aviso>
          </div>
        ))}
      </div>
    </ContextoToast.Provider>
  )
}

export function useToast() {
  const n = useContext(ContextoToast)
  return { sucesso: (t: string) => n('sucesso', t), erro: (e: unknown) => n('perigo', e instanceof Error ? e.message : String(e)), info: (t: string) => n('info', t) }
}
