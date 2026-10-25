-- Integridade de domínio dos imóveis.
CREATE TRIGGER `trg_oferta_situacao_valida_ins` BEFORE INSERT ON `imovel_oferta`
WHEN NEW.situacao NOT IN ('DISPONIVEL','RESERVADO','EM_NEGOCIACAO','ALUGADO','VENDIDO','INDISPONIVEL','INATIVO')
  OR NEW.modalidade NOT IN ('VENDA','LOCACAO')
  OR (NEW.modalidade = 'VENDA' AND NEW.situacao = 'ALUGADO')
  OR (NEW.modalidade = 'LOCACAO' AND NEW.situacao = 'VENDIDO')
  OR NEW.valor_centavos < 0 OR NEW.comissao_bp < 0 OR NEW.comissao_bp > 10000
BEGIN
  SELECT RAISE(ABORT, 'Oferta de imóvel inválida');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_oferta_situacao_valida_upd` BEFORE UPDATE ON `imovel_oferta`
WHEN NEW.situacao NOT IN ('DISPONIVEL','RESERVADO','EM_NEGOCIACAO','ALUGADO','VENDIDO','INDISPONIVEL','INATIVO')
  OR (NEW.modalidade = 'VENDA' AND NEW.situacao = 'ALUGADO')
  OR (NEW.modalidade = 'LOCACAO' AND NEW.situacao = 'VENDIDO')
  OR NEW.valor_centavos < 0 OR NEW.comissao_bp < 0 OR NEW.comissao_bp > 10000
BEGIN
  SELECT RAISE(ABORT, 'Oferta de imóvel inválida');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_imovel_proprietario_percentual` BEFORE INSERT ON `imovel_proprietario`
WHEN NEW.percentual_bp <= 0 OR NEW.percentual_bp > 10000
BEGIN
  SELECT RAISE(ABORT, 'Percentual de participação inválido');
END;
--> statement-breakpoint
-- Histórico de situação é append-only.
CREATE TRIGGER `trg_oferta_hist_sem_update` BEFORE UPDATE ON `oferta_situacao_hist`
BEGIN
  SELECT RAISE(ABORT, 'Histórico de situação não pode ser alterado');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_oferta_hist_sem_delete` BEFORE DELETE ON `oferta_situacao_hist`
BEGIN
  SELECT RAISE(ABORT, 'Histórico de situação não pode ser excluído');
END;
--> statement-breakpoint
-- Catálogo inicial de características (editável futuramente).
INSERT INTO `caracteristica` (`nome`, `grupo`) VALUES
  ('Área de serviço', 'Imóvel'), ('Armários embutidos', 'Imóvel'), ('Ar-condicionado', 'Imóvel'), ('Churrasqueira', 'Imóvel'),
  ('Cozinha planejada', 'Imóvel'), ('Escritório', 'Imóvel'), ('Lareira', 'Imóvel'), ('Mobiliado', 'Imóvel'),
  ('Piscina privativa', 'Imóvel'), ('Quintal', 'Imóvel'), ('Sacada / varanda', 'Imóvel'), ('Varanda gourmet', 'Imóvel'),
  ('Aquecimento solar', 'Imóvel'), ('Energia solar', 'Imóvel'), ('Edícula', 'Imóvel'), ('Depósito', 'Imóvel'),
  ('Academia', 'Condomínio'), ('Elevador', 'Condomínio'), ('Piscina', 'Condomínio'), ('Playground', 'Condomínio'),
  ('Portaria 24 h', 'Condomínio'), ('Salão de festas', 'Condomínio'), ('Quadra esportiva', 'Condomínio'),
  ('Espaço gourmet', 'Condomínio'), ('Condomínio fechado', 'Condomínio'), ('Aceita pets', 'Condomínio'),
  ('Doca / pé-direito alto', 'Comercial'), ('Recepção', 'Comercial'), ('Copa', 'Comercial'), ('Estacionamento para clientes', 'Comercial'),
  ('Água / poço', 'Rural'), ('Curral', 'Rural'), ('Pasto formado', 'Rural'), ('Rio / nascente', 'Rural'),
  ('Esquina', 'Localização'), ('Próximo a escolas', 'Localização'), ('Próximo a comércio', 'Localização'), ('Vista panorâmica', 'Localização');
