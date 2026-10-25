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
