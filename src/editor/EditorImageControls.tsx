import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { t, type LanguageCode } from "../i18n";
import { EditorToolbarButton } from "./EditorToolbarButton";
import { EditorToolbarIcon } from "./EditorToolbarIcons";
import { MAXIMUM_IMAGE_Z_INDEX, MINIMUM_IMAGE_Z_INDEX, safeImageZIndex } from "./imageGeometry";

export function EditorImageControls(props: { editor: Editor; language: LanguageCode }) {
  const { editor, language } = props;
  const attributes = editor.getAttributes("image");
  const selected = editor.isActive("image");
  const selectionPosition = editor.state.selection.from;
  const [keepRatio, setKeepRatio] = useState(true);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  function dimensions() {
    const node = editor.view.nodeDOM(editor.state.selection.from);
    const frame = node instanceof HTMLElement ? node.querySelector<HTMLElement>(".document-image-frame") : null;
    return { width: frame?.offsetWidth ?? 0, height: frame?.offsetHeight ?? 0 };
  }

  useEffect(() => {
    if (!selected) return;
    let frame: HTMLElement | null = null;
    const measure = () => {
      if (!frame) return;
      setWidth((frame.offsetWidth / (96 / 2.54)).toFixed(2));
      setHeight((frame.offsetHeight / (96 / 2.54)).toFixed(2));
    };
    const observer = new ResizeObserver(measure);
    const attachFrame = () => {
      const node = editor.view.nodeDOM(selectionPosition);
      const next = node instanceof HTMLElement ? node.querySelector<HTMLElement>(".document-image-frame") : null;
      if (!next || next === frame) return;
      observer.disconnect();
      frame = next;
      observer.observe(frame);
      measure();
    };
    // React node views and local asset bytes may arrive after selection changes.
    const mutations = new MutationObserver(attachFrame);
    mutations.observe(editor.view.dom, { childList: true, subtree: true });
    attachFrame();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [editor, selected, selectionPosition, attributes.assetId]);

  if (!selected) return null;
  const update = (patch: Record<string, unknown>) => {
    if (Object.entries(patch).every(([key, value]) => attributes[key] === value)) return;
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.updateAttributes("image", patch);
  };
  function deleteImage() {
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.chain().focus().deleteSelection().run();
  }
  const layout = attributes.layoutMode === "floating" ? Number(attributes.zIndex) < 0 ? "behind" : "front" : "flow";

  function commitSize(axis: "width" | "height", draft: string) {
    const value = Number(draft.replace(",", "."));
    if (!Number.isFinite(value) || value < 0.1 || value > 5000) return;
    const size = dimensions();
    const other = axis === "width" ? "height" : "width";
    const ratio = size[axis] > 0 ? size[other] / size[axis] : 1;
    update({ [axis]: `${value}cm`, ...(keepRatio ? { [other]: `${(value * ratio).toFixed(2)}cm` } : {}) });
  }

  return (
    <section className="editor-image-ribbon" role="toolbar" aria-label={t(language, "editor.media.tools")}>
      <div className="editor-image-ribbon-heading"><EditorToolbarIcon name="image" /><strong>{t(language, "editor.imageGroup")}</strong><span>{t(language, "editor.imageHint")}</span></div>
      <div className="editor-image-ribbon-controls">
        <label>{t(language, "editor.imageWidth")}<input inputMode="decimal" value={width} aria-label={t(language, "editor.imageWidth")} onChange={(event) => setWidth(event.target.value)} onBlur={() => commitSize("width", width)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitSize("width", width); } }} /><span>cm</span></label>
        <label>{t(language, "editor.imageHeight")}<input inputMode="decimal" value={height} aria-label={t(language, "editor.imageHeight")} onChange={(event) => setHeight(event.target.value)} onBlur={() => commitSize("height", height)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitSize("height", height); } }} /><span>cm</span></label>
        <label className="editor-image-ratio"><input type="checkbox" checked={keepRatio} onChange={(event) => setKeepRatio(event.target.checked)} />{t(language, "editor.keepImageRatio")}</label>
        <select value={layout} aria-label={t(language, "editor.imagePlacement")} onChange={(event) => update(event.target.value === "flow" ? { layoutMode: "flow", offsetXmm: 0, offsetYmm: 0, zIndex: 0 } : { layoutMode: "floating", zIndex: event.target.value === "behind" ? -1 : 1 })}>
          <option value="flow">{t(language, "editor.media.returnToFlow")}</option>
          <option value="front">{t(language, "editor.media.inFrontOfText")}</option>
          <option value="behind">{t(language, "editor.media.behindText")}</option>
        </select>
        {(["left", "center", "right"] as const).map((align) => <EditorToolbarButton key={align} active={attributes.align === align} label={t(language, `editor.align.${align}`)} onClick={() => update({ align, offsetXmm: 0 })}><EditorToolbarIcon name={align === "left" ? "alignLeft" : align === "right" ? "alignRight" : "alignCenter"} /></EditorToolbarButton>)}
        <EditorToolbarButton label={t(language, "editor.media.sendBack")} onClick={() => update({ layoutMode: "floating", zIndex: MINIMUM_IMAGE_Z_INDEX })}><EditorToolbarIcon name="layerBack" /></EditorToolbarButton>
        <EditorToolbarButton label={t(language, "editor.media.stepBack")} onClick={() => update({ layoutMode: "floating", zIndex: safeImageZIndex(Number(attributes.zIndex) - 1) })}><EditorToolbarIcon name="layerDown" /></EditorToolbarButton>
        <EditorToolbarButton label={t(language, "editor.media.stepForward")} onClick={() => update({ layoutMode: "floating", zIndex: safeImageZIndex(Number(attributes.zIndex) + 1) })}><EditorToolbarIcon name="layerUp" /></EditorToolbarButton>
        <EditorToolbarButton label={t(language, "editor.media.bringFront")} onClick={() => update({ layoutMode: "floating", zIndex: MAXIMUM_IMAGE_Z_INDEX })}><EditorToolbarIcon name="layerFront" /></EditorToolbarButton>
        <EditorToolbarButton label={t(language, "editor.resetImage")} onClick={() => update({ width: "15cm", height: "auto", align: "center", layoutMode: "flow", offsetXmm: 0, offsetYmm: 0, zIndex: 0 })}><EditorToolbarIcon name="reset" /></EditorToolbarButton>
        <EditorToolbarButton label={t(language, "editor.deleteImage")} danger onClick={deleteImage}><EditorToolbarIcon name="trash" /></EditorToolbarButton>
      </div>
    </section>
  );
}
