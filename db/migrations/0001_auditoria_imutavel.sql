-- A trilha de auditoria é append-only: alterações e exclusões são proibidas no próprio banco.
CREATE TRIGGER `trg_auditoria_sem_update` BEFORE UPDATE ON `auditoria`
BEGIN
  SELECT RAISE(ABORT, 'Registros de auditoria não podem ser alterados');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_auditoria_sem_delete` BEFORE DELETE ON `auditoria`
BEGIN
  SELECT RAISE(ABORT, 'Registros de auditoria não podem ser excluídos');
END;
--> statement-breakpoint
-- Papéis de pessoa permitidos (integridade de domínio).
CREATE TRIGGER `trg_pessoa_papel_valido` BEFORE INSERT ON `pessoa_papel`
WHEN NEW.papel NOT IN ('PROPRIETARIO','LOCATARIO','FIADOR','COMPRADOR','VENDEDOR','CORRETOR','PRESTADOR','FORNECEDOR','COLABORADOR')
BEGIN
  SELECT RAISE(ABORT, 'Papel de pessoa inválido');
END;
