# Capstone Project Dev

A structured MERN starter repository for a capstone project.

## Stack

- MongoDB with Mongoose
- Express.js API
- React client powered by Vite
- Node.js runtime

## Project Structure

```text
Capstone-Project-Dev/
|-- client/
|   |-- src/
|   |   |-- assets/
|   |   |-- components/
|   |   |-- hooks/
|   |   |-- layouts/
|   |   |-- pages/
|   |   `-- services/
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
|-- docs/
|   `-- project-structure.md
|-- server/
|   |-- src/
|   |   |-- config/
|   |   |-- controllers/
|   |   |-- middleware/
|   |   |-- models/
|   |   |-- routes/
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

## Setup

1. Copy `server/.env.example` to `server/.env`.
2. Update `MONGODB_URI` if you want the API to connect to MongoDB.
3. Run `npm run dev` from the project root.
