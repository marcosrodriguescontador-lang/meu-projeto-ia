CREATE TABLE `anexo` (
	`id` integer PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`entidade` text NOT NULL,
	`entidade_id` integer NOT NULL,
	`categoria` text NOT NULL,
	`nome_original` text NOT NULL,
	`mime` text NOT NULL,
	`tamanho` integer NOT NULL,
	`sha256` text NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`excluido_em` text,
	`excluido_por` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anexo_uuid_unique` ON `anexo` (`uuid`);--> statement-breakpoint
CREATE INDEX `ix_anexo_entidade` ON `anexo` (`entidade`,`entidade_id`);--> statement-breakpoint
CREATE TABLE `auditoria` (
	`id` integer PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`usuario_id` integer,
	`usuario_login` text,
	`acao` text NOT NULL,
	`entidade` text NOT NULL,
	`entidade_id` text,
	`descricao` text,
	`antes` text,
	`depois` text,
	`estacao` text,
	`hash_anterior` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_auditoria_entidade` ON `auditoria` (`entidade`,`entidade_id`);--> statement-breakpoint
CREATE INDEX `ix_auditoria_ts` ON `auditoria` (`ts`);--> statement-breakpoint
CREATE TABLE `backup_registro` (
	`id` integer PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`tipo` text NOT NULL,
	`arquivo` text NOT NULL,
	`tamanho` integer,
	`sha256` text,
	`versao_app` text NOT NULL,
	`versao_schema` text NOT NULL,
	`validado` integer DEFAULT false NOT NULL,
	`resultado` text NOT NULL,
	`mensagem` text,
	`usuario_id` integer
);
--> statement-breakpoint
CREATE TABLE `configuracao` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer
);
--> statement-breakpoint
CREATE TABLE `contato` (
	`id` integer PRIMARY KEY NOT NULL,
	`pessoa_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`valor` text NOT NULL,
	`nome_contato` text,
	`principal` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_contato_pessoa` ON `contato` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `dado_bancario` (
	`id` integer PRIMARY KEY NOT NULL,
	`pessoa_id` integer NOT NULL,
	`banco_codigo` text NOT NULL,
	`banco_nome` text NOT NULL,
	`tipo_conta` text NOT NULL,
	`agencia_cifrada` text NOT NULL,
	`conta_cifrada` text NOT NULL,
	`digito_cifrado` text NOT NULL,
	`conta_mascara` text NOT NULL,
	`pix_tipo` text,
	`pix_chave_cifrada` text,
	`titular_nome` text NOT NULL,
	`titular_documento` text NOT NULL,
	`principal` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	`excluido_em` text,
	`excluido_por` integer,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_dado_bancario_pessoa` ON `dado_bancario` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `endereco` (
	`id` integer PRIMARY KEY NOT NULL,
	`pessoa_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`cep` text NOT NULL,
	`logradouro` text NOT NULL,
	`numero` text NOT NULL,
	`complemento` text,
	`bairro` text NOT NULL,
	`cidade` text NOT NULL,
	`uf` text NOT NULL,
	`principal` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_endereco_pessoa` ON `endereco` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `perfil` (
	`id` integer PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`sistema` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `perfil_nome_unique` ON `perfil` (`nome`);--> statement-breakpoint
CREATE TABLE `perfil_permissao` (
	`perfil_id` integer NOT NULL,
	`permissao` text NOT NULL,
	PRIMARY KEY(`perfil_id`, `permissao`),
	FOREIGN KEY (`perfil_id`) REFERENCES `perfil`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pessoa` (
	`id` integer PRIMARY KEY NOT NULL,
	`codigo` integer NOT NULL,
	`tipo` text NOT NULL,
	`nome` text NOT NULL,
	`nome_busca` text NOT NULL,
	`nome_fantasia` text,
	`documento` text NOT NULL,
	`rg_ie` text,
	`orgao_emissor` text,
	`nascimento` text,
	`nacionalidade` text,
	`estado_civil` text,
	`regime_bens` text,
	`profissao` text,
	`situacao` text DEFAULT 'ATIVO' NOT NULL,
	`observacoes` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	`excluido_em` text,
	`excluido_por` integer,
	`motivo_exclusao` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pessoa_codigo_unique` ON `pessoa` (`codigo`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_pessoa_documento_ativo` ON `pessoa` (`documento`) WHERE excluido_em IS NULL;--> statement-breakpoint
CREATE INDEX `ix_pessoa_nome_busca` ON `pessoa` (`nome_busca`);--> statement-breakpoint
CREATE TABLE `pessoa_papel` (
	`pessoa_id` integer NOT NULL,
	`papel` text NOT NULL,
	`dados` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`pessoa_id`, `papel`),
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_pessoa_papel_papel` ON `pessoa_papel` (`papel`);--> statement-breakpoint
CREATE TABLE `pessoa_relacao` (
	`id` integer PRIMARY KEY NOT NULL,
	`pessoa_id` integer NOT NULL,
	`relacionada_id` integer NOT NULL,
	`tipo` text NOT NULL,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`relacionada_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_pessoa_relacao` ON `pessoa_relacao` (`pessoa_id`,`relacionada_id`,`tipo`);--> statement-breakpoint
CREATE TABLE `sequencia` (
	`nome` text PRIMARY KEY NOT NULL,
	`proximo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usuario` (
	`id` integer PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`login` text NOT NULL,
	`email` text,
	`senha_hash` text NOT NULL,
	`perfil_id` integer NOT NULL,
	`pessoa_id` integer,
	`ativo` integer DEFAULT true NOT NULL,
	`tentativas_falhas` integer DEFAULT 0 NOT NULL,
	`bloqueado_ate` text,
	`deve_trocar_senha` integer DEFAULT false NOT NULL,
	`senha_alterada_em` text,
	`ultimo_acesso_em` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`perfil_id`) REFERENCES `perfil`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuario_login_unique` ON `usuario` (`login`);