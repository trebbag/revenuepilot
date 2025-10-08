# Real WebSocket E2E configuration

End-to-end tests can execute against either the historical mocked WebSocket
harness or the real RevenuePilot streaming endpoints. The default behaviour in
CI continues to use mocks to provide deterministic fixtures, but engineers can
set a runtime flag to exercise the production sockets locally.

## Switching between mock and real sockets

| Mode  | Description | Command |
| --- | --- | --- |
| Mock (default) | Uses the in-browser harness to simulate WebSocket payloads and PDF downloads. Recommended for CI and quick feedback loops. | `npx playwright test` |
| Real | Connects to the backend `/ws/*` and `/api/transcribe/stream` sockets, exercises the notification feed, and downloads live PDFs. Requires the backend stack running locally. | `E2E_MOCK_WS=false npx playwright test e2e/real_ws_* e2e/notifications_and_pdfs.spec.ts` |

The `E2E_MOCK_WS` flag is plumbed through `playwright.config.ts` so all servers
in the test environment see a consistent value. Leaving the flag unset resolves
to `true` on CI and `true` locally; set it explicitly to `false` when you want to
exercise the real WebSocket flows.

## Available real WebSocket scenarios

| Spec | Coverage |
| --- | --- |
| `e2e/real_ws_transcription.spec.ts` | Boots a documentation session, streams a generated WAV sample into the real `/api/transcribe/stream` socket, and asserts the interim/final transcript payloads are delivered back to the UI. |
| `e2e/real_ws_codes_compliance.spec.ts` | Starts a live visit, confirms the `/ws/compliance` and `/ws/codes` channels connect successfully, and verifies the finalize button remains disabled while validation issues are active. |
| `e2e/notifications_and_pdfs.spec.ts` | Connects to `/ws/notifications`, finalizes a note through the API, and validates both note and summary PDF downloads exceed the minimum size threshold. |

> **Tip:** You can add the flag to your shell profile or `.env` file when working
> on real socket scenarios frequently. The Playwright watchers also honour the
> environment variable.

## Legacy compatibility

The previous `USE_REAL_TRANSCRIBE_SOCKET` flag is still honoured. When set, it
enables the transcription socket while keeping the other channels mocked. The
new `E2E_MOCK_WS` flag takes precedence, so you can mix-and-match behaviour if
required for ad-hoc debugging.
