CREATE TABLE `availability` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`note` text,
	`taken_by_activity_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`taken_by_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `starts_at` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `ends_at` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `meeting_url` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `meeting_id` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `meeting_passcode` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `interviewer_name` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `interviewer_title` text;--> statement-breakpoint
ALTER TABLE `job_contacts` ADD `role` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_min` real;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_max` real;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_unit` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_basis` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_source` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `jd_source_url` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `jd_captured_at` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `calendar_event_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `calendar_event_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_company_external_idx` ON `jobs` (`company_id`,`external_id`);