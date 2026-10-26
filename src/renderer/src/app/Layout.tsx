import { AlertTriangle, ChartLine, FileBarChart, ArrowDownToLine, ArrowUpFromLine, Building2, CalendarCheck, ChevronLeft, Percent, Send, TrendingUp, ClipboardList, FileSignature, Gauge, HardDriveDownload, Handshake, KeyRound, Landmark, Lock, LogOut, Moon, Settings, ShieldCheck, Sun, Users, Wrench, UserCog } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LimiteErro } from '@/components/LimiteErro'
import type { Permissao } from '@shared/permissoes'
import { Marca } from '@/components/Marca'
import { cx } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { useSessao } from './sessao'
import { useTema } from './tema'

interface ItemMenu {
  rota?: string
  rotulo: string
  icone: ReactNode
  permissao?: Permissao
  fase?: number
}

const GRUPOS: { titulo: string; itens: ItemMenu[] }[] = [
  { titulo: '', itens: [{ rota: '/', rotulo: 'Painel', icone: <Gauge /> }] },
  {
    titulo: 'Cadastros',
    itens: [
      { rota: '/pessoas', rotulo: 'Pessoas', icone: <Users />, permissao: 'pessoas.ver' },
      { rota: '/imoveis', rotulo: 'Imóveis', icone: <Building2 />, permissao: 'imoveis.ver' }
    ]
  },
  {
    titulo: 'Operações',
    itens: [
      { rota: '/locacoes', rotulo: 'Locações', icone: <KeyRound />, permissao: 'locacoes.ver' },
      { rota: '/reajustes', rotulo: 'Reajustes', icone: <TrendingUp />, permissao: 'locacoes.ver' },
      { rotulo: 'Vendas e CRM', icone: <Handshake />, fase: 5 },
      { rotulo: 'Documentos', icone: <FileSignature />, fase: 6 },
      { rotulo: 'Manutenção', icone: <Wrench />, fase: 6 }
    ]
  },
  {
    titulo: 'Financeiro',
    itens: [
      { rota: '/financeiro/receber', rotulo: 'Contas a receber', icone: <ArrowDownToLine />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/cobrancas', rotulo: 'Cobranças do mês', icone: <CalendarCheck />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/inadimplencia', rotulo: 'Inadimplência', icone: <AlertTriangle />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/repasses', rotulo: 'Repasses', icone: <Send />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/pagar', rotulo: 'Contas a pagar', icone: <ArrowUpFromLine />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/contas', rotulo: 'Contas bancárias', icone: <Landmark />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/fluxo', rotulo: 'Fluxo de caixa', icone: <ChartLine />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/relatorios', rotulo: 'Relatórios', icone: <FileBarChart />, permissao: 'financeiro.ver' },
      { rota: '/financeiro/indices', rotulo: 'Índices e feriados', icone: <Percent /> }
    ]
  },
  {
    titulo: 'Administração',
    itens: [
      { rota: '/usuarios', rotulo: 'Usuários e perfis', icone: <UserCog />, permissao: 'usuarios.ver' },
      { rota: '/auditoria', rotulo: 'Auditoria', icone: <ClipboardList />, permissao: 'auditoria.ver' },
      { rota: '/backup', rotulo: 'Backup', icone: <HardDriveDownload />, permissao: 'backup.executar' },
      { rota: '/configuracoes', rotulo: 'Configurações', icone: <Settings /> }
    ]
  }
]

export function Layout() {
  const { sessao, sair, pode, definirSessao, estado } = useSessao()
  const { escuro, alternar } = useTema()
  const [recolhido, setRecolhido] = useState(false)
  const local = useLocation()

  return (
    <div className="flex h-full">
      <aside className={cx('flex shrink-0 flex-col bg-menu text-menu-texto transition-all', recolhido ? 'w-16' : 'w-60')}>
        <div className={cx('flex h-16 items-center border-b border-white/10', recolhido ? 'justify-center' : 'px-5')}>
          <Marca fundo="escuro" compacta={recolhido} className={recolhido ? 'h-6' : 'h-9'} />
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((i) => !i.permissao || pode(i.permissao))
            if (!itens.length) return null
            return (
              <div key={g.titulo} className="mb-3">
                {g.titulo && !recolhido && <div className="px-5 pb-1 text-[10px] font-semibold tracking-[0.15em] text-white/40 uppercase">{g.titulo}</div>}
                {itens.map((i) =>
                  i.rota ? (
                    <NavLink
                      key={i.rotulo}
                      to={i.rota}
                      end={i.rota === '/'}
                      title={i.rotulo}
                      className={({ isActive }) =>
                        cx('mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition [&_svg]:size-4', isActive ? 'bg-menu-ativo text-white' : 'hover:bg-white/5 hover:text-white', recolhido && 'justify-center')
                      }
                    >
                      {i.icone}
                      {!recolhido && i.rotulo}
                    </NavLink>
                  ) : (
                    <div key={i.rotulo} title={`${i.rotulo} — disponível na Fase ${i.fase}`} className={cx('mx-2 flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm opacity-40 [&_svg]:size-4', recolhido && 'justify-center')}>
                      {i.icone}
                      {!recolhido && (
                        <>
                          <span className="flex-1">{i.rotulo}</span>
                          <span className="text-[10px]">Fase {i.fase}</span>
                        </>
                      )}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </nav>
        <button type="button" onClick={() => setRecolhido((r) => !r)} className="flex h-10 items-center justify-center border-t border-white/10 text-white/40 hover:text-white" title={recolhido ? 'Expandir menu' : 'Recolher menu'}>
          <ChevronLeft className={cx('size-4 transition', recolhido && 'rotate-180')} />
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-borda bg-superficie px-6">
          <div className="text-xs text-texto-2">
            <span className="font-semibold tracking-wide text-texto">STATUS ERP IMOBILIÁRIO</span>
            <span className="mx-2 text-texto-3">·</span>
            {estado?.empresa?.nomeFantasia} · CRECI {estado?.empresa?.creci}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={alternar} className="rounded-md p-2 text-texto-2 hover:bg-superficie-2" title={escuro ? 'Modo claro' : 'Modo escuro'}>
              {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button
              type="button"
              onClick={async () => {
                await rpc('auth.bloquear')
                definirSessao(sessao && { ...sessao, bloqueada: true })
              }}
              className="rounded-md p-2 text-texto-2 hover:bg-superficie-2"
              title="Bloquear tela"
            >
              <Lock className="size-4" />
            </button>
            <NavLink to="/minha-conta" className="ml-2 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-superficie-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-marca text-xs font-semibold text-marca-texto">
                {sessao?.usuario.nome
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div className="text-left leading-tight">
                <div className="text-sm font-medium">{sessao?.usuario.nome}</div>
                <div className="flex items-center gap-1 text-[11px] text-texto-2">
                  <ShieldCheck className="size-3" />
                  {sessao?.usuario.perfil}
                </div>
              </div>
            </NavLink>
            <button type="button" onClick={sair} className="ml-1 rounded-md p-2 text-texto-2 hover:bg-superficie-2" title="Sair">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-6">
            <LimiteErro chave={local.pathname}>
              <Outlet />
            </LimiteErro>
          </div>
        </main>
      </div>
    </div>
  )
}
