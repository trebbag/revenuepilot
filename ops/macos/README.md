# macOS Automator application

`revenuepilot.app` is a pre-configured Automator-style application that starts the stack via `scripts/revenuepilot_launch.sh`.

## Usage

1. Copy `ops/macos/revenuepilot.app` to a convenient location on your Mac (e.g., `/Applications` or alongside the cloned repository).
2. Ensure the repository is available at `$HOME/revenuepilot` **or** set `REVENUEPILOT_HOME` to the repository path.
3. Double-click `revenuepilot.app` to start the launcher script.

The bundled workflow uses a `Run Shell Script` action; if it cannot locate `scripts/revenuepilot_launch.sh`, it will display a macOS alert and exit.
