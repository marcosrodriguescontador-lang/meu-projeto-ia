CREATE TABLE `aluguel_vigencia` (
	`contrato_id` integer NOT NULL,
	`competencia` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`origem` text NOT NULL,
	`origem_id` integer,
	`criado_em` text NOT NULL,
	`criado_por` integer,
	PRIMARY KEY(`contrato_id`, `competencia`),
	FOREIGN KEY (`contrato_id`) REFERENCES `contrato_locacao`(`id`) ON UPDATE no action ON DELETE restrict
);
