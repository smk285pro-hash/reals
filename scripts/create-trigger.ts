import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function createTrigger() {
  // Step 1: Create the trigger function using separate statements
  // We need to use tagged template for the function body to avoid escaping issues

  const createFunc = `
    CREATE OR REPLACE FUNCTION sync_iseller_on_role_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NEW.role = 'SELLER' OR NEW.role = 'ADMIN' THEN
          NEW."isSeller" := true;
        ELSIF NEW.role = 'USER' THEN
          NEW."isSeller" := false;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `

  await db.$executeRawUnsafe(createFunc)
  console.log('1. Trigger function created')

  // Step 2: Drop existing trigger if any
  await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_sync_iseller ON "User"`)
  console.log('2. Old trigger dropped (if existed)')

  // Step 3: Create the trigger
  await db.$executeRawUnsafe(
    `CREATE TRIGGER trg_sync_iseller BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION sync_iseller_on_role_change()`
  )
  console.log('3. Trigger created on User table')
  console.log('')
  console.log('DB-level protection active! isSeller will auto-sync when role changes.')

  await db.$disconnect()
}

createTrigger().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
