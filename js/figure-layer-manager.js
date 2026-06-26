// Figure Layer Manager - Controls visibility of annotation layers by figure type
// Three figure layers: plan (平面図専用), route (配線ルート図専用), shared (共通)
class FigureLayerManager {
  constructor() {
    this.layers = {
      plan:   { visible: true, color: '#cc0000', label: '平面図専用' },
      route:  { visible: true, color: '#ff6600', label: '配線ルート図専用' },
      shared: { visible: true, color: '#0066cc', label: '共通' }
    };
  }

  /**
   * Initialize UI bindings for figure layer checkboxes
   */
  init() {
    for (const name of Object.keys(this.layers)) {
      const checkbox = document.getElementById(`fig-layer-${name}`);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.toggle(name, checkbox.checked);
        });
      }
    }
  }

  /**
   * Toggle visibility of all annotations belonging to a figure layer
   */
  toggle(name, visible) {
    this.layers[name].visible = visible;
    const els = document.querySelectorAll(`[data-figure="${name}"]`);
    els.forEach(el => {
      el.style.display = visible ? '' : 'none';
    });
  }

  /**
   * Check if a figure layer is currently visible
   */
  isVisible(name) {
    return this.layers[name]?.visible ?? true;
  }

  /**
   * Get allowed figure values for a given export type
   * @param {'plan'|'route'} figureType
   * @returns {string[]}
   */
  getAllowedFigures(figureType) {
    if (figureType === 'plan') return ['plan', 'shared'];
    if (figureType === 'route') return ['route', 'shared'];
    return ['plan', 'route', 'shared'];
  }
}
