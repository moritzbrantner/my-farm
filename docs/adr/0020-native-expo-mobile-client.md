# Native Expo Mobile Client

## Status

Accepted

## Context

My Farm currently ships a web client in `apps/web` backed by the Rust Axum server and generated TypeScript contracts. The game experience is largely implemented with React, DOM/CSS overlays, and React Three Fiber browser rendering.

The mobile client needs to run on iOS and Android with behavior parity for the current gameplay flows. The first milestone is local/server-configured play against the existing server, not auth, cloud hosting, app store submission, or offline gameplay.

## Decision

Build a first-class native Expo mobile client in `apps/mobile`.

The app uses Expo development builds, React Native UI, Expo GL with React Three Fiber's native renderer for farm and house scenes, and the existing Rust server as the authoritative gameplay backend. It connects over the current HTTP/WebSocket protocol and submits the existing `FarmCommand` messages with `expected_version`.

Shared client and rules code should move into packages consumed by both web and mobile:

- `@my-farm/contracts` re-exports generated TypeScript contract types.
- `@my-farm/game-client` owns protocol clients, WebSocket URL construction, response normalization, and platform adapters.
- `@my-farm/game-model` owns non-React, non-DOM selectors, presentation helpers, placement checks, and command-building support.

## Rejected Options

- WebView-first mobile app: fastest packaging path, but it preserves browser UI and rendering constraints instead of delivering native mobile performance and controls.
- On-device Rust runtime: could enable offline/local simulation later, but adds native bridge and packaging scope before the client parity problem is solved.
- Immediate cloud backend: useful for distribution, auth, and accounts later, but unnecessary for the first local/server-configured mobile milestone.

## Consequences

The mobile app is a second native client implementation, so browser-specific behavior must be pulled into shared packages before mobile rebuilds it. Native overlays, labels, panels, sheets, gestures, and settings are implemented with React Native views rather than DOM overlays or `@react-three/drei/Html`.

The Rust server remains authoritative. Mobile-only gameplay rules should not exist outside the generated contracts or shared `@my-farm/game-model` package.

## Scope Boundaries

This decision does not include WebView gameplay, app store submission, auth/accounts, cloud deployment, offline gameplay, or packaging the Rust core into the mobile app.
