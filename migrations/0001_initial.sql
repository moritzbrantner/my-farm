CREATE TABLE IF NOT EXISTS farm_save (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS command_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  command_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
