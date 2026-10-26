CREATE TABLE `conciliacao` (
	`extrato_linha_id` integer PRIMARY KEY NOT NULL,
	`partida_id` integer NOT NULL,
	`automatica` integer DEFAULT false NOT NULL,
	`conciliado_em` text NOT NULL,
	`conciliado_por` integer,
	FOREIGN KEY (`extrato_linha_id`) REFERENCES `extrato_linha`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`partida_id`) REFERENCES `partida`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conciliacao_partida_id_unique` ON `conciliacao` (`partida_id`);--> statement-breakpoint
CREATE TABLE `extrato_importacao` (
	`id` integer PRIMARY KEY NOT NULL,
	`conta_financeira_id` integer NOT NULL,
	`arquivo` text NOT NULL,
	`formato` text NOT NULL,
	`sha256` text NOT NULL,
	`periodo_inicio` text,
	`periodo_fim` text,
	`saldo_final_centavos` integer,
	`data_saldo_final` text,
	`linhas_lidas` integer NOT NULL,
	`linhas_novas` integer NOT NULL,
	`importado_em` text NOT NULL,
	`importado_por` integer,
	FOREIGN KEY (`conta_financeira_id`) REFERENCES `conta_financeira`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_extrato_arquivo` ON `extrato_importacao` (`conta_financeira_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `extrato_linha` (
	`id` integer PRIMARY KEY NOT NULL,
	`importacao_id` integer NOT NULL,
	`conta_financeira_id` integer NOT NULL,
	`data` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`descricao` text NOT NULL,
	`documento` text,
	`chave` text NOT NULL,
	`situacao` text DEFAULT 'PENDENTE' NOT NULL,
	`motivo_ignorar` text,
	FOREIGN KEY (`importacao_id`) REFERENCES `extrato_importacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_financeira_id`) REFERENCES `conta_financeira`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_extrato_linha_chave` ON `extrato_linha` (`conta_financeira_id`,`chave`);--> statement-breakpoint
CREATE INDEX `ix_extrato_linha_conta` ON `extrato_linha` (`conta_financeira_id`,`situacao`,`data`);--> statement-breakpoint
CREATE TABLE `transferencia` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`origem_id` integer NOT NULL,
	`destino_id` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`descricao` text NOT NULL,
	`lancamento_id` integer NOT NULL,
	`estornada` integer DEFAULT false NOT NULL,
	`estorno_motivo` text,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`origem_id`) REFERENCES `conta_financeira`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destino_id`) REFERENCES `conta_financeira`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `contrato_lancamento` ADD `natureza` text DEFAULT 'OUTRO' NOT NULL;