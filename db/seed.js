import { pool } from "../index.js";
import { v7 as uuidv7 } from "uuid";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seed() {
  const raw = readFileSync(path.join(__dirname, "seed_profiles.json"), "utf-8");
  const { profiles } = JSON.parse(raw);

  console.log(`📦 Seeding ${profiles.length} profiles...`);

  let inserted = 0;
  let skipped = 0;

  // Process in batches of 100 to avoid overwhelming the DB
  const BATCH_SIZE = 100;

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    // Build a single multi-row INSERT with ON CONFLICT DO NOTHING
    const values = [];
    const placeholders = batch.map((p, j) => {
      const base = j * 10;
      values.push(
        uuidv7(),
        p.name.trim().toLowerCase(),
        p.gender,
        p.gender_probability,
        p.age,
        p.age_group,
        p.country_id,
        p.country_name,
        p.country_probability,
        new Date().toISOString()
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`;
    });

    const result = await pool.query(
      `INSERT INTO profiles
        (id, name, gender, gender_probability, age, age_group,
         country_id, country_name, country_probability, created_at)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (name) DO NOTHING`,
      values
    );

    inserted += result.rowCount;
    skipped  += batch.length - result.rowCount;

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, profiles.length)}/${profiles.length}`);
  }

  console.log(`\n✅ Done — inserted: ${inserted}, skipped (duplicates): ${skipped}`);
  // await pool.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
