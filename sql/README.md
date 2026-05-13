# SQL scripts

- **`00_schema.sql`** — canonical `feedback` table + indexes + safe `ALTER … IF NOT EXISTS` upgrades. The app runs every `*.sql` file here **except** files named `99_*` on startup.
- **`99_*`** — examples / destructive helpers (not auto-applied). See `99_truncate_feedback_example.sql`.

To apply manually:

```bash
psql "$DATABASE_URL" -f sql/00_schema.sql
```
