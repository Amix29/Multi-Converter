import type { ExportEntryV1, FileDescription } from "./contracts";

function outputFileName(outputPath: string) {
  return outputPath.split(/[\\/]/).filter(Boolean).pop() ?? "conversion";
}

function originDirectories(relativePath: string) {
  const components = relativePath.split("/").filter(Boolean);
  return components.slice(0, -1);
}

function splitFileName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) return { stem: fileName, extension: "" };
  return {
    stem: fileName.slice(0, extensionIndex),
    extension: fileName.slice(extensionIndex),
  };
}

function resolveRelativePathCollision(relativePath: string, occurrence: number) {
  if (occurrence === 1) return relativePath;
  const components = relativePath.split("/");
  const fileName = components.pop() ?? "conversion";
  const { stem, extension } = splitFileName(fileName);
  components.push(`${stem} (${occurrence})${extension}`);
  return components.join("/");
}

/**
 * Builds the internal export plan for one converted result. The Rust boundary
 * performs the authoritative path validation before writing anything.
 */
export function createExportEntry(
  outputPath: string,
  source: Pick<FileDescription, "importOrigin">,
): ExportEntryV1 {
  const outputName = outputFileName(outputPath);
  const origin = source.importOrigin;
  if (!origin || origin.kind !== "folder") {
    return { outputPath, relativePath: outputName, rootId: null };
  }
  return {
    outputPath,
    relativePath: [origin.rootName, ...originDirectories(origin.relativePath), outputName].join("/"),
    rootId: origin.rootId,
  };
}

export function createExportEntries(
  results: ReadonlyArray<{ outputPath: string; source: Pick<FileDescription, "importOrigin"> }>,
) {
  const reserved = new Set<string>();
  return results.map(({ outputPath, source }) => {
    const entry = createExportEntry(outputPath, source);
    const keyPrefix = `${entry.rootId ?? "isolated"}\u0000`;
    let occurrence = 1;
    let relativePath = entry.relativePath;
    while (reserved.has(`${keyPrefix}${relativePath.toLocaleLowerCase("en-US")}`)) {
      occurrence += 1;
      relativePath = resolveRelativePathCollision(entry.relativePath, occurrence);
    }
    reserved.add(`${keyPrefix}${relativePath.toLocaleLowerCase("en-US")}`);
    return {
      ...entry,
      relativePath,
    };
  });
}
