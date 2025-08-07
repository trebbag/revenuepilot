# Local Model Setup

RevenuePilot can run without external AI services by enabling offline mode. To
use real small models instead of placeholder responses, download compatible
models and enable **local models** in the app settings.

## Downloading models

RevenuePilot ships with deterministic offline fallbacks so the API always
returns a response. To obtain higher quality results while offline you can
download small open‑source models. A helper script is provided:

```bash
pip install transformers whisper
python scripts/download_models.py
```

The script fetches tiny demonstration models from the Hugging Face Hub and
downloads the default Whisper model. You can also trigger the same process from
**Settings → Download local models**, which streams progress from the backend.

The models are stored in the Hugging Face cache so subsequent runs work without
network access.

## Enabling local models

1. Start the backend with the offline flags:

```bash
export USE_OFFLINE_MODEL=true
export USE_LOCAL_MODELS=true
```

2. Optional environment variables allow overriding model paths or names:

```bash
export LOCAL_BEAUTIFY_MODEL=hf-internal-testing/tiny-random-t5
export LOCAL_SUMMARIZE_MODEL=sshleifer/tiny-bart-large-cnn
export LOCAL_SUGGEST_MODEL=hf-internal-testing/tiny-random-gpt2
export WHISPER_MODEL=base  # speech-to-text size
```

3. Launch the app and open **Settings → Enable local models**. When this toggle
is on, the backend will load the downloaded models instead of returning fixed
placeholders. The output quality depends on the chosen models; the tiny
defaults are only meant for smoke tests.

## Validating installs

After downloading you can run a quick smoke test to ensure the models load
correctly:

```bash
python scripts/validate_models.py
```

Any failures are logged and the script falls back to the deterministic offline
placeholders so you can verify the expected output shape.
