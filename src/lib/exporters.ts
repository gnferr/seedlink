function download(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

/** Reads the preserved drawing buffer; callers gate on a settled frame whose code verified. */
export function exportPng(canvas: HTMLCanvasElement, filename: string): void {
  download(canvas.toDataURL("image/png"), filename);
}

/** An SVG document as a download; the object URL is released once the click has started it. */
export function exportSvg(svg: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The canvas as a PNG file, built synchronously: Safari only shares or copies inside the click that asked. */
export function pngFile(canvas: HTMLCanvasElement, filename: string): File {
  const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (c) => c.charCodeAt(0));
  return new File([bytes], filename, { type: "image/png" });
}
