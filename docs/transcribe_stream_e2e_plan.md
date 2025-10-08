# QA & E2E Rollout Plan: Real Transcription WebSocket

This plan breaks the original request into a sequence of manageable tasks so that we can incrementally migrate QA and end-to-end tests from mocked sockets to the live `/api/transcribe/stream` endpoint while keeping other live stream mocks intact.

## 1. Explore the Existing Mock Infrastructure
- [x] Locate the Playwright helper that currently injects `window.__mockSockets` and document how the mock WebSocket server is configured.
  - The socket shim now lives in `tests/e2e/helpers/visit-stream-sockets.ts`, where a Playwright init script overrides `window.WebSocket`, records each mocked channel in `window.__mockSockets`, and exposes an `emit` helper that mirrors the original inline class-based mock.
- [x] Identify any shared utilities that fabricate interim/final transcript messages.
  - No standalone utilities exist today; the transcript payload generator remains an inline closure (`message(...)`) inside `visit-session-streams.spec.ts` that wraps JSON payloads in a `MessageEvent` before dispatching them to the mock socket.
- [x] Capture references in `visit-session-streams.spec` that rely on the mocked transcription channel.
  - The spec still imports `USE_REAL_TRANSCRIBE_SOCKET` to branch between mock-vs-real execution and, when mocking, waits for `window.__mockSockets` and emits interim/final messages through that array.

## 2. Introduce Configuration Flags for Mock vs. Real Sockets
- [x] Add an environment-driven toggle (e.g., `USE_REAL_TRANSCRIBE_SOCKET`) that Playwright tests can set when the live stack is reachable.
  - `configureVisitStreamSockets` inspects `process.env.USE_REAL_TRANSCRIBE_SOCKET` at runtime and passes the boolean into the injected script so we can swap the transcription channel to the live endpoint while keeping other streams mocked.
- [x] Ensure the default path (CI/offline) still hydrates the existing mock socket implementation.
  - With the flag unset (default), every channel uses the mock socket and the spec manually emits the full stream, preserving CI behavior.
- [x] Update documentation (README or test helper comments) to explain how to run E2E with real vs. mocked sockets.
  - Added inline helper documentation plus a README note describing how to export `USE_REAL_TRANSCRIBE_SOCKET=true` before running `npm run test:e2e` when a real stack is available.

## 3. Implement Real `/api/transcribe/stream` Connection in Playwright Helper
- [x] Modify the helper to establish a WebSocket connection to `/api/transcribe/stream` when the real-socket flag is enabled.
  - The Playwright init script now exposes `window.__visitStreamHarness`, which records the live transcription socket whenever `USE_REAL_TRANSCRIBE_SOCKET` is set and keeps the remaining channels mocked for deterministic suggestions.
- [x] Handle authentication/session headers that the live endpoint expects.
  - Delegating to the browser's native `WebSocket` preserves the bearer-token query parameters and subprotocols already sent by the production app, so the backend `ws_require_role` guard continues to succeed without extra plumbing.
- [x] Keep mocks for other live streams (codes/compliance/collab) untouched.
  - Codes, compliance, and collaboration sockets still use the shimmed mock implementation, allowing deterministic emissions regardless of which mode the transcription channel uses.

## 4. Adapt `visit-session-streams.spec`
- [x] Refactor the spec so that transcription assertions work in both real and mock modes.
  - `deliverVisitStreamPayloads` now streams bytes through the live socket (and issues a `stop` frame) or replays mocked payloads so both paths hydrate the UI consistently.
- [x] Replace direct references to `window.__mockSockets` with a helper abstraction that routes to mock or real implementations.
  - `waitForVisitStreamHarness` and `waitForMockSocketCount` replace the ad-hoc polling and expose stable hooks for emitting events.
- [x] Verify the flow: “Start visit → speak → interim → final” using Playwright while asserting the Suggestion Panel updates as before.
  - The spec opens the Full Transcript modal to assert the interim badge and transcript text before re-validating the mocked compliance and coding suggestions.

## 5. Validate the End-to-End Experience
- [ ] **Next:** Run the real WebSocket regression pack (`e2e/real_ws_transcription.spec.ts`, `e2e/real_ws_codes_compliance.spec.ts`) against staging using `E2E_MOCK_WS=false npx playwright test` once credentials and browsers are available.
- [ ] **Next:** Re-run the suite with `E2E_MOCK_WS=true` to reconfirm CI stability after the real-mode changes land.
- [ ] **Next:** Capture and log any flakiness, latency, or retry requirements observed while exercising the real sockets so we can tune helper waits.

## 6. Clean Up and Follow-Up
- [x] Backfill automated documentation (e.g., in repo docs or runbooks) describing how to switch modes.
  - README and [`docs/e2e_real_ws_plan.md`](./e2e_real_ws_plan.md) now call out the env toggles and direct spec links.
- [ ] **Next:** Plan the rollout for additional live streams after validating transcription, codes, and compliance in staging.
- [ ] **Next:** Share real-mode run artifacts with QA so they can monitor transcript latency and suggestion panel accuracy post-merge.
