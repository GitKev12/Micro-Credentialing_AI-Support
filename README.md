# Micro-Credentialing AI Support

A capstone project for a micro-credentialing platform with AI-assisted assessment generation.
Three actors: **Student**, **Assessor**, and **Admin**.

> **Status: early development.** The scaffolding, authentication flow, and OpenAI client are in
> place. Most domain features (assessments, badges, certificates, analytics, learning-gap
> reporting) are not implemented yet. See [Roadmap](#roadmap) for what's planned.

## Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Client   | React 19, Vite 6, React Router 7, Axios |
| Server   | Node.js, Express 5                  |
| Database | MongoDB (via Mongoose 8)            |
| AI       | OpenAI SDK (`responses` API)        |
| Tooling  | npm workspaces, `concurrently`, `nodemon` |

## Getting Started

### Prerequisites

- Node.js 18 or newer
- A MongoDB database (local or Atlas)
- An OpenAI API key (only needed once AI assessment generation is wired up)

### Setup

```bash
# 1. Install dependencies for both workspaces
npm install

# 2. Create the server environment file
cp server/.env.example server/.env

# 3. Fill in server/.env (see Environment Variables below)

# 4. Start the client and server together
npm run dev
```

The client runs on `http://localhost:5173` and the server on `http://localhost:5000`.
Vite proxies `/api/*` to the server, so no client-side base URL is needed in development.

### Environment Variables

Set these in `server/.env`:

| Variable         | Required | Description                                                |
| ---------------- | -------- | ---------------------------------------------------------- |
| `PORT`           | No       | Server port. Defaults to `5000`.                            |
| `MONGODB_URI`    | Yes      | MongoDB connection string. If unset, the server starts but skips the DB connection and all auth routes return `503`. |
| `OPENAI_API_KEY` | No*      | Required only when AI assessment generation is used.        |
| `OPENAI_MODEL`   | No       | Model ID passed to the OpenAI SDK. Must be a valid model name from the OpenAI API. |

Optionally, `VITE_API_URL` can be set in `client/.env` to point the client at a different API host.
When omitted, the client uses the relative path `/api`.

## Scripts

Run from the project root:

| Script               | Description                                    |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Start the client and server together            |
| `npm run dev:client` | Start only the Vite dev server                  |
| `npm run dev:server` | Start only the Express server (with `nodemon`)  |
| `npm run build`      | Build the client for production                 |
| `npm run start`      | Run the server in production mode               |

## Project Structure

This reflects the files currently in the repository.

```text
Micro-Credentialing_AI-Support/
|-- client/
|   |-- src/
|   |   |-- assets/                    # Images and static files
|   |   |-- auth/
|   |   |   |-- components/            # ProtectedRoute
|   |   |   |-- pages/                 # LoginPage, AdminLoginPage
|   |   |   `-- services/              # authService (login, session storage)
|   |   |-- layouts/                   # AppLayout
|   |   |-- pages/
|   |   |   |-- admin/                 # AdminPage
|   |   |   |-- assessor/              # AssessorPage
|   |   |   `-- student/               # StudentPage + components
|   |   |-- services/                  # api (axios), courses, theme, avatar
|   |   |-- App.jsx                    # Route definitions
|   |   |-- main.jsx
|   |   `-- styles.css
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
|-- server/
|   |-- src/
|   |   |-- auth/                      # Login routes and controller
|   |   |-- config/                    # db.js (Mongoose), env.js
|   |   |-- courses/                   # Student course routes and controller
|   |   |-- health/                    # Health check
|   |   |-- integrations/openai/       # OpenAI client + prompt builder
|   |   |-- middleware/                # requestMetrics (in-memory request counter)
|   |   |-- utils/
|   |   |-- app.js                     # Express app and route mounting
|   |   `-- index.js                   # Entry point
|   |-- .env.example
|   `-- package.json
|-- docs/
|   `-- project-structure.md
|-- .gitignore
`-- package.json                       # npm workspaces root
```

## Frontend Routes

| Path           | Access                        |
| -------------- | ----------------------------- |
| `/`            | Redirects to `/login`         |
| `/login`       | Public — Student and Assessor |
| `/admin-login` | Public — Admin                |
| `/student`     | Student only                  |
| `/assessor`    | Assessor only                 |
| `/admin`       | Admin only                    |

Role-based routing is handled by `ProtectedRoute`, which reads the session from `localStorage`.

## API Endpoints

These are the endpoints currently mounted in `server/src/app.js`.

| Method | Path                        | Description                                    |
| ------ | --------------------------- | ---------------------------------------------- |
| `GET`  | `/`                         | Returns a basic API status message              |
| `GET`  | `/api/health`               | Health check with timestamp                     |
| `POST` | `/api/auth/login`           | Student and Assessor login                      |
| `POST` | `/api/auth/admin/login`     | Admin login                                     |
| `GET`  | `/api/students/:id/courses` | Courses for a student                           |

### Login

Both login endpoints accept:

```json
{
  "identifier": "student@example.com",
  "password": "your-password"
}
```

On success they return a token, a public user object, and a `redirectTo` path for the role.

The `identifier` is matched against several fields so that records can be migrated gradually:

- **Student:** `email`, `student_id`, `studentNumber`, `username`
- **Assessor:** `email`, `assessor_id`, `assessorNumber`, `username`
- **Admin:** `email`, `admin_id`, `employeeNumber`, `adminNumber`, `username`

Passwords are read from whichever of `password`, `passwordHash`, or `hashedPassword` is present.

### Student Courses

`GET /api/students/:id/courses` reads from the `Course` collection and matches on `studentId`,
`student_id`, or `studentIds`.

If the `Course` collection does not exist yet, the endpoint responds with
`{ "courses": [], "pending": true }` rather than erroring. On the client side,
`client/src/services/courses.js` guards this call behind a `COURSES_API_READY` flag, which is
currently `false` — flip it to `true` once the collection has data.

## Database Collections

Login and course lookups read directly from these MongoDB collections:

- `Student`
- `Assessor`
- `Admin`
- `Course` — expected shape: `{ studentId, code, title, imageUrl }` (alternate field names such as
  `course_code`, `name`, and `image_url` are also accepted)

## OpenAI Integration

`server/src/integrations/openai/openai.client.js` contains a working prompt builder and a
`generateAssessmentFromModule()` function that returns a parsed JSON assessment.

**It is not yet exposed through an HTTP route.** No controller or router calls it.

The function expects:

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

It returns `{ model, assessment }`, where `assessment` contains `title`, `instructions`, and a
`questions` array of multiple-choice items with `choices`, `answer`, `explanation`, and `outcome`.

## Known Limitations

These are tracked and intended to be addressed before the project is considered complete.

- **Passwords are not hashed securely.** The login controller accepts plaintext comparison and
  unsalted SHA-256. This needs to be replaced with `bcrypt`.
- **Tokens are not signed.** `createToken()` returns a base64 string with no signature and no
  expiry, and no middleware verifies it. Every API route is currently unauthenticated.
- **Route protection is client-side only.** `ProtectedRoute` reads `localStorage`; the server does
  not enforce roles.
- **Login input is not type-validated** before being used in a MongoDB query.
- **CORS is unrestricted** (`cors()` with no options).
- **`requestMetrics` is in-memory only** and resets on every server restart. Nothing reads the
  snapshot it produces.

## Roadmap

Planned modules, none of which exist yet:

- **AI assessment endpoint** — wire `generateAssessmentFromModule()` to `POST /api/ai-assessments/generate`
- **Auth hardening** — bcrypt, JWTs, and `requireAuth` / `requireRole` middleware
- **Learning modules** — course module content and metadata
- **Assessments** — attempt lifecycle and scoring
- **Learning gap** — reporting for students and assessors
- **Badges** — badge awarding rules
- **Certificates** — issuance and visibility
- **Analytics** — dashboard counts and API usage for admins
