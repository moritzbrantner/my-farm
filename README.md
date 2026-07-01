# My Farm

My Farm is a standalone local farming sim prototype. A Rust server owns the farm state, persists it to SQLite, and exposes a small JSON API consumed by a browser client rendered with React Three Fiber.

## Run

```sh
bun install
cargo run
bun run dev
```

Open `http://127.0.0.1:5176` on this machine, or `http://castle:5176` from another device on the same network.

The server listens on `http://0.0.0.0:8081` by default so it is reachable over the local network at `http://castle:8081`. Set `MY_FARM_HOST=127.0.0.1` to restrict it to this machine. It stores `my-farm.sqlite` in the project directory unless `MY_FARM_DATABASE_URL` is set.

## Commands

```sh
cargo test --workspace
cargo run -p contract_codegen
cargo run -p contract_codegen -- --check
bun run build:web
```

## Design Constraints

- Local server authoritative.
- Single local farm.
- No real-money purchases.
- No premium currency.
- Original placeholder assets and terminology.
