-- Origens de contato iniciais (editáveis).
INSERT INTO `origem_lead` (`nome`) VALUES
  ('Indicação'), ('Placa no imóvel'), ('Portal imobiliário'), ('Site'), ('Instagram'), ('Facebook'), ('WhatsApp'), ('Telefone'), ('Visita ao escritório'), ('Outro');
--> statement-breakpoint
-- Histórico de etapas: base dos indicadores de conversão, append-only.
CREATE TRIGGER `trg_negocio_hist_sem_update` BEFORE UPDATE ON `negocio_etapa_hist`
BEGIN
  SELECT RAISE(ABORT, 'O histórico de etapas não pode ser alterado');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_negocio_hist_sem_delete` BEFORE DELETE ON `negocio_etapa_hist`
BEGIN
  SELECT RAISE(ABORT, 'O histórico de etapas não pode ser excluído');
END;
--> statement-breakpoint
-- Propostas: valores imutáveis (contraproposta = nova versão); só a situação e a resposta mudam.
CREATE TRIGGER `trg_proposta_valores` BEFORE UPDATE ON `proposta`
WHEN NEW.valor_centavos IS NOT OLD.valor_centavos OR NEW.sinal_centavos IS NOT OLD.sinal_centavos OR NEW.parcelas IS NOT OLD.parcelas
  OR NEW.financiamento_centavos IS NOT OLD.financiamento_centavos OR NEW.financiamento_banco IS NOT OLD.financiamento_banco
  OR NEW.condicoes IS NOT OLD.condicoes OR NEW.autor IS NOT OLD.autor OR NEW.versao IS NOT OLD.versao OR NEW.negocio_id IS NOT OLD.negocio_id
BEGIN
  SELECT RAISE(ABORT, 'Propostas registradas não podem ser alteradas; registre uma contraproposta');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_proposta_sem_delete` BEFORE DELETE ON `proposta`
BEGIN
  SELECT RAISE(ABORT, 'Propostas não podem ser excluídas');
END;
--> statement-breakpoint
-- Liberações de comissão: só podem ser marcadas como canceladas.
CREATE TRIGGER `trg_comissao_liberacao_valores` BEFORE UPDATE ON `comissao_liberacao`
WHEN NEW.valor_centavos IS NOT OLD.valor_centavos OR NEW.rateio_id IS NOT OLD.rateio_id OR NEW.titulo_id IS NOT OLD.titulo_id OR OLD.cancelada = 1
BEGIN
  SELECT RAISE(ABORT, 'Liberações de comissão não podem ser alteradas');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_comissao_liberacao_sem_delete` BEFORE DELETE ON `comissao_liberacao`
BEGIN
  SELECT RAISE(ABORT, 'Liberações de comissão não podem ser excluídas');
END;
--> statement-breakpoint
-- Modelo padrão de rateio (Q24, ajustável em Comissões): imobiliária 50%, captador 20%, vendedor 30%.
INSERT OR IGNORE INTO `configuracao` (`chave`, `valor`) VALUES ('rateio_comissao', '{"itens":[{"papel":"IMOBILIARIA","percentualBp":5000},{"papel":"CAPTADOR","percentualBp":2000},{"papel":"VENDEDOR","percentualBp":3000}]}');
