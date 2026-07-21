# infra3D plugin

## Table of Contents

- [1. Usage](#1-usage)
  - [1.1 QGIS-Part](#11-qgis-part)
  - [1.2 Interactivity between QGIS and Infra3D](#12-interactivity-between-qgis-and-infra3d)
  - [1.3 Basic Infra3D viewer](#13-basic-infra3d-viewer)
- [2. Architecture](#2-architecture)
  - [2.1 Components](#21-components)
    - [2.1.1 QGIS-Part](#211-qgis-part)
    - [2.1.2 Local Bridge Server](#212-local-bridge-server)
    - [2.1.3 Web-Viewer](#213-web-viewer)
  - [2.2 Exchange Protocols](#22-exchange-protocols)
    - [2.2.1 Remote Procedure Call (RPC)](#221-remote-procedure-call-rpc)
    - [2.2.2 Publish-Subscribe (Pub/Sub)](#222-publish-subscribe-pubsub)
  - [2.3 Event-Listeners](#23-event-listeners)
    - [2.3.1 Event-Listeners in QGIS](#231-event-listeners-in-qgis)
    - [2.3.2 Event-Listeners in web-viewer](#232-event-listeners-in-web-viewer)
- [3. Development](#4-development)
- [4. License](#5-license)

## 1. Usage

The Infra3D plugin is a connection between infra3D (https://www.infra3d.com) and QGIS. infra3D runs in a browser and the plugin allows to set and move the camera position in QGIS as well as to show the current camera position and direction in QGIS. The plugin supports the following actions:

### 1.1 QGIS-Part

- **Enable infra3D** opens the infra3D application in the browser and etablishes the connection between QGIS and the browser application.
- **Set infra3D position** activates the tool to set a position in QGIS. Once activated, click on the QGIS map canvas, the position in infra3D will update.
- **Zoom to marker** sets the map extent to the position where the marker is.
- **Settings** opens the settings dialog.

### 1.2 Interactivity between QGIS and Infra3D

- **QGIS → infra3D:** Changing the position in QGIS (using the `Set infra3D position`-button) updates the position in infra3D.
- **infra3D → QGIS:** Changing the position of the viewer (infra3D) updates the position on the QGIS map canvas.
- **infra3D → QGIS:** Changing the viewing direction of the viewer (infra3D) updates the orientation on the QGIS map canvas.
- **infra3D → QGIS:** The network is fetched and updated in the QGIS map canvas each time the extent of the map canvas has changed.

### 1.3 Basic infra3D viewer

- **Interactive Login:** To sign in and access the projects, the [interactive login](https://developers.Infra3D.com/javascript-api/examples/authenticate-interactively) is used. If possible, the last login is stored to prevent the user from having to log in again each time.
- **Project Selection:** Once logged in, all projects allocated to the user are displayed in a collapsable project selection view. Toggling the project view is enabled by a button, indicated by a `Folder`-Icon.
- **infra3D viewer:** By selecting a project from the `Project Selection`, the infra3D viewer is loaded and the project selection is closed. The viewer displays all components of the infra3D viewer plus the afore-mentioned project selection modal.

## 2. Architecture

High level: three main components communicate via HTTP and a WebSocket upgrade on the same local port:

- QGIS plugin (`src/`): Controller for QGIS UI, coordinates conversions, and message routing to the local bridge.
- Local bridge server (`server/local_server.py`): Serves static files and upgrades `/ws` to WebSocket for bidirectional messages.
- Web viewer (`server/static/`): infra3D integration and a thin UI for project selection and viewer initialization.

Message patterns

- HTTP: serves the viewer UI and static assets (default host: `localhost`, default port: 5000).
- WebSocket: shares the same port via `/ws` and carries both RPC-style control messages and Pub/Sub-style event broadcasts between the web viewer and QGIS.

Common message types (both directions):

- `initInfra3d` (RPC): initialize infra3D viewer with configuration.
- `moveTo2DPosition` (RPC): request viewer to move to given Lon/Lat/Azimuth.
- `nodechanged` / `lookazimuthchanged` (Pub/Sub): viewer publishes camera updates as Lon/Lat/Azimuth.
- `campaignschanged` (Pub/Sub): viewer notifies QGIS to fetch updated network data; network is transmitted as GeoJSON.

Coordinate handling

- Viewer uses geographic coordinates (lon/lat); plugin converts coordinates to the project's CRS for display in QGIS (the plugin currently transforms to EPSG:2056 where appropriate).

Source file responsibilities

- [src/infra3d_plugin.py](src/infra3d_plugin.py): Plugin initialization, UI integration, action handlers.
- [src/infra3d_client.py](src/infra3d_client.py): WebSocket client and signal definitions used by the plugin core.
- [src/infra3d_map_tool.py](src/infra3d_map_tool.py): Map interaction tool for setting camera positions.
- [src/infra3d_layer_utils.py](src/infra3d_layer_utils.py): Helpers to create/update marker and network layers in QGIS.
- [src/infra3d_settings.py](src/infra3d_settings.py): Settings persistence and defaults.
- [server/local_server.py](server/local_server.py): Serves `server/static/` and implements the WebSocket bridge.
- [server/static/index.html](server/static/index.html): Minimal web viewer shell that bootstraps infra3D and the local UI.

Ports and configuration

- Default HTTP and WebSocket: `localhost:5000` (configurable in settings).

Security considerations

- The local server binds to `localhost` by default. Do not expose this service to untrusted networks without adding authentication.

## 3. Development

Clone this repo into your the python folder in your QGIS-Profile. This could be the following path (on windows):
`C:\Users\{username}\AppData\Roaming\QGIS\QGIS4\profiles\default\python\plugins`.
After cloning, the plugin can be activated in QGIS.

For generating the tranlation files:

```bash
lupdate src/infra3d_client.py src/infra3d_layer_utils.py src/infra3d_map_tool.py src/infra3d_plugin.py src/infra3d_settings_loarule.py src/infra3d_settings.py ui/settings.ui -ts i18n/infra3d_de.ts
lrelease i18n/infra3d_de.ts -qm i18n/infra3d_de.qm
```

## 4. License

This project is licensed under GNU General Public License, version 2. See [LICENSE](./LICENSE).
