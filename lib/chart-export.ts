/** html-to-image copies computed styles, so attribution must be visible while it clones.
 * Restore styles even if capture fails; never mutate chart data or recreate canvases.
 */
export async function withChartAttribution<T>(root: HTMLElement, capture: () => Promise<T>): Promise<T> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.chart-signature, .chart-export-attribution'));
  const previous = nodes.map(node => ({ value: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display') }));
  nodes.forEach(node => node.style.setProperty('display', node.classList.contains('chart-export-attribution') ? 'flex' : 'block', 'important'));
  try {
    return await capture();
  } finally {
    nodes.forEach((node, index) => {
      const { value, priority } = previous[index];
      if (value) node.style.setProperty('display', value, priority);
      else node.style.removeProperty('display');
    });
  }
}
