-- Categorias de receitas próprias e despesas da imobiliária (editáveis: sistema = 0).
INSERT INTO `conta_gerencial` (`codigo`, `nome`, `natureza`, `recurso`, `sistema`) VALUES
  ('3.2.01', 'Receita — comissões de venda', 'RECEITA', 'PROPRIO', 1),
  ('3.2.02', 'Receita — avaliações e laudos', 'RECEITA', 'PROPRIO', 0),
  ('3.2.03', 'Receita — rendimentos financeiros', 'RECEITA', 'PROPRIO', 0),
  ('3.2.99', 'Receita — outras receitas', 'RECEITA', 'PROPRIO', 0),
  ('4.1.01', 'Despesa — pessoal e encargos', 'DESPESA', 'PROPRIO', 0),
  ('4.1.02', 'Despesa — pró-labore', 'DESPESA', 'PROPRIO', 0),
  ('4.1.03', 'Despesa — comissões de corretores', 'DESPESA', 'PROPRIO', 1),
  ('4.2.01', 'Despesa — aluguel e condomínio do escritório', 'DESPESA', 'PROPRIO', 0),
  ('4.2.02', 'Despesa — energia, água e telefone', 'DESPESA', 'PROPRIO', 0),
  ('4.2.03', 'Despesa — sistemas, internet e tecnologia', 'DESPESA', 'PROPRIO', 0),
  ('4.2.04', 'Despesa — marketing e portais', 'DESPESA', 'PROPRIO', 0),
  ('4.2.05', 'Despesa — material de escritório', 'DESPESA', 'PROPRIO', 0),
  ('4.2.06', 'Despesa — contabilidade e jurídico', 'DESPESA', 'PROPRIO', 0),
  ('4.2.07', 'Despesa — CRECI e associações', 'DESPESA', 'PROPRIO', 0),
  ('4.2.08', 'Despesa — veículos e deslocamento', 'DESPESA', 'PROPRIO', 0),
  ('4.3.01', 'Despesa — tarifas bancárias', 'DESPESA', 'PROPRIO', 0),
  ('4.3.02', 'Despesa — juros e encargos financeiros', 'DESPESA', 'PROPRIO', 0),
  ('4.4.01', 'Despesa — tributos (ISS, Simples, IRPJ, CSLL)', 'DESPESA', 'PROPRIO', 0),
  ('4.9.99', 'Despesa — outras despesas', 'DESPESA', 'PROPRIO', 0);
--> statement-breakpoint
-- Transferências e conciliações: imutáveis, exceto a marcação de estorno da transferência.
CREATE TRIGGER `trg_transferencia_valores` BEFORE UPDATE ON `transferencia`
WHEN NEW.valor_centavos IS NOT OLD.valor_centavos OR NEW.origem_id IS NOT OLD.origem_id OR NEW.destino_id IS NOT OLD.destino_id OR NEW.data IS NOT OLD.data OR OLD.estornada = 1
BEGIN
  SELECT RAISE(ABORT, 'Transferências não podem ser alteradas; utilize o estorno');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_extrato_linha_valores` BEFORE UPDATE ON `extrato_linha`
WHEN NEW.valor_centavos IS NOT OLD.valor_centavos OR NEW.data IS NOT OLD.data OR NEW.chave IS NOT OLD.chave OR NEW.conta_financeira_id IS NOT OLD.conta_financeira_id
BEGIN
  SELECT RAISE(ABORT, 'Linhas de extrato importadas não podem ser alteradas');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_extrato_linha_sem_delete` BEFORE DELETE ON `extrato_linha`
BEGIN
  SELECT RAISE(ABORT, 'Linhas de extrato importadas não podem ser excluídas');
END;
