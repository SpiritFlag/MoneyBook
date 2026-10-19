CREATE SCHEMA IF NOT EXISTS moneybook;

CREATE TABLE IF NOT EXISTS moneybook.books (
  owner_id text PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 200),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['version', 'expenses', 'assets', 'operations']
    AND payload->>'version' = '1'
    AND jsonb_typeof(payload->'expenses') = 'array'
    AND jsonb_typeof(payload->'assets') = 'array'
    AND jsonb_typeof(payload->'operations') = 'array'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The server authenticates with Clerk and scopes every query by owner_id.
-- Never grant browser clients a database role or expose DATABASE_URL.
REVOKE ALL ON SCHEMA moneybook FROM PUBLIC;
REVOKE ALL ON TABLE moneybook.books FROM PUBLIC;
