import type { CSSProperties } from "react";

type ImageSource = {
  srcSet: string;
  type: string;
};

type ImagePreviewProps = {
  alt: string;
  cropBottom?: number;
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  height: number;
  sizes?: string;
  src: string;
  sources?: ImageSource[];
  width: number;
};

export function ImagePreview({
  alt,
  cropBottom = 0,
  cropLeft = 0,
  cropRight = 0,
  cropTop = 0,
  height,
  sizes,
  sources = [],
  src,
  width
}: ImagePreviewProps) {
  const visibleWidth = Math.max(1, width - cropLeft - cropRight);
  const visibleHeight = Math.max(1, height - cropTop - cropBottom);
  const aspectRatio = `${visibleWidth} / ${visibleHeight}`;
  const previewStyle = {
    "--preview-aspect-ratio": aspectRatio,
    "--preview-image-width": `${(width / visibleWidth) * 100}%`,
    "--preview-image-height": `${(height / visibleHeight) * 100}%`,
    "--preview-image-offset-x": `${(-cropLeft / visibleWidth) * 100}%`,
    "--preview-image-offset-y": `${(-cropTop / visibleHeight) * 100}%`
  } as CSSProperties;

  return (
    <button
      type="button"
      className="image-preview-trigger"
      aria-expanded="false"
      aria-haspopup="dialog"
      data-image-preview="true"
      style={previewStyle}
    >
      <picture>
        {sources.map((source) => (
          <source key={source.type} srcSet={source.srcSet} sizes={sizes} type={source.type} />
        ))}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
      </picture>
      <span className="sr-only">Open the enlarged preview of this screenshot</span>
    </button>
  );
}
