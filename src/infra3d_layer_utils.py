import json
import os

from .infra3d_settings import Infra3dSettings
from qgis.core import (
    Qgis,
    QgsProject,
    QgsVectorLayer,
    QgsJsonUtils,
    QgsFeature,
    QgsGeometry,
    QgsPointXY,
    QgsMessageLog,
)
from qgis.PyQt.QtCore import QObject, QCoreApplication


class Infra3DLayerUtils(QObject):
    def __init__(self, iface, settings: Infra3dSettings):
        self.iface = iface
        self.settings = settings

        self.plugin_dir = os.path.dirname(__file__)

        # Layers
        self.layer_group = None
        self.marker_layer_id = None
        self.network_layer_lines_id = None
        self.network_layer_hexes_id = None

        self.marker_position: QgsPointXY = QgsPointXY(0, 0)
        self.marker_azimuth: float = 0.0

    def add_layers(self):
        group_name = self.settings.layer_group

        project = QgsProject.instance()
        root = project.layerTreeRoot()

        # Check if group already exists by name
        existing_groups = root.findGroups()
        existing_group = next((g for g in existing_groups if g.name() == group_name), None)

        if existing_group is not None:
            self.layer_group = existing_group
        else:
            self.layer_group = root.insertGroup(0, group_name)

        layer_name_lines = self.settings.network_layer_name_lines
        layer_name_hexes = self.settings.network_layer_name_hexes

        self.marker_layer_id = self._init_marker_layer()

        self.network_layer_lines_id = self._init_network_layer(
            layer_name_lines, "LineString"
        )
        self.network_layer_hexes_id = self._init_network_layer(
            layer_name_hexes, "Polygon"
        )

    def remove_layers(self):
        if self.network_layer_lines_id:
            try:
                QgsProject.instance().removeMapLayer(self.network_layer_lines_id)
            except Exception:
                pass
            self.network_layer_lines_id = None

        if self.network_layer_hexes_id:
            try:
                QgsProject.instance().removeMapLayer(self.network_layer_hexes_id)
            except Exception:
                pass
            self.network_layer_hexes_id = None

        if self.marker_layer_id:
            try:
                QgsProject.instance().removeMapLayer(self.marker_layer_id)
            except Exception:
                pass
            self.marker_layer_id = None

        if self.layer_group is not None:
            try:
                if len(self.layer_group.findLayerIds()) == 0:
                    QgsProject.instance().layerTreeRoot().removeChildNode(self.layer_group)
            except Exception:
                pass
            
            self.layer_group = None
        
        self.iface.mapCanvas().refresh()

    def _init_marker_layer(self):
        layer_name = self.settings.current_position_layer
        existing_layers = QgsProject.instance().mapLayersByName(layer_name)
        if existing_layers:
            return existing_layers[0].id()

        # new mem layer
        layer = QgsVectorLayer(
            "Point?crs=EPSG:4326&field=azimuth:double", layer_name, "memory"
        )
        layer.setReadOnly(True)

        # Hide the temporary layer warning when closing QGIS
        layer.setCustomProperty("skipMemoryLayersCheck", 1)

        if not layer.isValid():
            self.iface.messageBar().pushMessage(
                "infra3D",
                QCoreApplication.translate("infra3D", "Failed to create marker layer!"),
                Qgis.MessageLevel.Critical,
                5,
            )
            return

        # mapping for styles
        style_file = "infra3DMarker.qml"
        style_path = os.path.join(self.plugin_dir, "resources", style_file)

        # styling
        if os.path.exists(style_path):
            layer.loadNamedStyle(style_path)

        QgsProject.instance().addMapLayer(layer, False)
        self.layer_group.addLayer(layer)
        return layer.id()

    def _init_network_layer(self, layer_name: str, geom_type: str) -> QgsVectorLayer:
        existing_layers = QgsProject.instance().mapLayersByName(layer_name)
        if existing_layers:
            return existing_layers[0].id()

        # new mem layer
        layer = QgsVectorLayer(f"{geom_type}?crs=EPSG:4326", layer_name, "memory")
        layer.setReadOnly(True)

        # Hide the temporary layer warning when closing QGIS
        layer.setCustomProperty("skipMemoryLayersCheck", 1)

        if not layer.isValid():
            self.iface.messageBar().pushMessage(
                "infra3D",
                QCoreApplication.translate(
                    "infra3D", "Failed to create network layer!"
                ),
                Qgis.MessageLevel.Critical,
                5,
            )
            return

        # mapping for styles
        style_file = (
            "infra3DLines.qml"
            if geom_type.lower() == "linestring"
            else "infra3DHexes.qml"
        )
        style_path = os.path.join(self.plugin_dir, "resources", style_file)

        # styling
        if os.path.exists(style_path):
            layer.loadNamedStyle(style_path)

        QgsProject.instance().addMapLayer(layer, False)
        self.layer_group.addLayer(layer)
        return layer.id()

    def update_network_layer(self, geojson_data: dict, geom_type: str) -> None:
        if self.network_layer_lines_id is None or self.network_layer_hexes_id is None:
            return

        # fill layer with features
        features = QgsJsonUtils.stringToFeatureList(json.dumps(geojson_data))
        if features:
            if geom_type.lower() in ["linestring", "multilinestring"]:
                layer = QgsProject.instance().mapLayer(self.network_layer_lines_id)
                other_layer = QgsProject.instance().mapLayer(
                    self.network_layer_hexes_id
                )
            elif geom_type.lower() in ["polygon", "multipolygon"]:
                layer = QgsProject.instance().mapLayer(self.network_layer_hexes_id)
                other_layer = QgsProject.instance().mapLayer(
                    self.network_layer_lines_id
                )
            else:
                self.iface.messageBar().pushMessage(
                    "infra3D",
                    QCoreApplication.translate(
                        "infra3D", "Unknown geometry type received: "
                    )
                    + geom_type,
                    Qgis.MessageLevel.Warning,
                    5,
                )
                return

            if layer is None or other_layer is None:
                return

            other_layer.dataProvider().truncate()  # clear the other layer to avoid stale features
            other_layer.triggerRepaint()

            provider = layer.dataProvider()
            provider.truncate()  # remove existing features
            success, _ = provider.addFeatures(list(features))

            layer.triggerRepaint()

            if not success:
                self.iface.messageBar().pushMessage(
                    "infra3D",
                    QCoreApplication.translate(
                        "infra3D", "Failed to add features to network layer!"
                    ),
                    Qgis.MessageLevel.Critical,
                    5,
                )

    def update_marker(self, position: QgsPointXY = None, azimuth: float = None) -> None:
        layer = QgsProject.instance().mapLayer(self.marker_layer_id)
        if layer is None:
            self.iface.messageBar().pushMessage(
                "infra3D",
                QCoreApplication.translate("infra3D", "Marker layer not initialized!"),
                Qgis.MessageLevel.Critical,
                5,
            )
            return

        if position is not None and isinstance(position, QgsPointXY):
            self.marker_position = position

        if azimuth is not None and isinstance(azimuth, (int, float)):
            self.marker_azimuth = azimuth

        feature = QgsFeature()
        feature.setGeometry(QgsGeometry.fromPointXY(self.marker_position))
        feature.setAttributes(
            [self.marker_azimuth] if self.marker_azimuth is not None else [None]
        )

        if layer is None:
            return

        provider = layer.dataProvider()
        provider.truncate()  # remove existing features
        success, _ = provider.addFeatures([feature])

        layer.triggerRepaint()

        if not success:
            self.iface.messageBar().pushMessage(
                "infra3D",
                QCoreApplication.translate(
                    "infra3D", "Failed to add features to marker layer!"
                ),
                Qgis.MessageLevel.Critical,
                5,
            )
