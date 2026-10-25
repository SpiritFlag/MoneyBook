-- Separate append-only evaluations. Financial book rows remain untouched.
CREATE TABLE IF NOT EXISTS moneybook.buddy_reviews (
 owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
 month text NOT NULL CHECK (month ~ '^(19[0-9]{2}|[2-9][0-9]{3})-(0[1-9]|1[0-2])$'),
 revision integer NOT NULL CHECK (revision > 0),
 reviews jsonb NOT NULL CHECK (jsonb_typeof(reviews) = 'object'),
 summary jsonb,
 generated_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key text NOT NULL,
 request_fingerprint text NOT NULL,
 PRIMARY KEY (owner_id, month, revision),
 UNIQUE (owner_id, idempotency_key)
);
REVOKE ALL ON TABLE moneybook.buddy_reviews FROM PUBLIC;
