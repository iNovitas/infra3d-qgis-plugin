from qgis.PyQt.QtCore import Qt, QAbstractTableModel, QModelIndex, QCoreApplication


class LoaRule:
    def __init__(self, rule_type, level, min_scale, max_scale):
        self.type = rule_type
        self.level = level
        self.minScale = min_scale
        self.maxScale = max_scale


class LoaRuleTableModel(QAbstractTableModel):
    def __init__(self, rules=None, parent=None):
        self.headers = [
            QCoreApplication.translate("infra3D", "Type"),
            QCoreApplication.translate("infra3D", "Level"),
            QCoreApplication.translate("infra3D", "Min Scale"),
            QCoreApplication.translate("infra3D", "Max Scale"),
        ]
        super().__init__(parent)
        self.rules = rules or []

    def rowCount(self, parent=QModelIndex()):
        return len(self.rules)

    def columnCount(self, parent=QModelIndex()):
        return 4

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        if not index.isValid():
            return None

        rule = self.rules[index.row()]
        col = index.column()

        if role in (Qt.ItemDataRole.DisplayRole, Qt.ItemDataRole.EditRole):
            return [rule.type, rule.level, rule.minScale, rule.maxScale][col]

        return None

    def setData(self, index, value, role=Qt.ItemDataRole.EditRole):
        if role != Qt.ItemDataRole.EditRole or not index.isValid():
            return False

        rule = self.rules[index.row()]
        col = index.column()

        if col == 0:
            rule.type = value
        elif col == 1:
            rule.level = int(value)
        elif col == 2:
            rule.minScale = float(value)
        elif col == 3:
            rule.maxScale = float(value)

        self.dataChanged.emit(index, index)
        return True

    def headerData(self, section, orientation, role=Qt.ItemDataRole.DisplayRole):
        if role != Qt.ItemDataRole.DisplayRole:
            return None

        if orientation == Qt.Orientation.Horizontal:
            return self.headers[section]

        if orientation == Qt.Orientation.Vertical:
            return str(section + 1)

        return None

    def flags(self, index):
        return (
            Qt.ItemFlag.ItemIsSelectable
            | Qt.ItemFlag.ItemIsEnabled
            | Qt.ItemFlag.ItemIsEditable
        )
