CREATE TABLE `halliday_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalQuestionsAnswered` int DEFAULT 0,
	`voiceLanguageProgress` float DEFAULT 0,
	`memoryLifeProgress` float DEFAULT 0,
	`reasoningDecisionsProgress` float DEFAULT 0,
	`valuesBelifsProgress` float DEFAULT 0,
	`emotionalPatternsProgress` float DEFAULT 0,
	`overallAccuracy` float DEFAULT 0,
	`lastQuestionAnsweredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `halliday_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `halliday_progress_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `halliday_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` varchar(10) NOT NULL,
	`category` varchar(50) NOT NULL,
	`section` varchar(100) NOT NULL,
	`text` text NOT NULL,
	`weight` float NOT NULL,
	`difficulty` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `halliday_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `halliday_questions_questionId_unique` UNIQUE(`questionId`)
);
--> statement-breakpoint
CREATE TABLE `halliday_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`questionId` varchar(10) NOT NULL,
	`response` text NOT NULL,
	`responseType` enum('text','voice','interview') NOT NULL,
	`specificity` float,
	`accuracy` float,
	`sourceMemoryId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `halliday_responses_id` PRIMARY KEY(`id`)
);
