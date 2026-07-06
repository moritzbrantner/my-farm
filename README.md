# My Farm

My Farm is a standalone local farming sim prototype. In local development, a Rust server owns the farm state, persists it to SQLite, and exposes a small JSON API consumed by a browser client rendered with React Three Fiber.

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

Use the in-app server URL field to point a device or simulator at the Rust server, such as `http://castle:8081` on the local network. The first mobile slice includes the native connection flow, main menu, farm HUD, diagnostics, and a native GL farm scene shell. Full web behavior parity is tracked in GitHub issue #103.

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
```

## Design Constraints

- Local server authoritative.
- GitHub Pages demo is browser-local and intentionally feature-limited.
- Single local farm.
- No real-money purchases.
- No premium currency.
- Original placeholder assets and terminology.
