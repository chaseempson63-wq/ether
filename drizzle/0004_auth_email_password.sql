-- Add passwordHash column for email/password auth.
-- NOTE: Existing Manus OAuth users will NOT be able to log in via email/password
-- until they are backfilled with a passwordHash value. They retain their openId
-- and other data for reference.
ALTER TABLE `users` ADD `passwordHash` varchar(255);
--> statement-breakpoint
ALTER TABLE `users` ADD UNIQUE INDEX `users_email_unique` (`email`);
