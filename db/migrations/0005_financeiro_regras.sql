-- Razão contábil imutável: lançamentos não podem ser alterados nem excluídos; correções são feitas por estorno.
CREATE TRIGGER `trg_lancamento_sem_update` BEFORE UPDATE ON `lancamento`
BEGIN
  SELECT RAISE(ABORT, 'Lançamentos contábeis não podem ser alterados');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_lancamento_sem_delete` BEFORE DELETE ON `lancamento`
BEGIN
  SELECT RAISE(ABORT, 'Lançamentos contábeis não podem ser excluídos');
END;
--> statement-breakpoint
-- Partidas: somente a marcação de repasse pode mudar (e apenas entre nulo e um repasse).
CREATE TRIGGER `trg_partida_sem_update` BEFORE UPDATE ON `partida`
WHEN NEW.lancamento_id IS NOT OLD.lancamento_id OR NEW.conta_gerencial_id IS NOT OLD.conta_gerencial_id
  OR NEW.pessoa_id IS NOT OLD.pessoa_id OR NEW.conta_financeira_id IS NOT OLD.conta_financeira_id
  OR NEW.contrato_id IS NOT OLD.contrato_id OR NEW.titulo_id IS NOT OLD.titulo_id
  OR NEW.debito_centavos IS NOT OLD.debito_centavos OR NEW.credito_centavos IS NOT OLD.credito_centavos
  OR NEW.historico IS NOT OLD.historico
BEGIN
  SELECT RAISE(ABORT, 'Partidas contábeis não podem ser alteradas');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_partida_sem_delete` BEFORE DELETE ON `partida`
BEGIN
  SELECT RAISE(ABORT, 'Partidas contábeis não podem ser excluídas');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_partida_valores` BEFORE INSERT ON `partida`
WHEN NEW.debito_centavos < 0 OR NEW.credito_centavos < 0 OR (NEW.debito_centavos > 0 AND NEW.credito_centavos > 0) OR (NEW.debito_centavos = 0 AND NEW.credito_centavos = 0)
BEGIN
  SELECT RAISE(ABORT, 'Partida inválida: informe débito ou crédito positivo');
END;
--> statement-breakpoint
-- Baixas: valores imutáveis; só é permitido marcar o estorno (uma única vez).
CREATE TRIGGER `trg_baixa_sem_update` BEFORE UPDATE ON `baixa`
WHEN NEW.titulo_id IS NOT OLD.titulo_id OR NEW.data IS NOT OLD.data OR NEW.principal_centavos IS NOT OLD.principal_centavos
  OR NEW.multa_centavos IS NOT OLD.multa_centavos OR NEW.juros_centavos IS NOT OLD.juros_centavos
  OR NEW.desconto_centavos IS NOT OLD.desconto_centavos OR NEW.total_centavos IS NOT OLD.total_centavos
  OR NEW.conta_financeira_id IS NOT OLD.conta_financeira_id OR (OLD.estornada = 1) OR (OLD.lancamento_id IS NOT NULL AND NEW.lancamento_id IS NOT OLD.lancamento_id)
BEGIN
  SELECT RAISE(ABORT, 'Baixas não podem ser alteradas; utilize o estorno');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_baixa_sem_delete` BEFORE DELETE ON `baixa`
BEGIN
  SELECT RAISE(ABORT, 'Baixas não podem ser excluídas; utilize o estorno');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_baixa_item_sem_alteracao` BEFORE UPDATE ON `baixa_item`
BEGIN
  SELECT RAISE(ABORT, 'Alocação de baixa não pode ser alterada');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_baixa_item_sem_delete` BEFORE DELETE ON `baixa_item`
BEGIN
  SELECT RAISE(ABORT, 'Alocação de baixa não pode ser excluída');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_titulo_item_sem_update` BEFORE UPDATE ON `titulo_item`
BEGIN
  SELECT RAISE(ABORT, 'Itens de título não podem ser alterados; cancele e gere novamente');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_titulo_item_sem_delete` BEFORE DELETE ON `titulo_item`
BEGIN
  SELECT RAISE(ABORT, 'Itens de título não podem ser excluídos');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_titulo_valor_fixo` BEFORE UPDATE ON `titulo`
WHEN NEW.valor_centavos IS NOT OLD.valor_centavos OR NEW.sentido IS NOT OLD.sentido OR NEW.pessoa_id IS NOT OLD.pessoa_id
BEGIN
  SELECT RAISE(ABORT, 'Valor, sentido e pessoa do título não podem ser alterados');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_titulo_sem_delete` BEFORE DELETE ON `titulo`
BEGIN
  SELECT RAISE(ABORT, 'Títulos não podem ser excluídos; utilize o cancelamento');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_reajuste_sem_alteracao` BEFORE UPDATE ON `reajuste`
BEGIN
  SELECT RAISE(ABORT, 'Reajustes não podem ser alterados');
END;
--> statement-breakpoint
-- Plano de contas gerencial (contas de sistema).
INSERT INTO `conta_gerencial` (`codigo`, `nome`, `natureza`, `recurso`, `sistema`) VALUES
  ('1.1.01', 'Disponibilidades — caixa e bancos', 'ATIVO', 'PROPRIO', 1),
  ('2.1.01', 'Proprietários — valores a repassar', 'PASSIVO', 'TERCEIROS', 1),
  ('2.1.02', 'Terceiros — valores a pagar (condomínio, IPTU, fornecedores do proprietário)', 'PASSIVO', 'TERCEIROS', 1),
  ('2.1.03', 'Cauções de locatários', 'PASSIVO', 'TERCEIROS', 1),
  ('3.1.01', 'Receita — taxa de administração', 'RECEITA', 'PROPRIO', 1),
  ('3.1.02', 'Receita — taxa de intermediação de locação', 'RECEITA', 'PROPRIO', 1),
  ('3.1.03', 'Receita — multas e juros por atraso', 'RECEITA', 'PROPRIO', 1),
  ('3.1.04', 'Receita — outras receitas de locação', 'RECEITA', 'PROPRIO', 1);
--> statement-breakpoint
INSERT INTO `indice_economico` (`sigla`, `nome`) VALUES
  ('IGP-M', 'Índice Geral de Preços do Mercado (FGV)'),
  ('IPCA', 'Índice Nacional de Preços ao Consumidor Amplo (IBGE)'),
  ('INPC', 'Índice Nacional de Preços ao Consumidor (IBGE)'),
  ('IVAR', 'Índice de Variação de Aluguéis Residenciais (FGV)');
