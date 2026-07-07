# Native Mobile Mirrors Web Phone UX

Native mobile mirrors the web app viewed at phone width for the Farm play surface and recognizable farm scene while remaining an Expo/native client. WebView remains rejected from ADR 0020 because the mobile app still needs native controls and rendering, but full-screen native destinations are allowed for heavier flows so the GL Farm scene can unmount or pause for performance. Shared scene primitives should live in workspace packages rather than being imported from one app into another.
