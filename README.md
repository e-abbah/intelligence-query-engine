# intelligence-query-engine

# Intelligence API

A Node.js + Express + PostgreSQL backend that generates and manages user demographic profiles using natural language queries and external APIs (Genderize, Agify, Nationalize, REST Countries).

---

## 🚀 Features

- Create enriched user profiles from a single name input
- Uses external APIs to infer:
  - Gender
  - Age
  - Country of origin
- Stores structured profiles in PostgreSQL
- Natural language search endpoint
- Filtering, sorting, and pagination support
- RESTful CRUD operations
- Idempotent profile creation (prevents duplicates)

---

## 🧠 Tech Stack

- Node.js (ESM)
- Express.js
- PostgreSQL
- `pg` (node-postgres)
- dotenv
- uuid v7
- External APIs:
  - https://api.genderize.io
  - https://api.agify.io
  - https://api.nationalize.io
  - https://restcountries.com

---

## 📁 Project Structure

```bash
intelligence-api/
│
├── index.js              # Main server file (all routes + logic)
├── nlp.js                # Natural language query parser
│
├── db/
│   ├── init.js          # Database schema initialization
│   ├── seed.js          # Seeder script
│   └── seed_profiles.json
│
├── .env
├── package.json
└── README.md


---

## ⚙️ Setup Instructions

### 1. Clone the project
```bash
git clone <your-repo-url>
cd intelligence-api

DATABASE_URL=your_postgres_connection_string
PORT=3000
NODE_ENV=development

npm run setup
node db/seed.js
npm run dev