import { Loader2 } from 'lucide-react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Permissao } from '@shared/permissoes'
import { Aviso } from '@/components/ui'
import { Auditoria } from '@/features/auditoria/Auditoria'
import { Bloqueio } from '@/features/auth/Bloqueio'
import { Login } from '@/features/auth/Login'
import { TrocaObrigatoria } from '@/features/auth/TrocarSenha'
import { Backup } from '@/features/backup/Backup'
import { Configuracoes, MinhaConta } from '@/features/configuracoes/Configuracoes'
import { ConfiguracaoInicial } from '@/features/inicial/ConfiguracaoInicial'
import { Painel } from '@/features/painel/Painel'
import { FormPessoa } from '@/features/pessoas/FormPessoa'
import { ListaPessoas } from '@/features/pessoas/ListaPessoas'
import { Usuarios } from '@/features/usuarios/Usuarios'
import { FormImovel } from '@/features/imoveis/FormImovel'
import { ListaImoveis } from '@/features/imoveis/ListaImoveis'
import { FormContrato } from '@/features/locacoes/FormContrato'
import { ListaContratos } from '@/features/locacoes/ListaContratos'
import { Reajustes } from '@/features/locacoes/Reajustes'
import { Cobrancas } from '@/features/financeiro/Cobrancas'
import { ContaDetalhe } from '@/features/financeiro/ContaDetalhe'
import { Contas } from '@/features/financeiro/Contas'
import { FluxoCaixa } from '@/features/financeiro/FluxoCaixa'
import { Relatorios } from '@/features/financeiro/Relatorios'
import { Inadimplencia } from '@/features/financeiro/Inadimplencia'
import { Indices } from '@/features/financeiro/Indices'
import { Repasses } from '@/features/financeiro/Repasses'
import { Titulos } from '@/features/financeiro/Titulos'
import { Layout } from './Layout'
import { useSessao } from './sessao'

function Protegida({ permissao, children }: { permissao: Permissao; children: ReactNode }) {
  const { pode } = useSessao()
  return pode(permissao) ? children : <Aviso tom="alerta">Você não tem permissão para acessar esta área.</Aviso>
}

export function App() {
  const { estado, sessao, carregando } = useSessao()
  if (carregando)
    return (
      <div className="flex h-full items-center justify-center text-texto-3">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  if (estado?.erroInicializacao)
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="max-w-lg">
          <Aviso tom="perigo" titulo="Não foi possível iniciar o STATUS ERP">
            {estado.erroInicializacao}
          </Aviso>
        </div>
      </div>
    )
  if (!estado?.configurado) return <ConfiguracaoInicial />
  if (!sessao) return <Login />
  if (sessao.deveTrocarSenha) return <TrocaObrigatoria />
  return (
    <HashRouter>
      {sessao.bloqueada && <Bloqueio />}
      <div className={sessao.bloqueada ? 'invisible h-full' : 'h-full'}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Painel />} />
            <Route path="pessoas" element={<Protegida permissao="pessoas.ver"><ListaPessoas /></Protegida>} />
            <Route path="pessoas/nova" element={<Protegida permissao="pessoas.criar"><FormPessoa /></Protegida>} />
            <Route path="pessoas/:id" element={<Protegida permissao="pessoas.ver"><FormPessoa /></Protegida>} />
            <Route path="imoveis" element={<Protegida permissao="imoveis.ver"><ListaImoveis /></Protegida>} />
            <Route path="imoveis/novo" element={<Protegida permissao="imoveis.criar"><FormImovel /></Protegida>} />
            <Route path="imoveis/:id" element={<Protegida permissao="imoveis.ver"><FormImovel key="editar" /></Protegida>} />
            <Route path="locacoes" element={<Protegida permissao="locacoes.ver"><ListaContratos /></Protegida>} />
            <Route path="locacoes/novo" element={<Protegida permissao="locacoes.gerenciar"><FormContrato /></Protegida>} />
            <Route path="locacoes/:id" element={<Protegida permissao="locacoes.ver"><FormContrato key="editar" /></Protegida>} />
            <Route path="reajustes" element={<Protegida permissao="locacoes.ver"><Reajustes /></Protegida>} />
            <Route path="financeiro/receber" element={<Protegida permissao="financeiro.ver"><Titulos key="receber" sentido="RECEBER" /></Protegida>} />
            <Route path="financeiro/pagar" element={<Protegida permissao="financeiro.ver"><Titulos key="pagar" sentido="PAGAR" /></Protegida>} />
            <Route path="financeiro/cobrancas" element={<Protegida permissao="financeiro.ver"><Cobrancas /></Protegida>} />
            <Route path="financeiro/inadimplencia" element={<Protegida permissao="financeiro.ver"><Inadimplencia /></Protegida>} />
            <Route path="financeiro/repasses" element={<Protegida permissao="financeiro.ver"><Repasses /></Protegida>} />
            <Route path="financeiro/contas" element={<Protegida permissao="financeiro.ver"><Contas /></Protegida>} />
            <Route path="financeiro/contas/:id" element={<Protegida permissao="financeiro.ver"><ContaDetalhe /></Protegida>} />
            <Route path="financeiro/fluxo" element={<Protegida permissao="financeiro.ver"><FluxoCaixa /></Protegida>} />
            <Route path="financeiro/relatorios" element={<Protegida permissao="financeiro.ver"><Relatorios /></Protegida>} />
            <Route path="financeiro/indices" element={<Indices />} />
            <Route path="usuarios" element={<Protegida permissao="usuarios.ver"><Usuarios /></Protegida>} />
            <Route path="auditoria" element={<Protegida permissao="auditoria.ver"><Auditoria /></Protegida>} />
            <Route path="backup" element={<Protegida permissao="backup.executar"><Backup /></Protegida>} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="minha-conta" element={<MinhaConta />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </div>
    </HashRouter>
  )
}
