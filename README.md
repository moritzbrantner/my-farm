# My Farm

My Farm is a standalone local farming sim. In local development, a Rust server owns the farm state, persists it to SQLite, and exposes a small JSON API consumed by a browser client rendered with React Three Fiber.

GitHub Pages serves a browser-only demo that runs an early production slice through Rust WebAssembly. The demo is static, saves progress in browser localStorage, and intentionally does not include every local-server feature.

## Run

```sh
bun install
cargo run
bun run dev
```

Open `http://127.0.0.1:5176` on this machine, or `http://castle:5176` from another device on the same network.

The server listens on `http://0.0.0.0:8081` by default so it is reachable over the local network at `http://castle:8081`. Set `MY_FARM_HOST=127.0.0.1` to restrict it to this machine. It stores `my-farm.sqlite` in the project directory unless `MY_FARM_DATABASE_URL` is set.

## Expo Mobile Client

The native mobile client lives in `apps/mobile`. It is an Expo development-build app that connects to the existing Rust server over the same gameplay WebSocket protocol as the web client.

```sh
bun install
cargo run
bun run dev:mobile
```

Use the in-app server URL field to point a simulator or device at the Rust server, such as `http://castle:8081` on the local network. This mobile slice includes the native connection flow, main menu, farm scene shell, HUD, diagnostics, and native screens for residents, market/shop, delivery orders, farmhouse actions, wiki, and settings.

For an Android emulator running on this machine, use `http://10.0.2.2:8081` as the Farm server URL. The local Android toolchain expects an AVD to exist before running the development build:

```sh
$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager list avd
$ANDROID_HOME/emulator/emulator -avd my_farm_pixel_api_35
bun run mobile:android
```

Mobile verification commands:

```sh
cd apps/mobile && bun run typecheck
curl -fsSL "https://get.maestro.mobile.dev" | bash
bun run test:mobile
bun run test:e2e:mobile
```

`bun run test:e2e:mobile` uses Maestro and expects a running Android emulator, the development build installed with app id `dev.moritzbrantner.myfarm`, and the Rust server listening on `0.0.0.0:8081`. iOS simulator validation requires macOS; from Linux, keep iOS coverage to EAS configuration and documented preview build commands.

## GitHub Pages Demo

Build the static Pages demo locally:

```sh
bun run build:pages
```

The Pages demo uses `VITE_MY_FARM_RUNTIME=wasm_demo`, compiles `crates/my_farm_wasm` with `wasm-pack`, and bundles the generated WASM through Vite. It supports fields, Wheat, Corn, the Farmhouse Oven, Bread, storage display, reset, and browser-local saves. It intentionally does not expose later local-server features such as Tool Shed construction or the Farm Shop.

In the local full game, the Farm Shop is a buildable road-edge Structure. Farm Residents move sellable Shop Stock into and out of the shop through queued Resident Tasks, and Customer Visits can passively buy one unreserved stocked item for coins. Delivery Orders remain the coins-and-XP objective.

## Commands

```sh
cargo test --workspace
cargo run -p contract_codegen
cargo run -p contract_codegen -- --check
bun run build:web
bun run build:pages
bun run test:mobile
bun run test:e2e:pages-demo
bun run validate
```

## Architecture

- The CQRS application layer is the authoritative entry point for gameplay Commands and read-model Queries.
- `my-farm` owns farming-specific rules and state. Generic deterministic simulation, navigation, catalog, scenario, and persistence primitives should converge on the matching `farm-game-engine` foundation crates when those crates are reproducibly consumable by CI.
- The legacy mini-engine is a compatibility adapter during that migration; new domain slices should be extracted incrementally rather than duplicating rules.
- Server, WASM Pages, web, and Expo are adapters around the same gameplay semantics.

## Design Constraints

- Local server authoritative.
- GitHub Pages demo is browser-local and intentionally feature-limited.
- Single local farm.
- No real-money purchases.
- No premium currency.
- Original placeholder assets and terminology.
