class RPCClient {
  constructor(socket) {
    this.socket = socket;
    this.methods = {};
  }
  register(name, method) {
    this.methods[name] = method;
  }
  remove(name) {
    delete this.methods[name];
  }
  start() {
    // TODO: Is there a better way for this?
    // We create a local variable called self, so we can access the
    // `this` variable within the nested function.
    // Otherwise the `this` variable referes to the `start` function,
    // which is also an object in JS
    let self = this;
    this.socket.on("rpcrequest", function (params) {
      let success = true;
      let result = null;
      try {
        // Try to execute the method that was defined in
        // rpcrequest
        result = self.methods[params.method](params.args);
      } catch (error) {
        success = false;
        result = error;
      }
      self.socket.emit("rpcresponse", {
        success: success,
        result: result,
        id: params.id,
      });
    });
  }
}

class PubSubClient {
  constructor(socket) {
    this.socket = socket;
    this.events = {};

    socket.on("pubsub", function (event_trigger) {
      if (this.events[event_trigger.event])
        this.events[event_trigger.event](event_trigger.params);
    });
  }
  on_event(event, method) {
    this.events[event] = method;
  }
  emit_event(event, params) {
    this.socket.emit("pubsub", {
      event: event,
      params: params,
    });
  }
}

window.globalManager = undefined;
window.projectsOpen = true; // overwatch current state of project selection
window.latestLon = 0;
window.latestLat = 0;
window.latestAzi = 0;

/**
 * Main entry point. Registeres flask server and events in the API.
 */
function main() {
  // io --> https://socket.io/docs/v4/client-api/
  const socket = io(
    location.protocol + "//" + document.domain + ":" + location.port,
  );
  const rpcclient = new RPCClient(socket);
  rpcclient.register("initInfra3d", initInfra3d);
  rpcclient.register("lookAt2DPosition", moveTo2DPosition);
  rpcclient.register("setOnPositionChanged", setOnPositionChanged);
  rpcclient.register("unsetOnPositionChanged", unsetOnPositionChanged);
  rpcclient.register("getNetwork", getNetwork);
  rpcclient.start();

  const pubsubClient = new PubSubClient(socket);
  pubsubClient.emit_event("loaded", {});

  /**
   * Retrieves an access token for the given domain and client ID.
   * If no token is stored in local storage, an interactive login is initiated.
   * If a token is stored, but has expired, the token is refreshed using the stored refresh token.
   * @returns {Promise<string>} The access token
   */
  async function getAccessToken() {
    const tokens = window.localStorage.getItem("infra3d-tokens");

    // If no tokens are found, initiate interactive login
    if (!tokens) {
      const mytokenresponse =
        await infra3dapi.getAccessTokenFromInteractiveLogin("viewer");

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
        await infra3dapi.getAccessTokenFromInteractiveLogin("viewer");

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

  function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
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
   *
   * @example
   * const MY_ACCESS_TOKEN = await getAccessToken();
   * const manager = await infra3dapi.init("viewer", MY_ACCESS_TOKEN, {
   *   username: "YOUR_USERNAME", // or  userid: "YOUR_USERID"
   *   email: "YOUR_EMAIL_ADRESS",
   * });
   * window.globalManager = manager; // set manager a global variable
   * const projects = await manager.getProjects();
   * updateProjectContainer(projects);
   */
  async function initInfra3d(params) {
    const MY_ACCESS_TOKEN = await getAccessToken();
    try {
      const manager = await infra3dapi.init("viewer", MY_ACCESS_TOKEN, {
        username: "YOUR_USERNAME", // or  userid: "YOUR_USERID"
        email: "YOUR_EMAIL_ADDRESS",
      });
      window.globalManager = manager; // set manager a global variable
      const projects = await manager.getProjects();
      updateProjectContainer(projects);
    } catch ({ error, message }) {
      console.log(error, message)
      loginError(error, message);
    }
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
        <button id="logout-button">${message}.\n\n Please log out and try another login.</button>
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
        <button class="loadviewer">${item.name}</button>
        `;

      // Interaction --> select project
      card.addEventListener("click", () => {
        loadViewer(item);
      });

      // add card to dom
      container.appendChild(card);
    });
  }

  /**
   * Initializes the viewer with the given project item.
   * @param {cardProps} item Project item to initialize the viewer with.
   * @return {void} Nothing, but initializes the viewer.
   * @example
   * const item = {
   *   uid: "12345",
   *   name: "Test Project",
   * };
   * loadViewer(item);
   */
  async function loadViewer(item) {
    toggleProjects(true); // close the project selection regardless of current state
    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 150)),
    ); // wait for projects to be toggled

    // init viewer
    window.globalManager.initViewer({
      project_uid: item.uid,
      show_toolbar: true,
      show_topbar: true,
      show_cockpit: true,
      show_mapWindow: true,
    });

    window.globalManager.on("viewerset", (_viewer) => {
      const viewer = _viewer;
      pubsubClient.emit_event("initialized", {}); // NOTE: fires once the viewer is initialized

      // Add subscription for the 'nodechanged' event --> fires if position changes
      viewer.on("nodechanged", (node) => {
        onPosChanged(node);
      });

      // Add subscription for the 'campaignschanged' event
      viewer.on("campaignschanged", async (_) => {
        await onNetworkChanged(viewer);
      });

      // TODO: Maybe remove later if not needed
      // Add subscription for the 'panorotationchanged' event
      viewer.on("panorotationchanged", (panorotation) => {});

      // Viewer Azimuth Changed Event --> fires if orientation changes
      viewer.on("lookazimuthchanged", (azi) => {
        onAziChanged(azi);
      });
    });
  }

  /*
  Add event listener to the project toggler --> To open and close projects
  */
  document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("projectToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", toggleProjects);
    }

    const logoutButton = document.getElementById("logout");
    logoutButton.addEventListener("click", (e) => logout());
  });

  /**
   * Toggles the project selection display.
   * If open is true, the project selection is hidden.
   * If open is false or not provided, the project selection is shown.
   * The project selection is hidden if window.projectsOpen is true, and vice versa.
   * @param {boolean} open - Current state (opposite of desired state) of the toggling
   */
  function toggleProjects(open = false) {
    if (open === true) {
      window.projectsOpen = true;
    }
    const sidebar = document.getElementById("sidebar");
    const viewer = document.getElementById("viewer");
    const container = document.getElementById("projectContainer");
    const sidebarHeader = document.getElementById("sidebarHeader");
    const logoutButton = document.getElementById("logout");

    if (window.projectsOpen === true) {
      container.style.display = "none";
      logoutButton.style.display = "none";
      sidebarHeader.style.display = "none";
      sidebar.style.width = "0px";
      sidebar.style.padding = "0px";
      viewer.style.left = "0px";
    } else {
      container.style.display = "block";
      logoutButton.style.display = "block";
      sidebarHeader.style.display = "inherit";
      sidebar.style.width = "250px";
      sidebar.style.padding = "10px";
      viewer.style.left = "270px"; // width (250) + 2*padding (10 each side)
    }
    window.projectsOpen = !window.projectsOpen;
  }

  /**
   * Called when the viewer's position changes.
   * Stores the viewer's position to global variables and emits an event to QGIS.
   * @param {object} node object containing the viewer's position in lon and lat.
   * @private
   */
  function onPosChanged(node) {
    window.latestLon = node.lon; // --> store to global variable
    window.latestLat = node.lat; // --> store to global variable
    movementInfra2QGIS();
  }

  /**
   * Called when the viewer's orientation (azimuth) changes.
   * Stores the viewer's orientation to a global variable and emits an event to QGIS.
   * @param {object} azi object containing the viewer's orientation in deg.
   * @private
   */
  function onAziChanged(azi) {
    window.latestAzi = azi.value; // QGIS expects Azi in deg --> store to global variable
    movementInfra2QGIS();
  }

  /**
   * Send signal when campaign has changed.
   * @param {*} viewer _
   */
  async function onNetworkChanged(viewer) {
    await delay(500); // wait for 500 ms untill we center QGIS // TODO: find better way

    pubsubClient.emit_event("networkChanged", {});
  }

  /**
   * Decide which function to use for acquiring the network based on the current map scale.
   * @param {JSON} params parameters of the bounding box and the current map scale
   */
  async function getNetwork(params) {
    if (params.scale <= 500) {
      await getNetworkOriginal(params);
    } else if (params.scale <= 50000) {
      let loa = params.scale < 2500 ? 0 : 1;
      await getNetworkLines(params, loa);
    } else {
      let loa = params.scale < 250000 ? 0 : params.scale < 500000 ? 1 : 2;
      await getNetworkHexes(params, loa);
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
    routes = await window.globalManager._viewer.getRoutes(1, {
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
    routes = await window.globalManager._viewer.getRouteLines(loa, {
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
    routes = await window.globalManager._viewer.getRouteHexes(loa, {
      epsg: 3857,
      maxEasting: params.eMax,
      maxNorthing: params.nMax,
      minEasting: params.eMin,
      minNorthing: params.nMin,
    });
    pubsubClient.emit_event("newNetwork", { routes });
  }

  /**
   * Emits an event to QGIS with the viewer's position.
   * @private
   */
  function movementInfra2QGIS() {
    params = {
      easting: window.latestLon,
      northing: window.latestLat,
      orientation: window.latestAzi,
    };
    pubsubClient.emit_event("positionChanged", params);
  }

  // TODO: Remove later when plugin's original functionalities are restored
  // function initInfra3d(params) {
  //   console.log("Initializing Infra3d...");
  //   infra3d.init(
  //     "infra3d",
  //     params.url,
  //     {
  //       lang: params.lang,
  //       map: params.map,
  //       layer: params.layer,
  //       navigation: params.navigation,
  //       buttons: params.buttons,
  //       credentials: [params.username, params.password],
  //     },
  //     function () {
  //       pubsubClient.emit_event("initialized", {});
  //     },
  //     this,
  //   );
  //   return 0;
  // }

  //TODO: remove?
  /**
   * Makes the infra3d viewer to look at a coordinate.
   * @param {object} params - object containing parameters for the method.
   * @param {number} params.easting - easting coordinate in LV95.
   * @param {number} params.northing - northing coordinate in LV95.
   * @return {void}
   */
  function lookAt2DPosition(params) {
    window.globalManager._viewer.lookAtPosition(
      params.easting,
      params.northing,
      undefined,
      undefined,
      3857,
    );
    return 0;
  }

  /**
   * Makes the infra3d viewer to move to a coordinate
   * @param {object} params
   * @param {number} params.easting easting coordinate in LV95
   * @param {number} params.northing northing coordinate in LV95
   * @return {void}
   */
  function moveTo2DPosition(params) {
    window.globalManager._viewer.moveToPosition(
      params.easting,
      params.northing,
      undefined,
      undefined,
      3857,
    );
    return 0;
  }

  /**
   * Sets a callback function to be called when the viewer's position changes.
   * The callback function will be given the following parameters:
   * - easting: easting coordinate in LV95
   * - northing: northing coordinate in LV95
   * - height: height of the viewer above the ground
   * - epsg: EPSG code of the coordinate system
   * - orientation: orientation of the viewer in degrees
   * - framenumber: frame number of the current image
   * - cameraname: name of the camera
   * - cameratype: type of the camera
   * - date: date when the image was taken
   * - address: address of the location where the image was taken
   * - campaign: campaign for which the image was taken
   * @return {void}
   */
  function setOnPositionChanged(_) {
    infra3d.setOnPositionChanged(function (
      easting,
      northing,
      height,
      epsg,
      orientation,
      framenumber,
      cameraname,
      cameratype,
      date,
      address,
      campaign,
    ) {
      var params = {
        easting: easting,
        northing: northing,
        height: height,
        epsg: epsg,
        orientation: orientation,
        framenumber: framenumber,
        cameraname: cameraname,
        cameratype: cameratype,
        date: date,
        address: address,
        campaign: campaign,
      };

      pubsubClient.emit_event("positionChanged", params);
    }, this);
    return 0;
  }

  /**
   * Unsets the callback function for the position changed event.
   * This function will be called without any parameters.
   * @return {void}
   */
  function unsetOnPositionChanged(_, _) {
    infra3d.unsetOnPositionChanged();
  }
}

main();
