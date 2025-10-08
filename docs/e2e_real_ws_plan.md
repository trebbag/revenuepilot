# E2E Real WebSocket & PDF Test Plan

This document breaks the original request into actionable subtasks.

## 1. Environment Configuration
- [x] Introduce configuration flag (e.g., `E2E_MOCK_WS`) with default `true` for CI.
- [x] Provide alternative config or runtime switch to enable real WebSocket connections locally.
- [x] Document how to toggle between mock and real modes in Playwright configuration.

> **Runbook**
>
> * Default CI/mocked execution: no additional env vars required (`E2E_MOCK_WS` defaults to `true`).
> * Real-socket execution: export `E2E_MOCK_WS=false` (or `USE_REAL_TRANSCRIBE_SOCKET=true` for the legacy harness) before running `npx playwright test`.
> * Specs live under [`e2e/`](../e2e/) and can be targeted directly, e.g. `npx playwright test e2e/real_ws_transcription.spec.ts`.

## 2. Real WebSocket Test Helpers
- [x] Update shared utilities to connect to real WS endpoints.
- [x] Ensure audio fixture streaming helper can send real audio data over WS.
- [x] Provide stubs/fallbacks when mock mode is active.

## 3. Transcription Scenario ([`e2e/real_ws_transcription.spec.ts`](../e2e/real_ws_transcription.spec.ts))
- [x] Start visit workflow triggering transcription WS connection.
- [x] Feed audio fixture and wait for interim + final transcript lines.
- [x] Validate UI updates for interim badge visibility lifecycle.
- [x] Guard test with `test.skip` when `E2E_MOCK_WS=true`.

**Coverage snapshot:** The spec authenticates against the local API, launches a visit, and streams a generated WAV buffer through the real `/api/transcribe/stream` socket. It asserts receipt of interim and final transcript payloads, checks the interim badge lifecycle, and re-validates that the UI reflects the final transcript before ending the visit.

## 4. Codes & Compliance Scenario ([`e2e/real_ws_codes_compliance.spec.ts`](../e2e/real_ws_codes_compliance.spec.ts))
- [x] Simulate note edit leading to server gating updates.
- [x] Capture and assert deltas from codes and compliance channels.
- [x] Verify finalize button disable/enable behavior.
- [x] Skip under mock mode flag.

**Coverage snapshot:** The spec edits the clinical note to trigger compliance recalculation, waits for live socket events on both `/api/codes/stream` and `/api/compliance/stream`, and validates badge counts alongside the finalize button guard state after the updates settle.

## 5. Notifications & PDF Scenario (`e2e/notifications_and_pdfs.spec.ts`)
- [ ] Trigger note finalization to emit notification event and increment unread badge.
- [ ] Download "Download Note (PDF)" and "Download Patient Summary (PDF)".
- [ ] Assert response headers include `application/pdf` and payload size > 2 KB.
- [ ] Skip when running with mock WebSockets.

## 6. Reliability & Timing
- [ ] Add targeted waits for DOM changes (interim badge, button state, badges).
- [ ] Configure generous but bounded timeouts for network interactions.

## 7. Documentation & CI Updates
- [x] Update README or docs with instructions for running E2E in real WS mode.
- [x] Ensure CI defaults to mock mode and explicitly documents override mechanism.

## 8. Validation
- [ ] Run Playwright E2E locally with real WS to confirm coverage.
- [ ] Run mock mode to ensure backward compatibility.
- [ ] Capture PDF assertions and verify they exceed size threshold.
