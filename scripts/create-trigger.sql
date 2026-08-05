-- PostgreSQL trigger to auto-sync isSeller when role changes
-- This is the ultimate safety net: even if old code updates role without isSeller,
-- the trigger will fix it at the DB level.

CREATE OR REPLACE FUNCTION sync_iseller_on_role_change()
RETURNS TRIGGER AS $func$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role = 'SELLER' OR NEW.role = 'ADMIN' THEN
      NEW.isSeller := true;
    ELSIF NEW.role = 'USER' THEN
      NEW.isSeller := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_iseller ON "User";

CREATE TRIGGER trg_sync_iseller
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION sync_iseller_on_role_change();
