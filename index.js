import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { v7 as uuidv7 } from "uuid";
import pg from "pg";
import { parseNaturalLanguageQuery } from "./nlp.js";

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;

//connection pool for Postgres
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
app.use(express.json());
// middleware to allow CORS (for testing with frontend apps)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});


//helpers functions in my code
const getAgeGroup = (age) => {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
};

const getTopCountry = (countries) =>
  countries.reduce((prev, curr) =>
    curr.probability > prev.probability ? curr : prev
  );

const VALID_SORT_FIELDS = ["age", "created_at", "gender_probability"];
const VALID_ORDERS = ["asc", "desc"];
const VALID_GENDERS = ["male", "female"];
const VALID_AGE_GROUPS = ["child", "teenager", "adult", "senior"];

/**
 * Builds a parameterised WHERE clause from filter options.
 * Returns { whereClause, params, nextIndex }
 */
function buildWhereClause(filters, startIndex = 1) {
  const conditions = [];
  const params = [];
  let idx = startIndex;

  const {
    gender,
    age_group,
    country_id,
    min_age,
    max_age,
    min_gender_probability,
    min_country_probability,
  } = filters;

  if (gender !== undefined) {
    conditions.push(`gender = $${idx++}`);
    params.push(gender.toLowerCase());
  }
  if (age_group !== undefined) {
    conditions.push(`age_group = $${idx++}`);
    params.push(age_group.toLowerCase());
  }
  if (country_id !== undefined) {
    conditions.push(`country_id = $${idx++}`);
    params.push(country_id.toUpperCase());
  }
  if (min_age !== undefined) {
    conditions.push(`age >= $${idx++}`);
    params.push(min_age);
  }
  if (max_age !== undefined) {
    conditions.push(`age <= $${idx++}`);
    params.push(max_age);
  }
  if (min_gender_probability !== undefined) {
    conditions.push(`gender_probability >= $${idx++}`);
    params.push(min_gender_probability);
  }
  if (min_country_probability !== undefined) {
    conditions.push(`country_probability >= $${idx++}`);
    params.push(min_country_probability);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return { whereClause, params, nextIndex: idx };
}

/**
 * Validates and parses common query filter params.
 * Returns { filters, error } — error is a string if invalid.
 */
function parseFilterParams(query) {
  const {
    gender,
    age_group,
    country_id,
    min_age,
    max_age,
    min_gender_probability,
    min_country_probability,
  } = query;

  const filters = {};

  if (gender !== undefined) {
    if (!VALID_GENDERS.includes(gender.toLowerCase()))
      return { error: "Invalid value for 'gender'. Must be 'male' or 'female'." };
    filters.gender = gender.toLowerCase();
  }

  if (age_group !== undefined) {
    if (!VALID_AGE_GROUPS.includes(age_group.toLowerCase()))
      return { error: "Invalid value for 'age_group'. Must be child, teenager, adult, or senior." };
    filters.age_group = age_group.toLowerCase();
  }

  if (country_id !== undefined) {
    if (typeof country_id !== "string" || country_id.trim() === "")
      return { error: "Invalid value for 'country_id'." };
    filters.country_id = country_id.toUpperCase();
  }

  if (min_age !== undefined) {
    const v = Number(min_age);
    if (!Number.isInteger(v) || v < 0)
      return { error: "'min_age' must be a non-negative integer." };
    filters.min_age = v;
  }

  if (max_age !== undefined) {
    const v = Number(max_age);
    if (!Number.isInteger(v) || v < 0)
      return { error: "'max_age' must be a non-negative integer." };
    filters.max_age = v;
  }

  if (filters.min_age !== undefined && filters.max_age !== undefined) {
    if (filters.min_age > filters.max_age)
      return { error: "'min_age' cannot be greater than 'max_age'." };
  }

  if (min_gender_probability !== undefined) {
    const v = Number(min_gender_probability);
    if (isNaN(v) || v < 0 || v > 1)
      return { error: "'min_gender_probability' must be a number between 0 and 1." };
    filters.min_gender_probability = v;
  }

  if (min_country_probability !== undefined) {
    const v = Number(min_country_probability);
    if (isNaN(v) || v < 0 || v > 1)
      return { error: "'min_country_probability' must be a number between 0 and 1." };
    filters.min_country_probability = v;
  }

  return { filters };
}

/**
 * Validates and parses sort + pagination params.
 */
function parseSortPaginationParams(query) {
  const { sort_by, order, page, limit } = query;

  let sortField = "created_at";
  let sortOrder = "asc";
  let pageNum = 1;
  let limitNum = 10;

  if (sort_by !== undefined) {
    if (!VALID_SORT_FIELDS.includes(sort_by))
      return { error: `Invalid 'sort_by'. Must be one of: ${VALID_SORT_FIELDS.join(", ")}.` };
    sortField = sort_by;
  }

  if (order !== undefined) {
    if (!VALID_ORDERS.includes(order.toLowerCase()))
      return { error: "Invalid 'order'. Must be 'asc' or 'desc'." };
    sortOrder = order.toLowerCase();
  }

  if (page !== undefined) {
    const v = Number(page);
    if (!Number.isInteger(v) || v < 1)
      return { error: "'page' must be a positive integer." };
    pageNum = v;
  }

  if (limit !== undefined) {
    const v = Number(limit);
    if (!Number.isInteger(v) || v < 1 || v > 50)
      return { error: "'limit' must be an integer between 1 and 50." };
    limitNum = v;
  }

  return { sortField, sortOrder, pageNum, limitNum };
}

//routes

app.get("/", (req, res) => {
  res.json({ status: "success", message: "Insighta Labs Intelligence API" });
});


app.post("/api/profiles", async (req, res) => {
  try {
    const { name } = req.body || {};

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ status: "error", message: "Name is required." });
    }

    const normalizedName = name.trim().toLowerCase();

    // Idempotency check
    const existing = await pool.query(
      "SELECT * FROM profiles WHERE name = $1",
      [normalizedName]
    );
    if (existing.rows.length > 0) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existing.rows[0],
      });
    }

    const fetchJSON = async (url) => {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.log(`Fetch failed for ${url}:`, err.message);
    return null;
  }
};

const [genderData, ageData, countryData] = await Promise.all([
  fetchJSON(`https://api.genderize.io?name=${encodeURIComponent(name)}`),
  fetchJSON(`https://api.agify.io?name=${encodeURIComponent(name)}`),
  fetchJSON(`https://api.nationalize.io?name=${encodeURIComponent(name)}`),
]);
    if (!genderData.gender || genderData.count === 0)
      return res.status(502).json({ status: "error", message: "Genderize returned an invalid response." });

    if (!ageData.age)
      return res.status(502).json({ status: "error", message: "Agify returned an invalid response." });

    if (!countryData.country || countryData.country.length === 0)
      return res.status(502).json({ status: "error", message: "Nationalize returned an invalid response." });

    const topCountry = getTopCountry(countryData.country);

    // Fetch country name from REST Countries
    let countryName = topCountry.country_id;
    try {
      const cnRes = await fetch(`https://restcountries.com/v3.1/alpha/${topCountry.country_id}`);
      const cnData = await cnRes.json();
      countryName = cnData[0]?.name?.common ?? topCountry.country_id;
    } catch (_) { /* non-fatal */ }

    const profile = {
      id: uuidv7(),
      name: normalizedName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      age: ageData.age,
      age_group: getAgeGroup(ageData.age),
      country_id: topCountry.country_id,
      country_name: countryName,
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO profiles
        (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        profile.id, profile.name, profile.gender, profile.gender_probability,
        profile.age, profile.age_group, profile.country_id, profile.country_name,
        profile.country_probability, profile.created_at,
      ]
    );

    return res.status(201).json({ status: "success", data: profile });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// GET /api/profiles/search  (natural language) 
app.get("/api/profiles/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ status: "error", message: "Query parameter 'q' is required." });
    }

    const parsed = parseNaturalLanguageQuery(q);

    if (!parsed) {
      return res.status(422).json({ status: "error", message: "Unable to interpret query" });
    }

    
    const mergedFilters = { ...parsed };

    const sortPagination = parseSortPaginationParams(req.query);
    if (sortPagination.error)
      return res.status(422).json({ status: "error", message: sortPagination.error });

    const { sortField, sortOrder, pageNum, limitNum } = sortPagination;
    const { whereClause, params } = buildWhereClause(mergedFilters);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM profiles ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT * FROM profiles ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error." });
  }
});

//  GET /api/profiles 
app.get("/api/profiles", async (req, res) => {
  try {
    const filterResult = parseFilterParams(req.query);
    if (filterResult.error)
      return res.status(422).json({ status: "error", message: filterResult.error });

    const sortPagination = parseSortPaginationParams(req.query);
    if (sortPagination.error)
      return res.status(422).json({ status: "error", message: sortPagination.error });

    const { filters } = filterResult;
    const { sortField, sortOrder, pageNum, limitNum } = sortPagination;
    const { whereClause, params } = buildWhereClause(filters);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM profiles ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT * FROM profiles ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error." });
  }
});

//GET /api/profiles/:id 
app.get("/api/profiles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM profiles WHERE id = $1", [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ status: "error", message: "Profile not found." });

    return res.status(200).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error." });
  }
});

// DELETE /api/profiles/:id 
app.delete("/api/profiles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM profiles WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ status: "error", message: "Profile not found." });

    return res.status(200).json({ status: "success", message: "Profile deleted." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: "Server error." });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
