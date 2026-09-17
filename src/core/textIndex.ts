/**
 * Flattens the visible text of an element into one string and keeps a map back
 * to the DOM text nodes, so string offsets can become Ranges and vice versa.
 */

export interface TextIndex {
  root: Element;
  text: string;
  nodes: Text[];
  /** starts[i] is the offset in `text` where nodes[i] begins. */
  starts: number[];
}

export interface TextSpan {
  start: number;
  end: number;
}

// Text inside these is page chrome, not message content.
export const DEFAULT_SKIP =
  'button, svg, script, style, textarea, [aria-hidden="true"], .sr-only, [data-chatmarks-ui]';

export function buildTextIndex(root: Element, skip: string = DEFAULT_SKIP): TextIndex {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    if (!textNode.data || isSkipped(textNode, root, skip)) continue;
    nodes.push(textNode);
    starts.push(text.length);
    text += textNode.data;
  }
  return { root, text, nodes, starts };
}

function isSkipped(node: Text, root: Element, skip: string): boolean {
  const hit = node.parentElement?.closest(skip);
  return !!hit && root.contains(hit);
}

export function rangeFromSpan(index: TextIndex, span: TextSpan): Range | null {
  if (span.end <= span.start) return null;
  const start = pointAt(index, span.start, 'start');
  const end = pointAt(index, span.end, 'end');
  if (!start || !end) return null;
  const range = index.root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/** Converts a DOM Range (e.g. the user's selection) to offsets, clipped to the indexed element. */
export function spanFromRange(index: TextIndex, range: Range): TextSpan | null {
  const start = boundaryToOffset(index, range.startContainer, range.startOffset);
  const end = boundaryToOffset(index, range.endContainer, range.endOffset);
  return end > start ? { start, end } : null;
}

// At a boundary between two nodes, a span start belongs to the later node and a span end to the earlier one.
function pointAt(index: TextIndex, offset: number, bias: 'start' | 'end') {
  const { nodes, starts } = index;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const nodeStart = starts[i]!;
    const nodeEnd = nodeStart + node.data.length;
    if (bias === 'start' ? offset < nodeEnd : offset <= nodeEnd) {
      return { node, offset: Math.max(0, offset - nodeStart) };
    }
  }
  return null;
}

function boundaryToOffset(index: TextIndex, container: Node, offset: number): number {
  const { nodes, starts, text } = index;
  if (container.nodeType === Node.TEXT_NODE) {
    const i = nodes.indexOf(container as Text);
    if (i !== -1) return starts[i]! + Math.min(offset, (container as Text).data.length);
  }
  // Boundary is between nodes, inside skipped text, or outside the root: snap to the next indexed node.
  for (let i = 0; i < nodes.length; i++) {
    if (isAtOrAfter(nodes[i]!, container, offset)) return starts[i]!;
  }
  return text.length;
}

function isAtOrAfter(node: Node, container: Node, offset: number): boolean {
  const child = container.nodeType === Node.TEXT_NODE ? null : container.childNodes[offset];
  if (child) {
    return child === node || !!(child.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }
  const position = container.compareDocumentPosition(node);
  return (
    !!(position & Node.DOCUMENT_POSITION_FOLLOWING) &&
    !(position & Node.DOCUMENT_POSITION_CONTAINED_BY)
  );
}
