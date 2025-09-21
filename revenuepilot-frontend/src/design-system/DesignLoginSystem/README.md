# Design Login System

The Design Login System bundle provides the product-ready authentication experience
used by the RevenuePilot front end. It includes:

- Responsive sign-in UI with MFA support, offline affordances, and interactive
  forgot-password flow.
- TypeScript API contracts describing how the UI communicates with backend
  authentication services.
- A default API client that targets the FastAPI endpoints exposed by the
  RevenuePilot backend (`/api/auth/login`, `/api/auth/verify-mfa`,
  `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/resend-mfa`).

## Usage

```tsx
import { DesignLoginSystem, createDesignLoginSystemApiClient } from "../design-system/DesignLoginSystem"

const api = createDesignLoginSystemApiClient()

function LoginScreen() {
  return <DesignLoginSystem api={api} />
}
```

The `DesignLoginSystem` component also accepts overrides for multi-tenant
scenarios, offline mode, and the initial view. The exported types in
`types.ts` document the request and response payloads exchanged with the API.
