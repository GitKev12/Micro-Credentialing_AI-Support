# Project Structure Notes

This starter keeps the frontend and backend isolated while still allowing a single root command surface.

## Root

- Holds the workspace configuration and shared scripts.
- Runs both applications together with `concurrently`.

## Client

- `src/components`: reusable UI building blocks
- `src/hooks`: custom React hooks
- `src/layouts`: page shells and layout wrappers
- `src/pages`: route-level components
- `src/services`: API clients and other external service wrappers
- `src/assets`: static assets owned by the client

## Server

- `src/config`: runtime setup such as database connections
- `src/controllers`: request handlers
- `src/middleware`: Express middleware
- `src/models`: Mongoose models
- `src/routes`: API route definitions
- `src/utils`: server-side helper functions
