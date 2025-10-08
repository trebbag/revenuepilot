# E2E Real WebSocket & PDF Test Plan

This document breaks the original request into actionable subtasks.

## 1. Environment Configuration
- [ ] Introduce configuration flag (e.g., `E2E_MOCK_WS`) with default `true` for CI.
- [ ] Provide alternative config or runtime switch to enable real WebSocket connections locally.
- [ ] Document how to toggle between mock and real modes in Playwright configuration.

## 2. Real WebSocket Test Helpers
- [ ] Update shared utilities to connect to real WS endpoints.
- [ ] Ensure audio fixture streaming helper can send real audio data over WS.
- [ ] Provide stubs/fallbacks when mock mode is active.

## 3. Transcription Scenario (`e2e/real_ws_transcription.spec.ts`)
- [ ] Start visit workflow triggering transcription WS connection.
- [ ] Feed audio fixture and wait for interim + final transcript lines.
- [ ] Validate UI updates for interim badge visibility lifecycle.
- [ ] Guard test with `test.skip` when `E2E_MOCK_WS=true`.

## 4. Codes & Compliance Scenario (`e2e/real_ws_codes_compliance.spec.ts`)
- [ ] Simulate note edit leading to server gating updates.
- [ ] Capture and assert deltas from codes and compliance channels.
- [ ] Verify finalize button disable/enable behavior.
- [ ] Skip under mock mode flag.

## 5. Notifications & PDF Scenario (`e2e/notifications_and_pdfs.spec.ts`)
- [ ] Trigger note finalization to emit notification event and increment unread badge.
- [ ] Download "Download Note (PDF)" and "Download Patient Summary (PDF)".
- [ ] Assert response headers include `application/pdf` and payload size > 2 KB.
- [ ] Skip when running with mock WebSockets.

## 6. Reliability & Timing
- [ ] Add targeted waits for DOM changes (interim badge, button state, badges).
- [ ] Configure generous but bounded timeouts for network interactions.

## 7. Documentation & CI Updates
- [ ] Update README or docs with instructions for running E2E in real WS mode.
- [ ] Ensure CI defaults to mock mode and explicitly documents override mechanism.

## 8. Validation
- [ ] Run Playwright E2E locally with real WS to confirm coverage.
- [ ] Run mock mode to ensure backward compatibility.
- [ ] Capture PDF assertions and verify they exceed size threshold.
