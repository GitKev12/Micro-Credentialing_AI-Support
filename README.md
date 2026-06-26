# Capstone Project Dev

## Stack

- MongoDB with Mongoose
- Express.js API
- React client powered by Vite
- Node.js runtime
- OpenAI API for module-based assessment generation

## Project Structure

```text
Capstone-Project-Dev/
|-- client/
|   |-- src/
|   |   |-- assets/
|   |   |-- entities/
|   |   |   |-- admin/
|   |   |   |   |-- components/
|   |   |   |   |-- pages/
|   |   |   |   `-- services/
|   |   |   |-- assessor/
|   |   |   |   |-- components/
|   |   |   |   |-- pages/
|   |   |   |   `-- services/
|   |   |   `-- student/
|   |   |       |-- components/
|   |   |       |-- pages/
|   |   |       `-- services/
|   |   |-- features/
|   |   |   |-- auth/
|   |   |   |-- ai-assessment/
|   |   |   |-- analytics/
|   |   |   |-- assessments/
|   |   |   |-- badges/
|   |   |   |-- certificates/
|   |   |   |-- courses/
|   |   |   |-- learning-gap/
|   |   |   `-- modules/
|   |   |-- layouts/
|   |   |-- pages/
|   |   `-- shared/
|   |       |-- components/
|   |       `-- services/
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
|-- docs/
|   `-- project-structure.md
|-- server/
|   |-- src/
|   |   |-- config/
|   |   |-- integrations/
|   |   |   `-- openai/
|   |   |-- middleware/
|   |   |-- modules/
|   |   |   |-- admin/
|   |   |   |-- ai-assessment/
|   |   |   |-- analytics/
|   |   |   |-- assessments/
|   |   |   |-- assessor/
|   |   |   |-- auth/
|   |   |   |-- badges/
|   |   |   |-- certificates/
|   |   |   |-- courses/
|   |   |   |-- health/
|   |   |   |-- learning-gap/
|   |   |   |-- learning-modules/
|   |   |   `-- student/
|   |   `-- utils/
|   |-- .env.example
|   `-- package.json
|-- .gitignore
`-- package.json
```

## Scripts

- `npm run dev`: start the React client and Express server together
- `npm run dev:client`: start only the client
- `npm run dev:server`: start only the server
- `npm run build`: build the client for production
- `npm run start`: run the server in production mode

## Starter Routes

- Frontend: `/login`, `/admin-login`, `/student`, `/assessor`, `/admin`
- Backend: `/api/health`
- Role APIs: `/api/students/overview`, `/api/assessors/overview`, `/api/admins/overview`
- Shared APIs:
  `/api/auth/overview`,
  `/api/auth/login`,
  `/api/auth/admin/login`,
  `/api/courses/overview`,
  `/api/learning-modules/overview`,
  `/api/assessments/overview`,
  `/api/ai-assessments/overview`,
  `/api/ai-assessments/generate`,
  `/api/learning-gaps/overview`,
  `/api/badges/overview`,
  `/api/certificates/overview`,
  `/api/analytics/overview`

## Setup

1. Copy `server/.env.example` to `server/.env`.
2. Update `MONGODB_URI`.
3. Set `OPENAI_API_KEY` for AI-generated assessments and set `OPENAI_MODEL` to your chosen GPT-5 family model. The default in this starter is `gpt-5.5`.
4. Run `npm run dev` from the project root.
5. Use `/login` for Student and Assessor, and `/admin-login` for Admin.
6. Extend the role and shared modules with your real capstone business rules, schemas, and screens.

## Login Collections

Login now reads from the MongoDB `students`, `assessors`, and `admins` collections.

- Student/Assessor login: `/login`
- Admin login: `/admin-login`
- Login form uses each account's stored `email` and `password`
- Backend also accepts role number or `username` while records are being migrated
- Accepted password fields: `password`, `passwordHash`, or `hashedPassword`

## AI Assessment Request Shape

Send a `POST` request to `/api/ai-assessments/generate` with:

```json
{
  "courseTitle": "Web Development",
  "moduleTitle": "REST API Fundamentals",
  "moduleSummary": "Covers HTTP methods, routing, status codes, and CRUD design.",
  "moduleOutcomes": [
    "Explain the purpose of RESTful routes",
    "Differentiate HTTP methods and status codes"
  ],
  "difficulty": "intermediate",
  "questionCount": 5
}
```
