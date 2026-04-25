import { pool } from "../index.js";

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id                  VARCHAR(36)   PRIMARY KEY,
      name                VARCHAR(255)  NOT NULL UNIQUE,
      gender              VARCHAR(10)   NOT NULL,
      gender_probability  FLOAT         NOT NULL,
      age                 INT           NOT NULL,
      age_group           VARCHAR(20)   NOT NULL,
      country_id          VARCHAR(2)    NOT NULL,
      country_name        VARCHAR(100)  NOT NULL,
      country_probability FLOAT         NOT NULL,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
  `);

  // Indexes for common filter columns
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_gender      ON profiles(gender);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_age_group   ON profiles(age_group);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_country_id  ON profiles(country_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_age         ON profiles(age);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_created_at  ON profiles(created_at);`);

  console.log("✅ Database schema ready.");
  await pool.end();
}

initDb().catch((err) => {
  console.error("❌ Failed to init DB:", err);
  process.exit(1);
});
