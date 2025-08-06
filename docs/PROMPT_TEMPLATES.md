# Prompt Template Overrides

RevenuePilot's language model prompts can be customised without modifying the
source code.  Place a `prompt_templates.json` or `prompt_templates.yaml` file in
the `backend/` directory to add instructions that supplement the built‑in
prompts.

## File structure

The file contains three optional top‑level sections:

- `default` – instructions applied to all requests.
- `specialty` – overrides keyed by clinical specialty.
- `payer` – overrides keyed by payer name.

Each section may define the prompt *category* (`beautify`, `suggest`, or
`summary`).  The value for a category can be either a single string or a mapping
of language codes to strings.  When a mapping is used, the English (`en`)
version acts as a fallback if the requested language is missing.

Example (`prompt_templates.yaml`):

```yaml
default:
  beautify:
    en: "These instructions are always included."

specialty:
  cardiology:
    beautify:
      en: "Use cardiology terminology."

payer:
  medicare:
    suggest:
      en: "Follow Medicare coding rules."
```

With the above file, a call to `build_suggest_prompt(..., payer="medicare")`
will append the Medicare instruction to the default prompt.  Multiple matching
sections are concatenated in the order: `default`, `specialty`, then `payer`.
