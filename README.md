# My Farm

My Farm is a standalone local farming sim prototype. A Rust server owns the farm state, persists it to SQLite, and exposes a small JSON API consumed by a browser client rendered with React Three Fiber.

## Run

```sh
bun install
cargo run
bun run dev
```

Open `http://127.0.0.1:5174`.

The server listens on `http://127.0.0.1:8081` by default and stores `my-farm.sqlite` in the project directory unless `MY_FARM_DATABASE_URL` is set.

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
