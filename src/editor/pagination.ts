import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface MeasuredBlock {
  pos: number;
  height: number;
  forceBefore?: boolean;
}

export interface PaginationPlan {
  breakPositions: number[];
  pageCount: number;
}

export function planPageBreaks(blocks: MeasuredBlock[], usableHeight: number): PaginationPlan {
  if (!Number.isFinite(usableHeight) || usableHeight <= 0) {
    return { breakPositions: [], pageCount: 1 };
  }
  const breakPositions: number[] = [];
  let occupied = 0;
  let pageCount = 1;

  for (const block of blocks) {
    const height = Math.max(0, block.height);
    if (block.forceBefore && occupied > 0) {
      breakPositions.push(block.pos);
      pageCount += 1;
      occupied = 0;
    } else if (occupied > 0 && occupied + height > usableHeight) {
      breakPositions.push(block.pos);
      pageCount += 1;
      occupied = 0;
    }
    occupied += height;
    if (occupied > usableHeight) {
      const overflowPages = Math.floor((occupied - 1) / usableHeight);
      pageCount += overflowPages;
      occupied -= overflowPages * usableHeight;
    }
  }

  return { breakPositions: Array.from(new Set(breakPositions)), pageCount };
}

const paginationKey = new PluginKey<DecorationSet>("multiConverterPagination");
const paginationMeta = "multiConverterPaginationMeta";

export const Pagination = Extension.create({
  name: "pagination",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous) {
            const positions = transaction.getMeta(paginationMeta) as number[] | undefined;
            if (!positions) return previous.map(transaction.mapping, transaction.doc);
            const decorations = positions
              .filter((position) => position > 0 && position < transaction.doc.content.size)
              .map((position, index) =>
                Decoration.widget(
                  position,
                  () => {
                    const gap = document.createElement("div");
                    gap.className = "editor-page-gap";
                    gap.setAttribute("aria-hidden", "true");
                    gap.dataset.page = String(index + 2);
                    return gap;
                  },
                  { side: -1, key: `page-gap-${position}` },
                ),
              );
            return DecorationSet.create(transaction.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state) ?? null;
          },
        },
        view(view) {
          let frame = 0;
          let lastSignature = "";

          const measure = () => {
            frame = 0;
            const root = view.dom as HTMLElement;
            const styles = getComputedStyle(root);
            const usableHeight = Number.parseFloat(styles.getPropertyValue("--editor-page-content-height")) || 930;
            const blocks: MeasuredBlock[] = [];
            for (const child of Array.from(root.children)) {
              if (!(child instanceof HTMLElement) || child.classList.contains("editor-page-gap")) continue;
              try {
                blocks.push({
                  pos: view.posAtDOM(child, 0),
                  height: child.getBoundingClientRect().height,
                  forceBefore: child.dataset.pageBreak === "true",
                });
              } catch {
                // A transient node view can disappear between measurement and mapping.
              }
            }
            const plan = planPageBreaks(blocks, usableHeight);
            const signature = plan.breakPositions.join(",");
            root.dispatchEvent(
              new CustomEvent("editor-pagination", {
                bubbles: true,
                detail: { pageCount: plan.pageCount },
              }),
            );
            if (signature === lastSignature) return;
            lastSignature = signature;
            view.dispatch(view.state.tr.setMeta(paginationMeta, plan.breakPositions).setMeta("addToHistory", false));
          };

          const schedule = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
          };
          const resizeObserver = new ResizeObserver(schedule);
          resizeObserver.observe(view.dom);
          schedule();

          return {
            update: schedule,
            destroy() {
              if (frame) cancelAnimationFrame(frame);
              resizeObserver.disconnect();
            },
          };
        },
      }),
    ];
  },
});
