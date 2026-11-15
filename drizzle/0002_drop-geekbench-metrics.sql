-- Geekbench isn't licensed for our use (15.11.2026); scores now come from sysbench + 7-Zip.
DELETE FROM "metrics" WHERE "key" LIKE 'geekbench%';--> statement-breakpoint
-- Scores from methodology 0.1 used Geekbench; drop them. Click "Recompute scores" in /admin/trials after deploying.
DELETE FROM "scores" WHERE "methodology_version" = '0.1';
