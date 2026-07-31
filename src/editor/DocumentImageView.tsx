import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { api } from "../lib/api";

interface DocumentImageOptions {
  documentId: string;
}

export function DocumentImageView(props: NodeViewProps) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const assetId = String(props.node.attrs.assetId || "");
  const documentId = String((props.extension.options as DocumentImageOptions).documentId || "");

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setSource(null);
    setFailed(false);
    if (!documentId || !assetId) {
      setFailed(true);
      return;
    }
    void api.editorReadAsset(documentId, assetId).then((asset) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
      setSource(objectUrl);
    }).catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, documentId]);

  const width = String(props.node.attrs.width || "auto").replace(/[^0-9.%a-z-]/gi, "");
  const align = ["left", "center", "right"].includes(String(props.node.attrs.align)) ? String(props.node.attrs.align) : "center";
  return (
    <NodeViewWrapper
      className={`document-image-node ${props.selected ? "is-selected" : ""}`}
      data-align={align}
      data-drag-handle
      role="figure"
      aria-label={String(props.node.attrs.alt || props.node.attrs.title || "Image du document")}
    >
      {source ? (
        <img
          src={source}
          alt={String(props.node.attrs.alt || "")}
          title={String(props.node.attrs.title || "")}
          style={{ width }}
          draggable={false}
        />
      ) : failed ? (
        <span className="document-image-error" role="status">Image locale indisponible</span>
      ) : (
        <span className="document-image-loading" role="status">Chargement de l’image…</span>
      )}
    </NodeViewWrapper>
  );
}
