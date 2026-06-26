// Dimension Line Renderer - Architectural style dimension lines
const DimensionRenderer = {
  // Create a horizontal dimension between two x-coordinates at a given y
  createHorizontal(x1, x2, y, offset, groupEl) {
    const dimY = y - offset;
    const dist = Math.abs(x2 - x1);
    const distMm = Math.round(dist * 1000);

    // Extension lines
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1, y1: y, x2: x1, y2: dimY - 0.3,
      class: 'dimension-line'
    }));
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: x2, y1: y, x2: x2, y2: dimY - 0.3,
      class: 'dimension-line'
    }));

    // Tick marks
    const tickSize = 0.4;
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: x1 - tickSize * 0.3, y1: dimY - tickSize * 0.3,
      x2: x1 + tickSize * 0.3, y2: dimY + tickSize * 0.3,
      stroke: '#0066cc', 'stroke-width': 0.05
    }));
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: x2 - tickSize * 0.3, y1: dimY - tickSize * 0.3,
      x2: x2 + tickSize * 0.3, y2: dimY + tickSize * 0.3,
      stroke: '#0066cc', 'stroke-width': 0.05
    }));

    // Dimension line
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1, y1: dimY, x2: x2, y2: dimY,
      class: 'dimension-line'
    }));

    // Text
    const text = Utils.createSVGElement('text', {
      x: (x1 + x2) / 2,
      y: dimY - 0.5,
      class: 'dimension-text'
    });
    text.textContent = Utils.formatDimension(distMm);
    groupEl.appendChild(text);
  },

  // Create a vertical dimension between two y-coordinates at a given x
  createVertical(y1, y2, x, offset, groupEl) {
    const dimX = x + offset;
    const dist = Math.abs(y2 - y1);
    const distMm = Math.round(dist * 1000);

    // Extension lines
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: x, y1, x2: dimX + 0.3, y2: y1,
      class: 'dimension-line'
    }));
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: x, y1: y2, x2: dimX + 0.3, y2: y2,
      class: 'dimension-line'
    }));

    // Tick marks
    const tickSize = 0.4;
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: dimX - tickSize * 0.3, y1: y1 - tickSize * 0.3,
      x2: dimX + tickSize * 0.3, y2: y1 + tickSize * 0.3,
      stroke: '#0066cc', 'stroke-width': 0.05
    }));
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: dimX - tickSize * 0.3, y1: y2 - tickSize * 0.3,
      x2: dimX + tickSize * 0.3, y2: y2 + tickSize * 0.3,
      stroke: '#0066cc', 'stroke-width': 0.05
    }));

    // Dimension line
    groupEl.appendChild(Utils.createSVGElement('line', {
      x1: dimX, y1, x2: dimX, y2: y2,
      class: 'dimension-line'
    }));

    // Text (rotated)
    const text = Utils.createSVGElement('text', {
      x: dimX + 1,
      y: (y1 + y2) / 2,
      class: 'dimension-text',
      transform: `rotate(-90, ${dimX + 1}, ${(y1 + y2) / 2})`
    });
    text.textContent = Utils.formatDimension(distMm);
    groupEl.appendChild(text);
  }
};
