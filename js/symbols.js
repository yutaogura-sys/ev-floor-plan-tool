// EV Equipment Symbol Library
const Symbols = {
  // Define SVG symbols in <defs> section
  init(svg) {
    const defs = svg.querySelector('defs');

    // Dual-stand charger symbol
    const chargerSymbol = Utils.createSVGElement('symbol', {
      id: 'sym-charger-dual',
      viewBox: '-5 -10 10 20'
    });
    // Body
    chargerSymbol.appendChild(Utils.createSVGElement('rect', {
      x: -4, y: -8, width: 8, height: 16, rx: 1,
      fill: 'none', stroke: Utils.COLORS.evRed, 'stroke-width': 0.8
    }));
    // Plug connectors
    chargerSymbol.appendChild(Utils.createSVGElement('circle', {
      cx: -1.5, cy: -3, r: 1.2, fill: Utils.COLORS.evRed
    }));
    chargerSymbol.appendChild(Utils.createSVGElement('circle', {
      cx: 1.5, cy: -3, r: 1.2, fill: Utils.COLORS.blue
    }));
    // Cable lines
    chargerSymbol.appendChild(Utils.createSVGElement('line', {
      x1: -1.5, y1: -1.8, x2: -3, y2: 3,
      stroke: Utils.COLORS.evRed, 'stroke-width': 0.5
    }));
    chargerSymbol.appendChild(Utils.createSVGElement('line', {
      x1: 1.5, y1: -1.8, x2: 3, y2: 3,
      stroke: Utils.COLORS.blue, 'stroke-width': 0.5
    }));
    // EV text
    const evText = Utils.createSVGElement('text', {
      x: 0, y: 7, 'text-anchor': 'middle',
      'font-size': '4', fill: Utils.COLORS.evRed, 'font-weight': 'bold'
    });
    evText.textContent = 'EV';
    chargerSymbol.appendChild(evText);
    defs.appendChild(chargerSymbol);

    // Road marking symbol
    const roadMarkingSymbol = Utils.createSVGElement('symbol', {
      id: 'sym-road-marking',
      viewBox: '0 0 10 10'
    });
    roadMarkingSymbol.appendChild(Utils.createSVGElement('rect', {
      x: 0.5, y: 0.5, width: 9, height: 9,
      fill: 'rgba(0,153,51,0.1)', stroke: Utils.COLORS.green, 'stroke-width': 0.5
    }));
    const rmText = Utils.createSVGElement('text', {
      x: 5, y: 7, 'text-anchor': 'middle',
      'font-size': '5', fill: Utils.COLORS.green, 'font-weight': 'bold'
    });
    rmText.textContent = 'EV';
    roadMarkingSymbol.appendChild(rmText);
    defs.appendChild(roadMarkingSymbol);

    // Dimension arrow markers
    const arrowSize = 0.2; // 0.2m in DXF = 2mm on paper at 1:100
    const arrowEnd = Utils.createSVGElement('marker', {
      id: 'dim-arrow-end',
      viewBox: '0 0 10 10',
      refX: '10', refY: '5',
      markerWidth: arrowSize, markerHeight: arrowSize,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto'
    });
    arrowEnd.appendChild(Utils.createSVGElement('path', {
      d: 'M0,0 L10,5 L0,10 Z', fill: Utils.COLORS.blue
    }));
    defs.appendChild(arrowEnd);

    const arrowStart = Utils.createSVGElement('marker', {
      id: 'dim-arrow-start',
      viewBox: '0 0 10 10',
      refX: '0', refY: '5',
      markerWidth: arrowSize, markerHeight: arrowSize,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto'
    });
    arrowStart.appendChild(Utils.createSVGElement('path', {
      d: 'M10,0 L0,5 L10,10 Z', fill: Utils.COLORS.blue
    }));
    defs.appendChild(arrowStart);
  }
};
