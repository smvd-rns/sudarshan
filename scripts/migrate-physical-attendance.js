const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const mainUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const mainServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const idktUrl = process.env.NEXT_PUBLIC_SUPABASE_IDKT_URL;
const idktServiceKey = process.env.SUPABASE_IDKT_SERVICE_ROLE_KEY;

if (!mainUrl || !mainServiceKey) {
  console.error("Missing Main DB credentials in .env.local");
  process.exit(1);
}

if (!idktUrl || !idktServiceKey) {
  console.error("Missing Desire Tree (IDKT) DB credentials in .env.local");
  process.exit(1);
}

const mainClient = createClient(mainUrl, mainServiceKey);
const idktClient = createClient(idktUrl, idktServiceKey);

async function runMigration() {
  console.log("Starting physical_attendance migration...");

  let allLogs = [];
  let hasMore = true;
  let page = 0;
  const fetchLimit = 1000;

  // 1. Fetch from Main DB in chunks
  console.log("Fetching logs from Main DB...");
  while (hasMore) {
    console.log(`Fetching rows ${page * fetchLimit} to ${(page + 1) * fetchLimit - 1}...`);
    const { data: chunk, error: fetchErr } = await mainClient
      .from("physical_attendance")
      .select("*")
      .order("id", { ascending: true })
      .range(page * fetchLimit, (page + 1) * fetchLimit - 1);

    if (fetchErr) {
      console.error("Error fetching logs from Main DB:", fetchErr.message);
      process.exit(1);
    }

    if (chunk && chunk.length > 0) {
      allLogs = allLogs.concat(chunk);
    }

    if (!chunk || chunk.length < fetchLimit) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log(`Total logs found in Main DB: ${allLogs.length}`);

  if (allLogs.length === 0) {
    console.log("No logs to migrate.");
    process.exit(0);
  }

  // 2. Insert to Desire Tree DB in batches to prevent payload limits
  console.log("Inserting logs into Desire Tree (IDKT) DB...");
  
  const batchSize = 1000;
  for (let i = 0; i < allLogs.length; i += batchSize) {
    const chunk = allLogs.slice(i, i + batchSize);
    console.log(`Inserting batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(allLogs.length / batchSize)} (${chunk.length} rows)...`);
    
    const logsToInsert = chunk.map(log => ({
      id: log.id,
      device_sn: log.device_sn,
      zk_user_id: log.zk_user_id,
      check_time: log.check_time,
      verify_type: log.verify_type,
      status: log.status,
      raw_payload: log.raw_payload,
      created_at: log.created_at
    }));

    const { error: insertErr } = await idktClient
      .from("physical_attendance")
      .insert(logsToInsert);

    if (insertErr) {
      console.error(`Error inserting batch starting at index ${i}:`, insertErr.message);
      process.exit(1);
    }
  }

  console.log(`Successfully migrated all ${allLogs.length} logs to the Desire Tree DB!`);
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
});
