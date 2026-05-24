# Project Structure Notes

This starter now uses an entity-first structure so the codebase maps directly to the three study
actors: `Student`, `Professor`, and `Admin`.

## Root

- Holds the workspace configuration and shared scripts.
- Runs both applications together with `concurrently`.

## Client

- `src/entities/student`: student-only pages, services, and UI pieces
- `src/entities/professor`: professor-only pages, services, and UI pieces
- `src/entities/admin`: admin-only pages, services, and UI pieces
- `src/layouts`: application shell and navigation
- `src/pages`: shared route-level pages such as the landing overview
- `src/shared/components`: reusable UI used across multiple entities
- `src/shared/services`: shared API client utilities
- `src/assets`: static assets owned by the client

## Server

- `src/config`: runtime setup such as database connections
- `src/middleware`: Express middleware
- `src/modules/student`: student model, controller, and routes
- `src/modules/professor`: professor model, controller, and routes
- `src/modules/admin`: admin model, controller, and routes
- `src/modules/overview`: project-wide directory metadata endpoint
- `src/modules/health`: basic API health endpoint
- `src/utils`: server-side helper functions

## Why This Structure

- Each entity can evolve independently without mixing controller logic or page code.
- The client and server use the same entity names, which keeps navigation and API work aligned.
- Shared concerns remain shared, while study-specific features stay close to their own modules.
