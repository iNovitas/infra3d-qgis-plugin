class WebSocketBridge {
  constructor(url) {
    this.url = url;
    this.methods = {};
    this.pending = [];
    this.socket = null;
  }
  register(name, method) {
    this.methods[name] = method;
  }
  remove(name) {
    delete this.methods[name];
  }
  start() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("open", () => {
      while (this.pending.length > 0) {
        this.socket.send(JSON.stringify(this.pending.shift()));
      }
      this.emit_event("loaded", {});
    });
    this.socket.addEventListener("message", async (message) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch (error) {
        console.error("Invalid websocket payload", error);
        return;
      }

      if (payload.method) {
        const method = this.methods[payload.method];
        if (!method) {
          console.error(`Unknown RPC method: ${payload.method}`);
          return;
        }

        try {
          await method(payload.args);
        } catch (error) {
          console.error("RPC method failed", error);
        }
      }
    });
    this.socket.addEventListener("close", () => {
      console.warn("infra3D websocket closed");
    });
    this.socket.addEventListener("error", (error) => {
      console.error("infra3D websocket error", error);
    });
  }
  emit_event(event, params) {
    this.send({
      event: event,
      params: params,
    });
  }
  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return;
    }

    this.pending.push(payload);
  }
}

window.infra3D_manager = null;
window.infra3D_viewer = null;

/**
 * Main entry point. Registers the local server client and viewer events.
 */
function main() {
  const bridge = new WebSocketBridge(window.INFRA3D_WEBSOCKET_URL);
  bridge.register("initInfra3d", initInfra3d);
  bridge.register("moveTo2DPosition", moveTo2DPosition);
  bridge.register("getNetwork", getNetwork);
  bridge.start();

  const pubsubClient = bridge;

  let start_position = null;

  /**
   * Retrieves an access token for the given domain and client ID.
   * If no token is stored in local storage, an interactive login is initiated.
   * If a token is stored, but has expired, the token is refreshed using the stored refresh token.
   * @returns {Promise<string>} The access token
   */
  async function getAccessToken(tenant_identifier) {
    const tokens = window.localStorage.getItem("infra3d-tokens");

    // If no tokens are found, initiate interactive login
    if (!tokens) {
      const mytokenresponse =
        await infra3dapi.getAccessTokenFromInteractiveLogin(
          "viewer",
          tenant_identifier,
        );

      // We only store the necessary tokens for refreshing
      const token_reduced = {
        domain: mytokenresponse.domain,
        clientId: mytokenresponse.clientId,
        refresh_token: mytokenresponse.refresh_token,
      };

      window.localStorage.setItem(
        "infra3d-tokens",
        JSON.stringify(token_reduced),
      );
      return mytokenresponse.access_token;
    }

    // If tokens are found, refresh the access token
    try {
      const tokenObj = JSON.parse(tokens);
      const refreshedTokens = await infra3dapi.getAccessTokenFromRefresh(
        // NOTE: The documentation-example contains an error --> function  is no longer called 'doRefreshToken'
        tokenObj.domain,
        tokenObj.clientId,
        tokenObj.refresh_token,
      );
      return refreshedTokens.access_token;
    } catch (error) {
      const mytokenresponse =
        await infra3dapi.getAccessTokenFromInteractiveLogin(
          "viewer",
          tenant_identifier,
        );

      // We only store the necessary tokens for refreshing
      const token_reduced = {
        domain: mytokenresponse.domain,
        clientId: mytokenresponse.clientId,
        refresh_token: mytokenresponse.refresh_token,
      };

      window.localStorage.setItem(
        "infra3d-tokens",
        JSON.stringify(token_reduced),
      );
      return mytokenresponse.access_token;
    }
  }

  /**
   * Initializes the Infra3D API with the given access token and
   * user credentials.
   *
   * @param {Object} params - Contains the user credentials, such as
   * username, userid, or email.
   *
   * @returns {Promise<void>} - Resolves when the Infra3D API has been
   * initialized.
   */
  async function initInfra3d(params) {
    const access_token = await getAccessToken(params.tenantIdentifier);

    showLoading();

    try {
      const manager = await infra3dapi.init(
        "viewer",
        access_token,
        undefined,
        logout,
      );
      window.infra3D_manager = manager; // set manager as global variable

      const projects = await manager.getProjects();
      updateProjectContainer(projects);

      document.getElementById("sidebar").style.display = "flex"; // show sidebar with button
      if (params.startProjectUid) {
        loadViewer(params.startProjectUid);
        toggleProjects(true); // close project selection as viewer is loaded
      } else {
        document.getElementById("projectPlaceholder").style.display = "flex"; // show placeholder text if no project is loaded
      }

      hideLoading();
    } catch ({ error, message }) {
      loginError(error, message);
    }
  }

  function showLoading() {
    document.getElementById("loadingOverlay").classList.add("active");
  }

  function hideLoading() {
    document.getElementById("loadingOverlay").classList.remove("active");
  }

  /**
   * Handles login errors by displaying an error message
   * and clearing the project container.
   *
   * @param {string} error - The error message.
   * @param {string} message - The error message to be displayed.
   */
  function loginError(error, message) {
    const container = document.getElementById("projectContainer");
    container.innerHTML = "";

    const msg = document.createElement("button");
    msg.id = "error";
    msg.innerHTML = `
        <button id="logout-button" class="text">${message}.\n\n Please log out and try another login.</button>
        `;
    container.appendChild(msg);
    msg.addEventListener("click", (e) => logout());
  }

  /**
   * Reset infra3d-tokens to log out the user and reload the page for completion.
   */
  function logout() {
    window.localStorage.setItem("infra3d-tokens", "");
    window.location.reload();
  }

  /**
   * Update the project container in the sidebar with the given list of projects.
   * This function empties the project container, creates a card for each project and
   * adds an event listener for the load button of each card. When a load button
   * is clicked, the loadViewer function is called with the associated project.
   * @param {Array} projects - List of projects to display in the sidebar.
   * @returns {void}
   */
  function updateProjectContainer(projects) {
    const container = document.getElementById("projectContainer");

    container.innerHTML = ""; // empty content of project-list

    projects.forEach((item) => {
      // create card for project
      const card = document.createElement("div");
      card.className = "projectCard";

      // create content
      card.innerHTML = `
        <p class="text">${item.name}</p>
        `;

      // Interaction --> select project
      card.addEventListener("click", () => {
        document.getElementById("projectPlaceholder").style.display = "none"; // hide placeholder text
        loadViewer(item.uid);
      });

      // add card to dom
      container.appendChild(card);
    });
  }

  /**
   * Initializes the viewer with the given project item.
   * @param {string} project_uid The UID of the project to initialize the viewer with.
   * @return {void} Nothing, but initializes the viewer.
   */
  async function loadViewer(project_uid) {
    toggleProjects(true); // close the project selection regardless of current state

    // init viewer
    window.infra3D_manager.on("viewerset", (_viewer) => {
      const viewer = _viewer;
      pubsubClient.emit_event("initialized", {}); // NOTE: fires once the viewer is initialized

      // Add subscription for the 'nodechanged' event --> fires if position changes
      viewer.on("nodechanged", (node) => {
        onPosChanged(node);
      });

      // TODO: Maybe remove later if not needed
      // Add subscription for the 'panorotationchanged' event
      viewer.on("panorotationchanged", (panorotation) => {});

      // Viewer Azimuth Changed Event --> fires if orientation changes
      viewer.on("lookazimuthchanged", (evt) => {
        onAziChanged(evt.value);
      });
    });

    window.infra3D_viewer = await window.infra3D_manager.initViewer({
      project_uid: project_uid,
      start_position: start_position ? start_position : undefined,
      show_toolbar: true,
      show_topbar: true,
      show_cockpit: true,
      show_mapWindow: true,
    });
  }

  /*
  Add event listener to the project toggler --> To open and close projects
  */
  document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("projectToggleBtn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => toggleProjects());
    }
  });

  /**
   * Toggles the project selection display.
   * If open is true, the project selection is hidden.
   * If open is false or not provided, the project selection is shown.
   * @param {boolean} open - Current state (opposite of desired state) of the toggling
   */
  function toggleProjects(open = null) {
    const sidebar = document.getElementById("sidebar");
    if (open === null) {
      sidebar.classList.toggle("closed");
      return;
    }
    sidebar.classList.toggle("closed", open);
  }

  /**
   * Called when the viewer's position changes.
   * Stores the viewer's position to global variables and emits an event to QGIS.
   * @param {object} node object containing the viewer's position in lon and lat.
   * @private
   */
  function onPosChanged(node) {
    const params = {
      longitude: node.lon,
      latitude: node.lat,
    };
    pubsubClient.emit_event("positionChanged", params);
  }

  /**
   * Called when the viewer's orientation (azimuth) changes.
   * Stores the viewer's orientation to a global variable and emits an event to QGIS.
   * @param {float} azi float containing the viewer's orientation in deg.
   * @private
   */
  function onAziChanged(azi) {
    const params = {
      azimuth: azi,
    };
    pubsubClient.emit_event("azimuthChanged", params);
  }

  /**
   * Decide which function to use for acquiring the network based on the input.
   * @param {JSON} params parameters of the bounding box and the level and loa
   */
  function getNetwork(params) {
    // Check all attributes are provided
    if (
      params === undefined ||
      params.level === undefined ||
      params.loa === undefined ||
      params.minEasting === undefined ||
      params.maxEasting === undefined ||
      params.minNorthing === undefined ||
      params.maxNorthing === undefined ||
      params.epsg === undefined
    ) {
      console.error("Missing required parameters for getNetwork");
      return;
    }

    if (!window.infra3D_viewer) return;

    const extent = {
      minEasting: params.minEasting,
      maxEasting: params.maxEasting,
      minNorthing: params.minNorthing,
      maxNorthing: params.maxNorthing,
      epsg: params.epsg,
    };

    const post = (routes) => {
      pubsubClient.emit_event("newNetwork", { routes });
    };

    const error = (error) => {
      pubsubClient.emit_event("networkError", { error });
    };

    switch (params.level) {
      case "routes": {
        window.infra3D_viewer.getRoutes(1, extent).then(post).catch(error);
        break;
      }
      case "routeLines": {
        window.infra3D_viewer
          .getRouteLines(params.loa, extent)
          .then(post)
          .catch(error);
        break;
      }
      case "routeHexes": {
        window.infra3D_viewer
          .getRouteHexes(params.loa, extent)
          .then(post)
          .catch(error);
        break;
      }
      default: {
        error(`Level: ${params.level} is not supported!`);
      }
    }
  }

  /**
   * Retrieves the road network within the bounding box at the original scale
   * (no line simplification) and sends it using the pubsubClient.
   * @param {JSON} params - Parameters of the bounding box.
   * @returns {Promise<void>} - Resolves when the road network has been sent.
   * @private
   */
  async function getNetworkOriginal(params) {
    routes = await window.infra3D_viewer.getRoutes(1, {
      epsg: 3857,
      maxEasting: params.eMax,
      maxNorthing: params.nMax,
      minEasting: params.eMin,
      minNorthing: params.nMin,
    });
    pubsubClient.emit_event("newNetwork", { routes });
  }

  /**
   * Retrieves the generalized road network within the bounding box
   * and sends it using the pubsubClient.
   * @param {JSON} params - Parameters of the bounding box.
   * @param {number} loa - Level of abstraction. 0 for weak line simplification, 1 for strong line simplification.
   * @returns {Promise<void>} - Resolves when the road network has been sent.
   * @private
   */
  async function getNetworkLines(params, loa) {
    routes = await window.infra3D_viewer.getRouteLines(loa, {
      epsg: 3857,
      maxEasting: params.eMax,
      maxNorthing: params.nMax,
      minEasting: params.eMin,
      minNorthing: params.nMin,
    });
    pubsubClient.emit_event("newNetwork", { routes });
  }

  /**
   * Retrieves the generalized road network within the bounding box as
   * a collection of hexagons and sends it using the pubsubClient.
   * @param {JSON} params - Parameters of the bounding box.
   * @param {number} loa - Level of abstraction. 0 for weak line simplification, 1 for strong line simplification.
   * @returns {Promise<void>} - Resolves when the road network has been sent.
   * @private
   */
  async function getNetworkHexes(params, loa) {
    routes = await window.infra3D_viewer.getRouteHexes(loa, {
      epsg: 3857,
      maxEasting: params.eMax,
      maxNorthing: params.nMax,
      minEasting: params.eMin,
      minNorthing: params.nMin,
    });
    pubsubClient.emit_event("newNetwork", { routes });
  }

  /**
   * Makes the infra3d viewer to move to a coordinate
   * @param {object} params
   * @param {number} params.easting easting coordinate in LV95
   * @param {number} params.northing northing coordinate in LV95
   * @return {void}
   */
  function moveTo2DPosition(params) {
    window.infra3D_viewer.moveToPosition(
      params.easting,
      params.northing,
      undefined,
      undefined,
      4326,
    );
    return 0;
  }
}

main();
