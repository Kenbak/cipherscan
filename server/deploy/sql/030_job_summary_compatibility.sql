-- Preserve legacy materialized data while switching the incremental writer
-- to a table. No chain records or historical snapshots are deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE node_snapshots ADD COLUMN IF NOT EXISTS identified_client_nodes integer;
ALTER TABLE node_snapshots ADD COLUMN IF NOT EXISTS client_counts jsonb;
-- NULL on legacy rows means the client breakdown was never observed.
DO $$
DECLARE
  kind "char";
  acl record;
BEGIN
  SELECT relkind INTO kind FROM pg_class WHERE oid = to_regclass('public.turnstile_daily');
  IF kind = 'm' THEN
    -- Renaming does not redirect dependent views. Refuse rather than leave
    -- consumers attached to the archived relation.
    IF EXISTS (
      SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
      WHERE d.refobjid = 'public.turnstile_daily'::regclass
        AND d.classid = 'pg_rewrite'::regclass
        AND r.ev_class <> 'public.turnstile_daily'::regclass
    ) THEN
      RAISE EXCEPTION 'turnstile_daily has dependent views; review before conversion';
    END IF;
    ALTER MATERIALIZED VIEW public.turnstile_daily RENAME TO turnstile_daily_legacy_030;
    CREATE TABLE public.turnstile_daily AS TABLE public.turnstile_daily_legacy_030;
    ALTER TABLE public.turnstile_daily ADD PRIMARY KEY (date, pool);
    EXECUTE format('ALTER TABLE public.turnstile_daily OWNER TO %I',
      (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.turnstile_daily_legacy_030'::regclass));
    FOR acl IN
      SELECT x.* FROM pg_class c,
        LATERAL aclexplode(COALESCE(c.relacl, acldefault('r',c.relowner))) x
      WHERE c.oid='public.turnstile_daily_legacy_030'::regclass
    LOOP
      EXECUTE format('GRANT %s ON public.turnstile_daily TO %s%s',
        acl.privilege_type,
        CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(acl.grantee)) END,
        CASE WHEN acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
    COMMENT ON MATERIALIZED VIEW public.turnstile_daily_legacy_030 IS
      'Preserved pre-migration summary and definition; do not remove until backup/retention review.';
  ELSIF kind IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'Expected turnstile_daily table or materialized view, got %', kind;
  END IF;
END $$;
COMMIT;
