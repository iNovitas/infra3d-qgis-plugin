import math
import base64
from qgis.gui import QgsMapCanvasItem, QgsMapCanvas
from qgis.core import QgsPointXY, QgsApplication
from qgis.PyQt.QtGui import QPixmap, QImage, QPainter, QTransform, QBrush
from qgis.PyQt.QtCore import Qt, QRectF, QByteArray
from qgis.PyQt.QtWidgets import QStyleOptionGraphicsItem, QWidget


# Inspired by Marco Hugentobler
class MarkerMapItem(QgsMapCanvasItem):
    def __init__(self, canvas: QgsMapCanvas):
        super().__init__(canvas)
        self.rotation = 0
        self.current_position = QgsPointXY()
        
        self.base64_icon = "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAABmJLR0QA/wD/AP+gvaeTAAADBklEQVRYw+2YX2iPURjHP+cls1/zZ/N3/m21GyYrFy4kuSDMdjH/c4MiSsxIUijJjUaK7YLIhcwW8n8uhFEkMVuKsLLNmsnGRvvZmp2vi/d98yNsNu/8Ln7fOhfvOed5zqfnPc9zzvvCP5SkMZLGElMPZK01kr7IVUI0Au6T7ZQ6v8paWxhtcGmSpIs7pZJcL4jKiBpASWelDmlVnLQEqb1Zkm5ES/TmS5KKd0iZSAuQTqz3o7gsGqJXqXcvpRVIq5HWIC1GqimXpOre+nd6CZcHZHB6O3wC4oEBQAdwaitAirV2T2/WML2AGwLUU3ktxK5sSAasN9gPeAPsLoLpKwDGG2Pq+jSCkvYBIQpy4R1uBDu91gI0AwUbgXYk7e/rxEiXJJ1cK61CunVIqn4ktbx1W225dKdAWmOkwqV+wkzry8Q4p9YP0sPTku3UH/WwyIXuYdkxPYCbBZQhC8YBa+H2EXhcAo2v3UlJKTA1B2bnQf+B+HMl5TiOcylowPvAdABe34P8OfCqDRKAkOcx7O3JVAPbrsPEeb75M2PM5MAAJS0HigGougl5cyAOGO0lR6T6Ae+9hDlwHqYs8kfWG2OOBQVYCWRAO6wbB02Nv4aLrBFNQHwIjtZBXCJAjTEmNagykwzAlcNQ3QUcXl0cDtSH4dJBv3d0kHXQxXl6FQZ1ARdpkejZRPoICNC9iDa+cBOiu4oHmqqgLew/BQbYigCpB/lv3XIDbUECvsUAQ1Phy19YtXs28Ql4p3QwgJIeAJA+1y0fTjdXaAImzvV9VAQZwRIAsjbDqAHwsQsPBvgMDAWyNvm9ZwIDdBynDCgjNBxyj38vxM5vPLcCdcDGAhiWBvDEcZyLgR511to0Y0wVAI9PQf5K9xWOwD1V/D3XCAwGthTCjA2++VRjTEWggN4+mgncBeBTA1zdC5UXoLnBnTB4JEzJguw9kDTBt8lyHKe0L69cKZKe/3C1CjdL4Y8/X7hqrbWT/udXXaaky5LqI6AaJJVaaxfG/rnEFFNMMcUU0x/1Dbk14fovKBg6AAAAAElFTkSuQmCC"
        self.icon_size = 32
        self.pixmap = self.load_pixmap_from_base64(self.base64_icon)
        
        
    def load_pixmap_from_base64(self, base64_str):
            img_data = base64.b64decode(base64_str)
            img = QImage.fromData(img_data)
            return QPixmap.fromImage(img)
        
    def setMapPosition(self, point: QgsPointXY):
        self.current_position = point
        self.setPos(self.toCanvasCoordinates(self.current_position))

    def setRotation(self, rotation: int):
        diff = rotation - self.rotation
        self.prepareGeometryChange()
        self.rotation = rotation
        if abs(diff) > 1:
            self.update()
            self.updateCanvas()

    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget: QWidget):
            if painter is None or self.pixmap.isNull():
                return

            painter.save()
            
            #rotate around center point
            painter.rotate(self.rotation)
            
            # Draw pixmap centered
            half_w = self.pixmap.width() / 2
            half_h = self.pixmap.height() / 2
            painter.drawPixmap(int(-half_w), int(-half_h), self.pixmap)

            painter.restore()

    def updatePosition(self):
        self.setMapPosition(self.current_position)
        
    def boundingRect(self) -> QRectF:
        radius = (self.icon_size * 1.5) / 2.0
        return QRectF(-radius, -radius, radius * 2, radius * 2)
