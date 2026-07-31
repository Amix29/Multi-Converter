export function InteractiveBackground() {
  return (
    <canvas
      className="interactive-background"
      data-interactive-background="true"
      width={1920}
      height={1080}
      aria-hidden="true"
    />
  );
}
