CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`due_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`source_id` text,
	`extras` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_source_id_unique` ON `activities` (`source_id`);--> statement-breakpoint
CREATE INDEX `activities_job_idx` ON `activities` (`job_id`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`source_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `boards_source_id_unique` ON `boards` (`source_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`type` text,
	`address` text,
	`country` text,
	`notes` text,
	`source_id` text,
	`extras` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_source_id_unique` ON `companies` (`source_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`company_id` integer,
	`email` text,
	`phone` text,
	`linkedin` text,
	`notes` text,
	`source_id` text,
	`extras` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_source_id_unique` ON `contacts` (`source_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`filename` text NOT NULL,
	`path` text,
	`created_at` integer NOT NULL,
	`source_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_source_id_unique` ON `documents` (`source_id`);--> statement-breakpoint
CREATE INDEX `documents_job_idx` ON `documents` (`job_id`);--> statement-breakpoint
CREATE TABLE `job_contacts` (
	`job_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	PRIMARY KEY(`job_id`, `contact_id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board_id` integer NOT NULL,
	`stage_id` integer NOT NULL,
	`title` text NOT NULL,
	`company_id` integer,
	`location` text,
	`url` text,
	`salary` text,
	`color` text,
	`description` text,
	`deadline` integer,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`applied_at` integer,
	`rejected_at` integer,
	`source_id` text,
	`extras` text,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_id_unique` ON `jobs` (`source_id`);--> statement-breakpoint
CREATE INDEX `jobs_stage_idx` ON `jobs` (`stage_id`,`position`);--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `jobs` (`company_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`source_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_source_id_unique` ON `notes` (`source_id`);--> statement-breakpoint
CREATE INDEX `notes_job_idx` ON `notes` (`job_id`);--> statement-breakpoint
CREATE TABLE `stage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`from_stage_id` integer,
	`to_stage_id` integer NOT NULL,
	`moved_at` integer NOT NULL,
	`source_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage_events_source_id_unique` ON `stage_events` (`source_id`);--> statement-breakpoint
CREATE INDEX `stage_events_job_idx` ON `stage_events` (`job_id`,`moved_at`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board_id` integer NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`source_id` text,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stages_source_id_unique` ON `stages` (`source_id`);--> statement-breakpoint
CREATE INDEX `stages_board_idx` ON `stages` (`board_id`);