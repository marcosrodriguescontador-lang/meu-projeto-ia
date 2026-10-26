# STATUS ERP IMOBILIÁRIO — Plano de Execução e Critérios de Aceite

## Ajustes propostos ao plano original

1. **Backup básico antecipado para a Fase 1.** Dados reais serão digitados desde a Fase 1; não deve existir período sem backup. A Fase 7 completa a rotina (agendamento, retenção, unidade externa).
2. **Núcleo financeiro (razão, títulos, baixas, contas) entra na Fase 3**, pois locações não podem gerar cobranças e repasses sem ele. A Fase 4 completa tesouraria, conciliação OFX/CSV e relatórios.
3. **Dashboard evolutivo:** cada fase acrescenta os indicadores que passam a ter dados reais (nada de números fictícios).

## Fases

### Fase 1 — Fundação
**Entregas**
- Monorepo, build Electron, IPC tipado, lint/format, CI de testes.
- Banco cifrado, migrações versionadas, auditoria com hash encadeado.
- Design system Status: tema claro/escuro, menu lateral, tabelas, formulários, mensagens, logotipo.
- Login (Argon2id), bloqueio por tentativas, troca de senha, bloqueio por inatividade.
- Usuários, perfis e permissões (RBAC) com tela de administração.
- Cadastro único de pessoas (PF/PJ) com papéis, endereços (preenchimento por CEP offline não é possível — digitação com validação; base de CEP opcional futura), contatos, dados bancários protegidos, anexos.
- Backup manual + restauração com validação.

**Critérios de aceite**
- [ ] Instalar em Windows limpo e abrir sem internet.
- [ ] Primeiro acesso exige criar administrador e senha de backup.
- [ ] Mesma pessoa cadastrada como proprietária e locatária sem duplicar CPF; CPF/CNPJ inválido é rejeitado no front **e** no back.
- [ ] Usuário sem permissão não vê dados bancários (UI mascarada e API recusa).
- [ ] Cada criação/alteração/exclusão aparece na auditoria com antes/depois; senha nunca aparece em log/auditoria.
- [ ] Alterar um registro de auditoria diretamente no banco é detectado pela verificação de integridade.
- [ ] Backup gerado durante gravações restaura íntegro em outra máquina com a senha de backup.
- [ ] Testes automatizados: validação de documentos, hashing, RBAC, auditoria, backup/restore.

### Fase 2 — Imóveis
**Entregas:** cadastro completo, coproprietários com percentuais, ofertas independentes de venda e locação com histórico de situação, fotos (galeria, capa, ordenação), documentos, características, pesquisa avançada (local, preço, finalidade, características), ficha do imóvel em PDF com marca.
**Aceite:** soma de participação ≠ 100% é recusada; mesmo imóvel "alugado" na locação e "disponível" na venda; busca por faixa de preço e bairro retorna corretamente; histórico de alterações visível; dashboard mostra totais reais de imóveis.

### Fase 3 — Locações + núcleo financeiro
**Entregas:** contratos de administração e locação, partes, garantias, encargos, geração mensal idempotente de cobranças, baixas (total, parcial, antecipada), multa/juros, estorno auditado, renegociação, reajuste com confirmação, cálculo e geração de repasses com extrato ao proprietário, aditivos, renovações, rescisão com memória de cálculo, inadimplência, recibos.
**Aceite:**
- [ ] Gerar cobranças da competência duas vezes não duplica nada.
- [ ] Cobrança emitida não altera caixa, receita nem repasse.
- [ ] Recebimento parcial deixa título "parcial" com saldo correto; repasse só do valor recebido (se após recebimento).
- [ ] Taxa de administração lançada como receita própria apenas no recebimento.
- [ ] Estorno de baixa reverte todos os efeitos (título, razão, repasse pendente) e fica auditado.
- [ ] Σ débitos = Σ créditos em 100% dos lançamentos (teste automatizado).
- [ ] Suíte de testes com ≥ 40 cenários financeiros (pro rata, feriados, juros, arredondamento, coproprietários, repasse com despesas).

### Fase 4 — Financeiro
**Entregas:** contas a pagar/receber gerais, contas bancárias e caixa (próprios × terceiros), transferências, importação OFX/CSV com antiduplicidade, conciliação (sugestão automática + manual), fluxo de caixa previsto × realizado, todos os relatórios listados (PDF/XLSX), relatório base DIMOB.
**Aceite:** importar o mesmo OFX duas vezes não duplica; saldo do sistema bate com o extrato conciliado; relatório "valores a repassar" bate com o saldo do passivo de terceiros; receita própria nunca inclui aluguel bruto.

### Fase 5 — Vendas e CRM
**Entregas:** leads, origens, funis de venda e locação (kanban), atividades/tarefas, visitas, propostas e contrapropostas versionadas, sinal/parcelas/financiamento, venda, comissões com rateio, indicadores de conversão.
**Aceite:** concluir venda não gera recebimento; comissão do corretor só vira "a pagar" após recebimento pela imobiliária; taxa de conversão por etapa calculada do histórico real.

### Fase 6 — Documentos e operações
**Entregas:** editor de modelos com variáveis, fluxo de revisão jurídica, geração PDF/DOCX, impressão, arquivamento com hash; os 10 modelos iniciais **como minutas a revisar pelo jurídico**; vistorias com checklist e fotos (PDF do laudo); manutenção com orçamentos, aprovação e lançamentos financeiros; notificações locais.
**Aceite:** documento gerado com variável ausente é bloqueado com aviso; modelo não aprovado sai com marca "MINUTA"; despesa de manutenção do proprietário aparece descontada no repasse seguinte.

### Fase 7 — Qualidade e distribuição
**Entregas:** backup automático com retenção e destino externo, política LGPD (anonimização, relatório do titular), testes E2E, revisão de segurança, desempenho com volume (ex.: 5.000 imóveis, 2.000 contratos, 10 anos de lançamentos), importador de dados legados, instalador NSIS, manual de instalação, manual de operação, documentação técnica.
**Aceite:** instalação/atualização preserva dados; restauração assistida testada; telas principais abrem em < 1 s com volume de teste.

## Observação sobre o ambiente de desenvolvimento

O desenvolvimento ocorre em ambiente Linux na nuvem. Testes unitários e de integração rodam aqui; o instalador Windows será gerado por **pipeline GitHub Actions com runner Windows** (necessário para compilar módulos nativos — SQLCipher, Argon2 — para Windows com confiabilidade). A validação final em máquina Windows real deve ser feita pela Status a cada fase.
