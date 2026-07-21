from qgis.PyQt.QtCore import QCoreApplication, QSettings

DEFAULT_LAYER_GROUP = "infra3D"
DEFAULT_LOA_RULES = [
    {"type": "routes", "level": 0, "min": 0, "max": 1000},
    {"type": "routeLines", "level": 0, "min": 1000, "max": 4000},
    {"type": "routeLines", "level": 1, "min": 4000, "max": 70000},
    {"type": "routeHexes", "level": 0, "min": 70000, "max": 250000},
    {"type": "routeHexes", "level": 1, "min": 250000, "max": 1000000},
    {"type": "routeHexes", "level": 2, "min": 1000000, "max": float("inf")},
]


class Infra3dSettings:
    def __init__(self):
        self.default_current_position_layer = QCoreApplication.translate(
            "infra3D", "Current Position"
        )
        self.default_network_layer_lines = QCoreApplication.translate(
            "infra3D", "Network - Lines"
        )
        self.default_network_layer_hexes = QCoreApplication.translate(
            "infra3D", "Network - Hexes"
        )

        self.qsettings = QSettings()

        self.tenant_identifier = self.qsettings.value(
            "/infra3d_viewer/general/tenant_identifier"
        )
        self.start_project_uid = self.qsettings.value(
            "/infra3d_viewer/general/start_project_uid"
        )
        self.layer_group = self.qsettings.value(
            "/infra3d_viewer/general/layer_group", DEFAULT_LAYER_GROUP
        )
        self.current_position_layer = self.qsettings.value(
            "/infra3d_viewer/general/current_position_layer",
            self.default_current_position_layer,
        )
        self.network_layer_name_lines = self.qsettings.value(
            "/infra3d_viewer/general/network_layer_name_lines",
            self.default_network_layer_lines,
        )
        self.network_layer_name_hexes = self.qsettings.value(
            "/infra3d_viewer/general/network_layer_name_hexes",
            self.default_network_layer_hexes,
        )
        self.loa_rules = self.qsettings.value(
            "/infra3d_viewer/advanced/loa_rules", DEFAULT_LOA_RULES
        )

        # Ensure, that the defaults are written to the QSettings
        self.save()

    def save(self):
        self.qsettings.setValue(
            "/infra3d_viewer/general/tenant_identifier", self.tenant_identifier
        )
        self.qsettings.setValue(
            "/infra3d_viewer/general/start_project_uid", self.start_project_uid
        )
        self.qsettings.setValue("/infra3d_viewer/general/layer_group", self.layer_group)
        self.qsettings.setValue(
            "/infra3d_viewer/general/current_position_layer",
            self.current_position_layer,
        )
        self.qsettings.setValue(
            "/infra3d_viewer/general/network_layer_name_lines",
            self.network_layer_name_lines,
        )
        self.qsettings.setValue(
            "/infra3d_viewer/general/network_layer_name_hexes",
            self.network_layer_name_hexes,
        )
        self.qsettings.setValue("/infra3d_viewer/advanced/loa_rules", self.loa_rules)

    def reset_to_defaults(self, page: str):
        if page == "general":
            self.tenant_identifier = ""
            self.start_project_uid = ""
            self.layer_group = DEFAULT_LAYER_GROUP
            self.current_position_layer = self.default_current_position_layer
            self.network_layer_name_lines = self.default_network_layer_lines
            self.network_layer_name_hexes = self.default_network_layer_hexes
        elif page == "advanced":
            self.loa_rules = DEFAULT_LOA_RULES

        self.save()
