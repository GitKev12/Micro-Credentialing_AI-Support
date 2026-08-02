# Project Structure Notes

This starter now uses a role-and-domain structure so the codebase maps directly to your capstone
actors and shared business features: `Student`, `Assessor`, `Admin`, courses, modules,
assessments, learning gaps, badges, certificates, analytics, and OpenAI integration.

## Root

- Holds the workspace configuration and shared scripts.
- Runs both applications together with `concurrently`.

## Client

- `src/entities/student`: student-only pages, services, and UI pieces
- `src/entities/assessor`: assessor-only pages, services, and UI pieces
- `src/entities/admin`: admin-only pages, services, and UI pieces
- `src/features/auth`: shared Student and Assessor login plus separate Admin login services
- `src/features/ai-assessment`: frontend services for AI-generated assessments
- `src/features/analytics`: admin-facing usage and dashboard metric services
- `src/features/assessments`: shared assessment domain services
- `src/features/badges`: badge-related services
- `src/features/certificates`: certificate-related services
- `src/features/courses`: course directory services
- `src/features/learning-gap`: learning-gap services for student and assessor flows
- `src/features/modules`: course module services
- `src/layouts`: application shell and navigation
- `src/pages`: shared route-level pages
- `src/shared/components`: reusable UI used across multiple entities
- `src/shared/services`: shared API client utilities
- `src/assets`: static assets owned by the client

## Server

- `src/config`: runtime setup such as database and environment configuration
- `src/integrations/openai`: OpenAI-specific client helpers for AI-generated assessments
- `src/middleware`: Express middleware such as request usage tracking
- `src/modules/student`: student model, controller, and routes
- `src/modules/assessor`: assessor model, controller, and routes
- `src/modules/admin`: admin model, controller, and routes
- `src/modules/auth`: shared authentication endpoints and role resolution
- `src/modules/courses`: course APIs and course metadata
- `src/modules/learning-modules`: course module APIs and module metadata
- `src/modules/assessments`: assessment APIs and attempt lifecycle
- `src/modules/ai-assessment`: AI assessment orchestration endpoints
- `src/modules/learning-gap`: student and assessor learning-gap reporting
- `src/modules/badges`: badge-awarding APIs
- `src/modules/certificates`: certificate visibility APIs
- `src/modules/analytics`: dashboard counts and API usage endpoints
- `src/modules/health`: basic API health endpoint
- `src/utils`: server-side helper functions

## Why This Structure

- Student, assessor, and admin screens can evolve independently without mixing role logic.
- Student and assessor share one login feature, while admin has a separate login route.
- Login credentials are resolved from the MongoDB role collections instead of seeded demo accounts.
- Shared capstone domains stay centralized instead of being duplicated inside role folders.
- The OpenAI integration sits behind backend modules, which keeps API keys off the client.
- Analytics and usage monitoring are given their own surface because they are admin concerns, not
  student concerns.
