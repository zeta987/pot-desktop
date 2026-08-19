# AGENTS.md

Shared project instructions for AI coding agents (Claude Code, Codex, Gemini CLI, Cursor, etc.) working in this repository.
Tool-specific entry points such as `CLAUDE.md` import this file, so keep all durable project conventions here.

## Repository Policy — Fork-Only Contributions

This working copy is the personal fork **`zeta987/pot-desktop`** (`origin`). The original project **`pot-app/pot-desktop`** is configured as `upstream` and is read-only for us.

**Unless the user explicitly instructs otherwise in the current conversation:**

-   Never open a Pull Request against `pot-app/pot-desktop` (upstream). All Pull Requests target `zeta987/pot-desktop` only.
-   Never open, comment on, or edit an Issue on `pot-app/pot-desktop` (upstream). All Issues stay inside `zeta987/pot-desktop`.
-   The same restriction applies to any other third-party fork of pot-desktop (for example `shen1950/pot-desktop`): read and analyse freely, but do not create Pull Requests, Issues, or comments there.
-   `upstream` may be used for `git fetch`, `git diff`, `git log`, and cherry-picking commits inbound. Never `git push` to `upstream`.
-   When running `gh pr create`, always pass an explicit `--repo zeta987/pot-desktop`, because `gh` defaults to the upstream parent repository on forks.

If a change genuinely looks worth contributing upstream, describe the proposal to the user and wait for an explicit go-ahead before touching anything on `pot-app/pot-desktop`.

## Agent skills

### Issue tracker

GitHub Issues on the fork `zeta987/pot-desktop`, via the `gh` CLI — every command must pass an explicit `--repo zeta987/pot-desktop`, because `gh` defaults to the upstream parent on a fork. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Project Overview

Pot (pot-desktop) is a cross-platform text translation and OCR desktop application built with **Tauri v1** (Rust backend + React frontend). It supports 20+ translation APIs, multiple OCR engines, TTS, and a user-installable plugin system (`.potext` files). Licensed under GPLv3.

## Development Commands

```bash
pnpm install          # Install frontend dependencies (requires pnpm 8.5.0+, Node.js 21+)
pnpm tauri dev        # Start development mode (Vite dev server on port 1420 + Tauri)
pnpm tauri build      # Production build (creates platform-specific installers)
pnpm build            # Build frontend only (Vite)
pnpm test             # Run the Vitest suite once
pnpm test:watch       # Run Vitest in watch mode
pnpm test:coverage    # Run the suite with a V8 coverage report
npx prettier --check . # Check code formatting
npx prettier --write . # Auto-fix formatting
cargo check           # Type-check Rust code (run from src-tauri/)
cargo clippy          # Lint Rust code (run from src-tauri/)
```

Rust toolchain 1.80.0+ is required. The Cargo.toml version field stays `0.0.0` locally — CI patches it from git tags during release.

## Architecture

### Multi-Window Tauri App

The app runs as a **system tray application** — closing windows does not exit the process (`ExitRequested` is intercepted in `main.rs`). There are six window contexts defined across `tauri.conf.json` and Rust code:

| Window       | Purpose                                                        | Entry Point   |
| ------------ | -------------------------------------------------------------- | ------------- |
| `daemon`     | Invisible background process — runs hotkeys, tray, HTTP server | `daemon.html` |
| `translate`  | Main translation UI                                            | `index.html`  |
| `recognize`  | OCR recognition result display                                 | `index.html`  |
| `screenshot` | Screenshot capture overlay                                     | `index.html`  |
| `config`     | Settings panel                                                 | `index.html`  |
| `updater`    | App update dialog                                              | `index.html`  |

Vite bundles two HTML entry points (`index.html` + `daemon.html`), configured in `vite.config.js` via `rollupOptions.input`. The `daemon` window loads no visible UI.

### Frontend (src/)

**Stack:** React 18 + React Router 6 + NextUI 2 + TailwindCSS 3 + Jotai (state) + i18next (i18n) + Framer Motion (animation)

Key directories:

-   `src/window/` — Each subdirectory (`Translate/`, `Config/`, `Recognize/`, `Screenshot/`, `Updater/`) is a top-level window's React component tree. Routing in `App.jsx` maps paths to these windows.
-   `src/services/` — All external API integrations, organized by service type:
    -   `translate/` — 22 translation backends (Google, DeepL, OpenAI, Ollama, Baidu, Tencent, etc.)
    -   `recognize/` — 16 OCR backends (system OCR, Tesseract.js, Baidu, Tencent, etc.)
    -   `tts/` — Text-to-speech (Lingva)
    -   `collection/` — Vocabulary collection (Anki, Eudic)
    -   Each service directory exports a consistent interface; `index.jsx` in each service type folder provides the registry.
-   `src/hooks/` — React hooks (`useConfig/` for settings management, `useVoice/` for TTS, etc.)
-   `src/utils/service_instance.ts` — Service instance key management. Instance keys use `serviceName@randomId` format; keys prefixed with `plugin` are user-installed plugins.
-   `src/i18n/locales/` — Translation JSON files for 20+ languages.

### Backend (src-tauri/src/)

**Rust modules and their responsibilities:**

| Module           | Role                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| `main.rs`        | App bootstrap — plugin registration, setup hook, invoke handler registration   |
| `cmd.rs`         | `#[tauri::command]` functions exposed to frontend via `invoke()`               |
| `tray.rs`        | System tray menu construction and event handling (~2700 lines, largest module) |
| `config.rs`      | Configuration read/write via `tauri-plugin-store`, service availability checks |
| `server.rs`      | Local HTTP server (default port 60828) — external apps call pot via this API   |
| `window.rs`      | Window creation and management helpers                                         |
| `hotkey.rs`      | Global shortcut registration and handling                                      |
| `screenshot.rs`  | Screenshot capture                                                             |
| `system_ocr.rs`  | Platform-native OCR (Windows OCR API, macOS Vision, Linux Tesseract)           |
| `clipboard.rs`   | Clipboard monitoring and operations                                            |
| `lang_detect.rs` | Language detection using the `lingua` crate                                    |
| `backup.rs`      | WebDAV and local backup/restore                                                |
| `updater.rs`     | Auto-update check logic                                                        |

**Global state:** `APP` (`OnceCell<AppHandle>`) provides global access to the Tauri app handle. `StringWrapper` wraps a `Mutex<String>` for passing text between windows.

### IPC Pattern

Frontend calls Rust via `invoke('command_name', { args })` from `@tauri-apps/api/tauri`. All invokable commands are registered in `main.rs` via `tauri::generate_handler![]`. The Rust side defines them in `cmd.rs` (and some in other modules like `screenshot.rs`, `system_ocr.rs`).

### Platform-Specific Code

Rust uses `#[cfg(target_os = "...")]` extensively for:

-   **Windows:** `windows` crate for Win32 API, Windows OCR (`Media_Ocr`)
-   **macOS:** `macos-accessibility-client` for permissions, `window-shadows`
-   **Linux:** `libxdo` for X11 interaction, system Tesseract OCR

Platform-specific Tauri configs override base `tauri.conf.json`: `tauri.windows.conf.json`, `tauri.macos.conf.json`, `tauri.linux.conf.json`.

### Plugin System

Users can install `.potext` plugin files to extend translation, OCR, collection, or TTS capabilities. Plugin service instances are identified by keys starting with `plugin` (see `service_instance.ts`). The `install_plugin` command in Rust handles plugin installation.

## Code Style

**Frontend:** Prettier only (no ESLint). Config in `.prettierrc.json`: `printWidth: 120`, `tabWidth: 4`, single quotes, JSX single quotes, trailing comma `es5`, `endOfLine: lf`.

**Rust:** Edition 2021, standard `cargo fmt` conventions.

**File naming:** React components use PascalCase directories. Service integrations use snake_case directories. Config keys in the store use snake_case strings.

## CI/CD

GitHub Actions workflow (`.github/workflows/package.yml`) triggers on pushes to `master` with tags. It patches version numbers across `package.json`, `tauri.conf.json`, and `Cargo.toml` from the git tag, then builds for Windows (x64/x86/ARM64), macOS (x64/ARM64), and Linux (DEB/RPM/AppImage). The updater JSON is published to GitHub Releases.

## Key Tauri Plugins

`single-instance`, `autostart`, `fs-watch` (config file hot-reload), `store` (JSON config persistence), `log` (file + stdout logging), `sql` (SQLite for vocabulary/collection data). All sourced from the v1 branch of `tauri-apps/plugins-workspace`.
