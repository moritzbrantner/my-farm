# Native Expo Mobile Client

My Farm will add a first-class native Expo mobile client backed by the existing Rust Axum server, rather than packaging the browser game in a WebView or moving the Rust core on-device. This keeps the authoritative gameplay model and WebSocket command protocol unchanged while allowing the mobile client to rebuild rendering and controls with React Native and Expo GL for better device performance.

The trade-off is that full feature parity becomes a second client implementation, so browser-specific DOM and CSS behavior must be extracted into shared model/client packages before being rebuilt as native mobile surfaces.
