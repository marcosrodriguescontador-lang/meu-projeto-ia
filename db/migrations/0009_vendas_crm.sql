CREATE TABLE `atividade` (
	`id` integer PRIMARY KEY NOT NULL,
	`negocio_id` integer,
	`lead_id` integer,
	`responsavel_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text,
	`agendada_para` text NOT NULL,
	`concluida_em` text,
	`resultado` text,
	`cancelada_em` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`negocio_id`) REFERENCES `negocio`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`responsavel_id`) REFERENCES `usuario`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_atividade_agenda` ON `atividade` (`responsavel_id`,`agendada_para`);--> statement-breakpoint
CREATE INDEX `ix_atividade_negocio` ON `atividade` (`negocio_id`);--> statement-breakpoint
CREATE TABLE `comissao` (
	`id` integer PRIMARY KEY NOT NULL,
	`origem` text NOT NULL,
	`venda_id` integer,
	`contrato_id` integer,
	`negocio_id` integer,
	`base_centavos` integer NOT NULL,
	`percentual_bp` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`pagador_id` integer,
	`titulo_id` integer,
	`situacao` text DEFAULT 'ATIVA' NOT NULL,
	`motivo_cancelamento` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`venda_id`) REFERENCES `venda`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`negocio_id`) REFERENCES `negocio`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pagador_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`titulo_id`) REFERENCES `titulo`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `comissao_liberacao` (
	`id` integer PRIMARY KEY NOT NULL,
	`rateio_id` integer NOT NULL,
	`baixa_id` integer,
	`valor_centavos` integer NOT NULL,
	`titulo_id` integer NOT NULL,
	`cancelada` integer DEFAULT false NOT NULL,
	`criado_em` text NOT NULL,
	FOREIGN KEY (`rateio_id`) REFERENCES `comissao_rateio`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`baixa_id`) REFERENCES `baixa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`titulo_id`) REFERENCES `titulo`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_comissao_liberacao` ON `comissao_liberacao` (`rateio_id`);--> statement-breakpoint
CREATE TABLE `comissao_rateio` (
	`id` integer PRIMARY KEY NOT NULL,
	`comissao_id` integer NOT NULL,
	`papel` text NOT NULL,
	`beneficiario_id` integer,
	`percentual_bp` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`comissao_id`) REFERENCES `comissao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`beneficiario_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_comissao_rateio` ON `comissao_rateio` (`comissao_id`);--> statement-breakpoint
CREATE TABLE `lead` (
	`id` integer PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`telefone` text,
	`email` text,
	`pessoa_id` integer,
	`origem_id` integer NOT NULL,
	`corretor_id` integer,
	`interesse` text NOT NULL,
	`tipo_imovel` text,
	`bairros` text,
	`valor_min_centavos` integer,
	`valor_max_centavos` integer,
	`dormitorios_min` integer,
	`observacoes` text,
	`consentimento_contato` integer DEFAULT false NOT NULL,
	`id_externo` text,
	`situacao` text DEFAULT 'ATIVO' NOT NULL,
	`motivo_descarte` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`origem_id`) REFERENCES `origem_lead`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corretor_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_lead_situacao` ON `lead` (`situacao`,`corretor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_lead_externo` ON `lead` (`origem_id`,`id_externo`);--> statement-breakpoint
CREATE TABLE `lead_imovel` (
	`lead_id` integer NOT NULL,
	`imovel_id` integer NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`lead_id`, `imovel_id`),
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `negocio` (
	`id` integer PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`lead_id` integer,
	`cliente_id` integer,
	`imovel_id` integer,
	`corretor_id` integer,
	`etapa` text NOT NULL,
	`etapa_desde` text NOT NULL,
	`valor_estimado_centavos` integer,
	`motivo_perda` text,
	`contrato_id` integer,
	`encerrado_em` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cliente_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corretor_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_negocio_funil` ON `negocio` (`tipo`,`etapa`);--> statement-breakpoint
CREATE INDEX `ix_negocio_corretor` ON `negocio` (`corretor_id`);--> statement-breakpoint
CREATE INDEX `ix_negocio_lead` ON `negocio` (`lead_id`);--> statement-breakpoint
CREATE TABLE `negocio_etapa_hist` (
	`id` integer PRIMARY KEY NOT NULL,
	`negocio_id` integer NOT NULL,
	`de` text,
	`para` text NOT NULL,
	`observacao` text,
	`usuario_id` integer,
	`ts` text NOT NULL,
	FOREIGN KEY (`negocio_id`) REFERENCES `negocio`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_negocio_hist` ON `negocio_etapa_hist` (`negocio_id`);--> statement-breakpoint
CREATE TABLE `origem_lead` (
	`id` integer PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`ativa` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `origem_lead_nome_unique` ON `origem_lead` (`nome`);--> statement-breakpoint
CREATE TABLE `proposta` (
	`id` integer PRIMARY KEY NOT NULL,
	`negocio_id` integer NOT NULL,
	`versao` integer NOT NULL,
	`anterior_id` integer,
	`autor` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`sinal_centavos` integer DEFAULT 0 NOT NULL,
	`parcelas` text DEFAULT '[]' NOT NULL,
	`financiamento_banco` text,
	`financiamento_centavos` integer DEFAULT 0 NOT NULL,
	`condicoes` text,
	`validade` text,
	`situacao` text NOT NULL,
	`resposta_em` text,
	`motivo` text,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`negocio_id`) REFERENCES `negocio`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_proposta_versao` ON `proposta` (`negocio_id`,`versao`);--> statement-breakpoint
CREATE TABLE `venda` (
	`id` integer PRIMARY KEY NOT NULL,
	`negocio_id` integer NOT NULL,
	`imovel_id` integer NOT NULL,
	`proposta_id` integer,
	`data_contrato` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`financiamento_banco` text,
	`financiamento_centavos` integer DEFAULT 0 NOT NULL,
	`situacao` text NOT NULL,
	`data_escritura` text,
	`distrato_motivo` text,
	`distrato_em` text,
	`observacoes` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`negocio_id`) REFERENCES `negocio`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposta_id`) REFERENCES `proposta`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venda_negocio_id_unique` ON `venda` (`negocio_id`);--> statement-breakpoint
CREATE TABLE `venda_parcela` (
	`id` integer PRIMARY KEY NOT NULL,
	`venda_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`descricao` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`vencimento` text NOT NULL,
	`via_imobiliaria` integer DEFAULT false NOT NULL,
	`titulo_id` integer,
	`paga_em` text,
	`situacao` text DEFAULT 'PREVISTA' NOT NULL,
	FOREIGN KEY (`venda_id`) REFERENCES `venda`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`titulo_id`) REFERENCES `titulo`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_venda_parcela` ON `venda_parcela` (`venda_id`);--> statement-breakpoint
CREATE TABLE `venda_parte` (
	`venda_id` integer NOT NULL,
	`pessoa_id` integer NOT NULL,
	`papel` text NOT NULL,
	`percentual_bp` integer NOT NULL,
	PRIMARY KEY(`venda_id`, `pessoa_id`, `papel`),
	FOREIGN KEY (`venda_id`) REFERENCES `venda`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `visita` (
	`id` integer PRIMARY KEY NOT NULL,
	`imovel_id` integer NOT NULL,
	`negocio_id` integer,
	`lead_id` integer,
	`corretor_id` integer,
	`data_hora` text NOT NULL,
	`situacao` text NOT NULL,
	`feedback` text,
	`avaliacao` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`negocio_id`) REFERENCES `negocio`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corretor_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_visita_data` ON `visita` (`data_hora`);--> statement-breakpoint
CREATE INDEX `ix_visita_imovel` ON `visita` (`imovel_id`);