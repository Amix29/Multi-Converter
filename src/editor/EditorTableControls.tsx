import type { Editor } from "@tiptap/react";
import { t, type LanguageCode } from "../i18n";
import { EditorToolbarButton } from "./EditorToolbarButton";
import { EditorToolbarIcon, type EditorToolbarIconName } from "./EditorToolbarIcons";

interface EditorTableControlsProps {
  editor: Editor;
  language: LanguageCode;
}

export function EditorTableControls(props: EditorTableControlsProps) {
  if (!props.editor.isActive("table")) return null;

  const commands: Array<{
    label: Parameters<typeof t>[1];
    icon: EditorToolbarIconName;
    run(): void;
    disabled: boolean;
    danger?: boolean;
  }> = [
    {
      label: "editor.addColumnBefore",
      icon: "columnBefore",
      run: () => props.editor.chain().focus().addColumnBefore().run(),
      disabled: !props.editor.can().addColumnBefore(),
    },
    {
      label: "editor.addColumnAfter",
      icon: "columnAfter",
      run: () => props.editor.chain().focus().addColumnAfter().run(),
      disabled: !props.editor.can().addColumnAfter(),
    },
    {
      label: "editor.deleteColumn",
      icon: "columnDelete",
      run: () => props.editor.chain().focus().deleteColumn().run(),
      disabled: !props.editor.can().deleteColumn(),
    },
    {
      label: "editor.addRowBefore",
      icon: "rowBefore",
      run: () => props.editor.chain().focus().addRowBefore().run(),
      disabled: !props.editor.can().addRowBefore(),
    },
    {
      label: "editor.addRowAfter",
      icon: "rowAfter",
      run: () => props.editor.chain().focus().addRowAfter().run(),
      disabled: !props.editor.can().addRowAfter(),
    },
    {
      label: "editor.deleteRow",
      icon: "rowDelete",
      run: () => props.editor.chain().focus().deleteRow().run(),
      disabled: !props.editor.can().deleteRow(),
    },
    {
      label: "editor.mergeCells",
      icon: "mergeCells",
      run: () => props.editor.chain().focus().mergeCells().run(),
      disabled: !props.editor.can().mergeCells(),
    },
    {
      label: "editor.splitCell",
      icon: "splitCell",
      run: () => props.editor.chain().focus().splitCell().run(),
      disabled: !props.editor.can().splitCell(),
    },
    {
      label: "editor.deleteTable",
      icon: "trash",
      run: () => props.editor.chain().focus().deleteTable().run(),
      disabled: !props.editor.can().deleteTable(),
      danger: true,
    },
  ];

  return (
    <div
      className="toolbar-group toolbar-table-context"
      role="group"
      aria-label={t(props.language, "editor.tableTools")}
    >
      <span className="toolbar-context-label">{t(props.language, "editor.tableTools")}</span>
      {commands.map((command) => (
        <EditorToolbarButton
          key={command.label}
          label={t(props.language, command.label)}
          onClick={command.run}
          disabled={command.disabled}
          danger={command.danger}
        >
          <EditorToolbarIcon name={command.icon} />
        </EditorToolbarButton>
      ))}
    </div>
  );
}
