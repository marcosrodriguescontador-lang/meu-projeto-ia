CREATE TABLE `aditivo` (
	`id` integer PRIMARY KEY NOT NULL,
	`contrato_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`data` text NOT NULL,
	`descricao` text NOT NULL,
	`data_fim_anterior` text,
	`data_fim_nova` text,
	`valor_anterior_centavos` integer,
	`valor_novo_centavos` integer,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `baixa` (
	`id` integer PRIMARY KEY NOT NULL,
	`titulo_id` integer NOT NULL,
	`data` text NOT NULL,
	`principal_centavos` integer NOT NULL,
	`multa_centavos` integer DEFAULT 0 NOT NULL,
	`juros_centavos` integer DEFAULT 0 NOT NULL,
	`desconto_centavos` integer DEFAULT 0 NOT NULL,
	`total_centavos` integer NOT NULL,
	`conta_financeira_id` integer,
	`forma` text NOT NULL,
	`observacao` text,
	`lancamento_id` integer,
	`estornada` integer DEFAULT false NOT NULL,
	`estorno_lancamento_id` integer,
	`estorno_motivo` text,
	`estornada_em` text,
	`estornada_por` integer,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`titulo_id`) REFERENCES `titulo`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_financeira_id`) REFERENCES `conta_financeira`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_baixa_titulo` ON `baixa` (`titulo_id`);--> statement-breakpoint
CREATE TABLE `baixa_item` (
	`baixa_id` integer NOT NULL,
	`titulo_item_id` integer NOT NULL,
	`pago_centavos` integer NOT NULL,
	`desconto_centavos` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`baixa_id`, `titulo_item_id`),
	FOREIGN KEY (`baixa_id`) REFERENCES `baixa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`titulo_item_id`) REFERENCES `titulo_item`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_baixa_item_item` ON `baixa_item` (`titulo_item_id`);--> statement-breakpoint
CREATE TABLE `conta_financeira` (
	`id` integer PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`banco_codigo` text,
	`agencia` text,
	`conta` text,
	`titularidade` text NOT NULL,
	`saldo_inicial_centavos` integer DEFAULT 0 NOT NULL,
	`data_saldo_inicial` text NOT NULL,
	`ativa` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conta_financeira_nome_unique` ON `conta_financeira` (`nome`);--> statement-breakpoint
CREATE TABLE `conta_gerencial` (
	`id` integer PRIMARY KEY NOT NULL,
	`codigo` text NOT NULL,
	`nome` text NOT NULL,
	`natureza` text NOT NULL,
	`recurso` text NOT NULL,
	`sistema` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conta_gerencial_codigo_unique` ON `conta_gerencial` (`codigo`);--> statement-breakpoint
CREATE TABLE `contrato_encargo` (
	`id` integer PRIMARY KEY NOT NULL,
	`contrato_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`descricao` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`competencia_inicio` text NOT NULL,
	`competencia_fim` text,
	`proporcional` integer DEFAULT false NOT NULL,
	`destino` text NOT NULL,
	`beneficiario_id` integer,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`beneficiario_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `contrato_lancamento` (
	`id` integer PRIMARY KEY NOT NULL,
	`contrato_id` integer NOT NULL,
	`competencia` text NOT NULL,
	`descricao` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`pagador` text NOT NULL,
	`destino` text NOT NULL,
	`beneficiario_id` integer,
	`situacao` text NOT NULL,
	`titulo_id` integer,
	`lancamento_id` integer,
	`motivo_cancelamento` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`beneficiario_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `contrato_locacao` (
	`id` integer PRIMARY KEY NOT NULL,
	`numero` integer NOT NULL,
	`imovel_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`situacao` text NOT NULL,
	`data_inicio` text NOT NULL,
	`data_fim` text NOT NULL,
	`aluguel_centavos` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`indice_id` integer,
	`periodicidade_reajuste_meses` integer DEFAULT 12 NOT NULL,
	`proximo_reajuste` text,
	`reajuste_negativo` integer DEFAULT false NOT NULL,
	`taxa_administracao_bp` integer NOT NULL,
	`taxa_intermediacao_bp` integer DEFAULT 0 NOT NULL,
	`multa_atraso_bp` integer NOT NULL,
	`juros_mes_bp` integer NOT NULL,
	`destino_encargos` text NOT NULL,
	`multa_rescisoria_alugueis` integer DEFAULT 3 NOT NULL,
	`garantia_tipo` text NOT NULL,
	`garantia_valor_centavos` integer,
	`garantia_seguradora` text,
	`garantia_apolice` text,
	`garantia_vigencia_fim` text,
	`observacoes` text,
	`ativado_em` text,
	`encerrado_em` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`imovel_id`) REFERENCES `imovel`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`indice_id`) REFERENCES `indice_economico`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contrato_locacao_numero_unique` ON `contrato_locacao` (`numero`);--> statement-breakpoint
CREATE INDEX `ix_contrato_imovel` ON `contrato_locacao` (`imovel_id`);--> statement-breakpoint
CREATE INDEX `ix_contrato_situacao` ON `contrato_locacao` (`situacao`);--> statement-breakpoint
CREATE TABLE `contrato_parte` (
	`contrato_id` integer NOT NULL,
	`pessoa_id` integer NOT NULL,
	`papel` text NOT NULL,
	`percentual_bp` integer DEFAULT 0 NOT NULL,
	`principal` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`contrato_id`, `pessoa_id`, `papel`),
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_contrato_parte_pessoa` ON `contrato_parte` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `feriado` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`descricao` text NOT NULL,
	`abrangencia` text DEFAULT 'MUNICIPAL' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feriado_data_unique` ON `feriado` (`data`);--> statement-breakpoint
CREATE TABLE `indice_economico` (
	`id` integer PRIMARY KEY NOT NULL,
	`sigla` text NOT NULL,
	`nome` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indice_economico_sigla_unique` ON `indice_economico` (`sigla`);--> statement-breakpoint
CREATE TABLE `indice_valor` (
	`indice_id` integer NOT NULL,
	`competencia` text NOT NULL,
	`variacao_ppm` integer NOT NULL,
	`informado_por` integer,
	`informado_em` text NOT NULL,
	PRIMARY KEY(`indice_id`, `competencia`),
	FOREIGN KEY (`indice_id`) REFERENCES `indice_economico`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `lancamento` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`historico` text NOT NULL,
	`origem` text NOT NULL,
	`origem_id` integer,
	`estorno_de_id` integer,
	`criado_em` text NOT NULL,
	`criado_por` integer
);
--> statement-breakpoint
CREATE INDEX `ix_lancamento_origem` ON `lancamento` (`origem`,`origem_id`);--> statement-breakpoint
CREATE INDEX `ix_lancamento_data` ON `lancamento` (`data`);--> statement-breakpoint
CREATE TABLE `partida` (
	`id` integer PRIMARY KEY NOT NULL,
	`lancamento_id` integer NOT NULL,
	`conta_gerencial_id` integer NOT NULL,
	`pessoa_id` integer,
	`conta_financeira_id` integer,
	`contrato_id` integer,
	`titulo_id` integer,
	`debito_centavos` integer DEFAULT 0 NOT NULL,
	`credito_centavos` integer DEFAULT 0 NOT NULL,
	`historico` text NOT NULL,
	`repasse_id` integer,
	FOREIGN KEY (`lancamento_id`) REFERENCES `lancamento`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_gerencial_id`) REFERENCES `conta_gerencial`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_financeira_id`) REFERENCES `conta_financeira`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_partida_conta_pessoa` ON `partida` (`conta_gerencial_id`,`pessoa_id`,`repasse_id`);--> statement-breakpoint
CREATE INDEX `ix_partida_conta_financeira` ON `partida` (`conta_financeira_id`);--> statement-breakpoint
CREATE INDEX `ix_partida_lancamento` ON `partida` (`lancamento_id`);--> statement-breakpoint
CREATE TABLE `reajuste` (
	`id` integer PRIMARY KEY NOT NULL,
	`contrato_id` integer NOT NULL,
	`data_base` text NOT NULL,
	`indice_id` integer,
	`competencia_inicial` text,
	`competencia_final` text,
	`acumulado_ppm` integer,
	`aplicado_ppm` integer NOT NULL,
	`valor_anterior_centavos` integer NOT NULL,
	`valor_novo_centavos` integer NOT NULL,
	`situacao` text NOT NULL,
	`motivo` text,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`indice_id`) REFERENCES `indice_economico`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `renegociacao` (
	`id` integer PRIMARY KEY NOT NULL,
	`pessoa_id` integer NOT NULL,
	`contrato_id` integer,
	`data` text NOT NULL,
	`motivo` text NOT NULL,
	`saldo_original_centavos` integer NOT NULL,
	`encargos_centavos` integer NOT NULL,
	`desconto_centavos` integer NOT NULL,
	`total_centavos` integer NOT NULL,
	`parcelas` integer NOT NULL,
	`titulos_origem` text NOT NULL,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `repasse` (
	`id` integer PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`pessoa_id` integer NOT NULL,
	`conta_gerencial_id` integer NOT NULL,
	`data` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`titulo_id` integer,
	`situacao` text NOT NULL,
	`motivo_cancelamento` text,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_gerencial_id`) REFERENCES `conta_gerencial`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `rescisao` (
	`id` integer PRIMARY KEY NOT NULL,
	`contrato_id` integer NOT NULL,
	`data_entrega_chaves` text NOT NULL,
	`iniciativa` text NOT NULL,
	`motivo` text NOT NULL,
	`multa_calculada_centavos` integer NOT NULL,
	`multa_cobrada_centavos` integer NOT NULL,
	`dispensa_motivo` text,
	`memoria` text NOT NULL,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rescisao_contrato_id_unique` ON `rescisao` (`contrato_id`);--> statement-breakpoint
CREATE TABLE `titulo` (
	`id` integer PRIMARY KEY NOT NULL,
	`sentido` text NOT NULL,
	`origem` text NOT NULL,
	`contrato_id` integer,
	`pessoa_id` integer NOT NULL,
	`descricao` text NOT NULL,
	`competencia` text,
	`emissao` text NOT NULL,
	`vencimento_original` text NOT NULL,
	`vencimento` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`situacao` text NOT NULL,
	`recurso` text NOT NULL,
	`multa_bp` integer DEFAULT 0 NOT NULL,
	`juros_mes_bp` integer DEFAULT 0 NOT NULL,
	`destino_encargos` text DEFAULT 'PROPRIETARIO' NOT NULL,
	`chave_idempotencia` text,
	`renegociacao_id` integer,
	`repasse_id` integer,
	`motivo_cancelamento` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`criado_por` integer,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`atualizado_por` integer,
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `titulo_chave_idempotencia_unique` ON `titulo` (`chave_idempotencia`);--> statement-breakpoint
CREATE INDEX `ix_titulo_situacao_venc` ON `titulo` (`sentido`,`situacao`,`vencimento`);--> statement-breakpoint
CREATE INDEX `ix_titulo_contrato` ON `titulo` (`contrato_id`);--> statement-breakpoint
CREATE INDEX `ix_titulo_pessoa` ON `titulo` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `titulo_item` (
	`id` integer PRIMARY KEY NOT NULL,
	`titulo_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`descricao` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`destino` text NOT NULL,
	`beneficiario_id` integer,
	`conta_gerencial_id` integer,
	`taxa_bp` integer DEFAULT 0 NOT NULL,
	`taxa_tipo` text,
	`lancamento_avulso_id` integer,
	FOREIGN KEY (`titulo_id`) REFERENCES `titulo`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`beneficiario_id`) REFERENCES `pessoa`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_gerencial_id`) REFERENCES `conta_gerencial`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_titulo_item_titulo` ON `titulo_item` (`titulo_id`);