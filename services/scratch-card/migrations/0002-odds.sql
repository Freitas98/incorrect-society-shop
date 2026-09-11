-- Run once in the D1 console if the database was created before this field.
ALTER TABLE campaigns ADD COLUMN no_prize_weight INTEGER NOT NULL DEFAULT 70 CHECK (no_prize_weight >= 0);
UPDATE campaigns SET no_prize_weight = 70 WHERE no_prize_weight IS NULL;
