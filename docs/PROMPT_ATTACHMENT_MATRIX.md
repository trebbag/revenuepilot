# Prompt‑Attachment Matrix

When interacting with Codex, developers should attach different pieces of context depending on the task.  The following matrix explains what to include and why.  Keep each cell under 40 words.

| Attachment    | When to attach                                         | Why it helps                                             |
|--------------|--------------------------------------------------------|----------------------------------------------------------|
| **Source file(s)** | When modifying or adding logic to a specific file or module. Include only the relevant file(s) to minimise context. | Gives Codex the current implementation so it can generate a correct diff. Avoid sending unrelated files to reduce noise. |
| **Failing test** | When fixing a test failure. Send the test file or snippet that fails. | Highlights the expected behaviour and constraints so Codex can correct the implementation accordingly. |
| **Traceback** | When the error isn’t obvious from the test alone or involves runtime exceptions. | Provides stack information about where and why the failure occurs. Useful for diagnosing unexpected exceptions. |
| **Roadmap excerpt** | When asking Codex to work on a future feature or non‑blocking enhancement. | Contextualises the request within the project’s goals and priorities without overwhelming Codex with the full archive. |
| **Architecture doc** | When implementing cross‑cutting changes or new components. | Helps Codex understand overall system structure, data flow and dependencies, leading to better design choices. |
| **No attachment** | For simple refactors, doc updates or style fixes that don’t depend on existing code. | Keeps prompts concise. Codex already knows PEP‑8 and typical patterns; extraneous files can distract. |
