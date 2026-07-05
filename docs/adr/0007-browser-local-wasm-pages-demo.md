# Browser Local WASM Pages Demo

GitHub Pages publishes a static browser demo that runs the Rust core through WebAssembly instead of requiring the local Axum and SQLite server.

The normal development setup remains server-authoritative with SQLite persistence. The Pages demo is deliberately narrower: it shows the early crop and Farmhouse Oven bread production loop, stores progress in the visitor's browser, and hides later systems such as animals, market trading, delivery orders, storage upgrades, Tool Shed support structures, and the Farm Shop.

This keeps the public demo easy to open from GitHub Pages while preserving the server-backed architecture for the full prototype. The trade-off is that Pages saves are local to one browser and the demo is not expected to represent every game feature.
