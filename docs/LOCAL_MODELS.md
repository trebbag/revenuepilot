# Local Model Setup

RevenuePilot can run without external AI services by enabling offline mode. To
use real small models instead of placeholder responses, download compatible
models and enable **local models** in the app settings.

## Downloading models

1. Install the required libraries:

```bash
pip install transformers
```

2. Download the models you plan to use. The following commands fetch the tiny
sample models used in the defaults:

```bash
python - <<'PY'
from transformers import pipeline
pipeline("text2text-generation", model="hf-internal-testing/tiny-random-t5")
pipeline("summarization", model="sshleifer/tiny-bart-large-cnn")
pipeline("text-generation", model="hf-internal-testing/tiny-random-gpt2")
PY
```

The first call for each model downloads the weights and caches them locally so
subsequent runs work offline.

## Enabling local models

1. Start the backend with offline mode:

```bash
export USE_OFFLINE_MODEL=true
```

2. Launch the app and open **Settings → Enable local models**. When this toggle
is on, the backend will load the downloaded models instead of returning fixed
placeholders.
