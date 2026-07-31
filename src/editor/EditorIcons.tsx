export function DocumentSketchIcon() {
  return <svg className="editor-document-sketch" viewBox="0 0 96 116" aria-hidden="true"><path d="M18 5h42l22 22v80H18z"/><path d="M60 5v24h22M34 55h32M34 70h32M34 85h24"/><circle cx="76" cy="101" r="8"/></svg>;
}

export function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3z"/></svg>;
}

export function MiniDocumentIcon(props: { format: string }) {
  return <span className="mini-document-icon" aria-hidden="true"><span>—</span><span>—</span><small>{props.format.slice(0, 4).toUpperCase()}</small></span>;
}
