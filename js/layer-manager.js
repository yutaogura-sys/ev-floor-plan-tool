// Layer Manager - Controls visibility and colors of DXF layers
class LayerManager {
  constructor() {
    this.layers = {};
    this.layerList = document.getElementById('layer-list');
  }

  // Initialize layers from DXF data
  init(dxfData) {
    this.layers = {};
    const colorMap = {
      'ROAD': { color: '#888888', label: '道路' },
      'BUILDING': { color: '#333333', label: '建物' },
      'STRUCTURE': { color: '#666666', label: '構造物' },
      'CENTER': { color: '#cccccc', label: '中心線' },
      '0': { color: '#777777', label: 'デフォルト' }
    };

    for (const layerName of Object.keys(dxfData.layers)) {
      const info = colorMap[layerName] || { color: '#777', label: layerName };
      this.layers[layerName] = {
        visible: true,
        color: info.color,
        label: info.label,
        name: layerName
      };
    }

    this._renderLayerList();
  }

  _renderLayerList() {
    this.layerList.innerHTML = '';

    for (const [name, layer] of Object.entries(this.layers)) {
      const item = document.createElement('div');
      item.className = 'layer-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = layer.visible;
      checkbox.addEventListener('change', () => {
        layer.visible = checkbox.checked;
        this.toggleLayer(name, layer.visible);
      });

      const colorBox = document.createElement('span');
      colorBox.className = 'layer-color';
      colorBox.style.backgroundColor = layer.color;

      const label = document.createElement('span');
      label.className = 'layer-name';
      label.textContent = `${layer.label} (${name})`;

      item.appendChild(checkbox);
      item.appendChild(colorBox);
      item.appendChild(label);
      this.layerList.appendChild(item);
    }
  }

  toggleLayer(name, visible) {
    const el = document.getElementById(`layer-${name}`);
    if (el) el.style.display = visible ? '' : 'none';
  }

  setLayerColor(name, color) {
    if (this.layers[name]) {
      this.layers[name].color = color;
      const el = document.getElementById(`layer-${name}`);
      if (el) el.setAttribute('stroke', color);
      this._renderLayerList();
    }
  }
}
