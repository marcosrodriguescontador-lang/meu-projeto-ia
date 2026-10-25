CREATE TABLE `caracteristica` (
	`id` integer PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`grupo` text NOT NULL,
	`ativa` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `caracteristica_nome_unique` ON `caracteristica` (`nome`);--> statement-breakpoint
CREATE TABLE `imovel` (
	`id` integer PRIMARY KEY NOT NULL,
	`codigo` integer NOT NULL,
	`tipo` text NOT NULL,
	`finalidade` text NOT NULL,
	`cep` text NOT NULL,
	`logradouro` text NOT NULL,
	`numero` text NOT NULL,
	`complemento` text,
	`bairro` text NOT NULL,
	`cidade` text NOT NULL,
	`uf` text NOT NULL,
	`endereco_busca` text NOT NULL,
	`matricula` text,
	`cartorio` text,
	`inscricao_municipal` text,
	`area_construida` integer,
	`area_terreno` integer,
	`dormitorios` integer DEFAULT 0 NOT NULL,
	`suites` integer DEFAULT 0 NOT NULL,
	`banheiros` integer DEFAULT 0 NOT NULL,
	`vagas` integer DEFAULT 0 NOT NULL,
	`descricao_comercial` text,
	`observacoes_internas` text,
	`condominio_centavos` integer,
	`iptu_anual_centavos` integer,
	`corretor_id` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	`excluido_em` text,
	`excluido_por` integer,
	`motivo_exclusao` text,
	FOREIGN KEY (`corretor_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imovel_codigo_unique` ON `imovel` (`codigo`);--> statement-breakpoint
CREATE INDEX `ix_imovel_cidade_bairro` ON `imovel` (`cidade`,`bairro`);--> statement-breakpoint
CREATE INDEX `ix_imovel_tipo` ON `imovel` (`tipo`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_imovel_matricula` ON `imovel` (`matricula`,`cartorio`) WHERE excluido_em IS NULL AND matricula IS NOT NULL;--> statement-breakpoint
CREATE TABLE `imovel_caracteristica` (
	`imovel_id` integer NOT NULL,
	`caracteristica_id` integer NOT NULL,
	PRIMARY KEY(`imovel_id`, `caracteristica_id`),
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`caracteristica_id`) REFERENCES `caracteristica`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_imovel_caract_c` ON `imovel_caracteristica` (`caracteristica_id`);--> statement-breakpoint
CREATE TABLE `imovel_foto` (
	`id` integer PRIMARY KEY NOT NULL,
	`imovel_id` integer NOT NULL,
	`anexo_id` integer NOT NULL,
	`miniatura_uuid` text NOT NULL,
	`ordem` integer NOT NULL,
	`capa` integer DEFAULT false NOT NULL,
	`legenda` text,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`anexo_id`) REFERENCES `anexo`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imovel_foto_anexo_id_unique` ON `imovel_foto` (`anexo_id`);--> statement-breakpoint
CREATE INDEX `ix_imovel_foto_imovel` ON `imovel_foto` (`imovel_id`,`ordem`);--> statement-breakpoint
CREATE TABLE `imovel_oferta` (
	`id` integer PRIMARY KEY NOT NULL,
	`imovel_id` integer NOT NULL,
	`modalidade` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`comissao_bp` integer DEFAULT 0 NOT NULL,
	`situacao` text NOT NULL,
	`situacao_desde` text NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_imovel_oferta_modalidade` ON `imovel_oferta` (`imovel_id`,`modalidade`);--> statement-breakpoint
CREATE INDEX `ix_imovel_oferta_busca` ON `imovel_oferta` (`modalidade`,`situacao`,`valor_centavos`);--> statement-breakpoint
CREATE TABLE `imovel_proprietario` (
	`imovel_id` integer NOT NULL,
	`pessoa_id` integer NOT NULL,
	`percentual_bp` integer NOT NULL,
	`principal` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`imovel_id`, `pessoa_id`),
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_imovel_proprietario_pessoa` ON `imovel_proprietario` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `oferta_situacao_hist` (
	`id` integer PRIMARY KEY NOT NULL,
	`oferta_id` integer NOT NULL,
	`de` text,
	`para` text NOT NULL,
	`motivo` text,
	`usuario_id` integer,
	`ts` text NOT NULL,
	FOREIGN KEY (`oferta_id`) REFERENCES `imovel_oferta`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_oferta_hist_oferta` ON `oferta_situacao_hist` (`oferta_id`);