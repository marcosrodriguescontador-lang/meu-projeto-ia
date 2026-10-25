const ROTULOS: Record<string, string> = {
  SISTEMA_CONFIGURADO: 'Configuração inicial',
  LOGIN: 'Entrada no sistema',
  LOGOUT: 'Saída do sistema',
  LOGIN_FALHA: 'Tentativa de acesso inválida',
  USUARIO_BLOQUEADO: 'Usuário bloqueado',
  USUARIO_DESBLOQUEADO: 'Usuário desbloqueado',
  SESSAO_ENCERRADA: 'Sessão encerrada',
  SENHA_ALTERADA: 'Senha alterada',
  SENHA_REDEFINIDA: 'Senha redefinida',
  USUARIO_CRIADO: 'Usuário criado',
  USUARIO_ALTERADO: 'Usuário alterado',
  PERFIL_CRIADO: 'Perfil criado',
  PERFIL_ALTERADO: 'Perfil alterado',
  PERFIL_EXCLUIDO: 'Perfil excluído',
  PESSOA_CRIADA: 'Cadastro criado',
  PESSOA_ALTERADA: 'Cadastro alterado',
  PESSOA_EXCLUIDA: 'Cadastro excluído',
  DADO_BANCARIO_CRIADO: 'Conta bancária adicionada',
  DADO_BANCARIO_ALTERADO: 'Conta bancária alterada',
  DADO_BANCARIO_REMOVIDO: 'Conta bancária removida',
  DADO_BANCARIO_VISUALIZADO: 'Dados bancários visualizados',
  ANEXO_ADICIONADO: 'Documento anexado',
  ANEXO_ACESSADO: 'Documento acessado',
  ANEXO_REMOVIDO: 'Documento removido',
  CONFIG_DEFINIDA: 'Configuração definida',
  CONFIG_ALTERADA: 'Configuração alterada',
  BACKUP_CRIADO: 'Backup gerado',
  BACKUP_FALHOU: 'Falha de backup',
  RESTAURACAO_AGENDADA: 'Restauração solicitada',
  BACKUP_RESTAURADO: 'Backup restaurado',
  SENHA_BACKUP_ALTERADA: 'Senha de backup alterada'
}

export const rotuloAcao = (a: string) => ROTULOS[a] ?? a

function valorTexto(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'object') return Array.isArray(v) ? `${v.length} item(ns)` : JSON.stringify(v)
  return String(v)
}

/** Exibe os campos alterados entre os estados "antes" e "depois" registrados. */
export function DiferencaAuditoria({ antes, depois }: { antes: string | null; depois: string | null }) {
  const ler = (s: string | null): Record<string, unknown> | null => {
    try {
      const v: unknown = s ? JSON.parse(s) : null
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  const a = ler(antes)
  const d = ler(depois)
  if (!a || !d) return null
  const chaves = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null))
  if (!chaves.length) return <div className="text-xs text-texto-3">Sem alteração de campos.</div>
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {chaves.slice(0, 12).map((k) => (
        <li key={k}>
          <span className="font-medium text-texto">{k}</span>: <span className="line-through opacity-60">{valorTexto(a[k])}</span> → <span>{valorTexto(d[k])}</span>
        </li>
      ))}
    </ul>
  )
}
