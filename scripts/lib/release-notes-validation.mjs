export const disallowedReleaseNoteLanguages = Object.freeze(["fr", "es", "de", "pt", "it"]);
export const requiredReleaseNoteSections = Object.freeze(["Highlights", "Download And Installation", "Validation"]);

export function expectedMacosDmgName(version) {
  return `Multi-Converter_${version}_macos-universal.dmg`;
}

export function releaseNotesBlock(body, language) {
  const pattern = new RegExp(`<!--\\s*mc-release-notes:${language}\\s*-->([\\s\\S]*?)<!--\\s*/mc-release-notes\\s*-->`, "i");
  return String(body ?? "").match(pattern)?.[1]?.trim() ?? null;
}

export function visibleTextOutsideEnglishMarker(body) {
  const rawBody = String(body ?? "");
  const markerPattern = /<!--\s*mc-release-notes:en\s*-->[\s\S]*?<!--\s*\/mc-release-notes\s*-->/i;
  const outside = rawBody
    .replace(markerPattern, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return outside;
}

export function effectiveReleaseNotesBody(body) {
  const rawBody = String(body ?? "").trim();
  return releaseNotesBlock(rawBody, "en") ?? rawBody;
}

export function claimsFullMacosConversionCoverage(body) {
  const normalized = String(body ?? "").replace(/\s+/g, " ");
  return [
    /all\s+macOS\s+conversions\s+(?:pass|passed|work|were\s+tested)/i,
    /all\s+conversions\s+(?:pass|passed|work|were\s+tested)\s+on\s+macOS/i,
    /every\s+macOS\s+conversion\s+(?:pass|passed|works|was\s+tested)/i,
  ].some((pattern) => pattern.test(normalized));
}

export function validateReleaseNotes({ body, version, includeMacos = false, minLength = 1 } = {}) {
  const errors = [];
  const rawBody = String(body ?? "");
  const trimmedBody = rawBody.trim();
  const notesBody = effectiveReleaseNotesBody(trimmedBody);
  const title = `# Multi-Converter v${version}`;
  const macosDmgName = expectedMacosDmgName(version);

  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ""))) {
    errors.push(`Invalid version "${version}". Expected X.Y.Z.`);
  }
  if (!trimmedBody) {
    errors.push("Missing GitHub release notes. Create or edit the release notes directly on GitHub in English, then rerun this workflow.");
    return { ok: false, errors, notesBody: "" };
  }
  if (Number.isNaN(Number(minLength)) || Number(minLength) < 1) {
    errors.push(`Invalid release notes minimum length "${minLength}".`);
  } else if (notesBody.length < Number(minLength)) {
    errors.push("Release notes are missing or unexpectedly short.");
  }

  const englishMarkerCount = [...trimmedBody.matchAll(/<!--\s*mc-release-notes:en\s*-->/gi)].length;
  if (englishMarkerCount > 1) {
    errors.push("Release notes must contain at most one English marker block.");
  } else if (englishMarkerCount === 1 && !releaseNotesBlock(trimmedBody, "en")) {
    errors.push("English release notes marker block is not closed correctly.");
  } else if (englishMarkerCount === 1 && visibleTextOutsideEnglishMarker(trimmedBody)) {
    errors.push("Release notes with an English marker block must not contain visible text outside that block.");
  }

  for (const language of disallowedReleaseNoteLanguages) {
    const languageMarker = new RegExp(`mc-release-notes:${language}\\b`, "i");
    if (languageMarker.test(trimmedBody)) {
      errors.push(`Release notes must be published in English only; found disallowed ${language} block.`);
    }
  }

  if (!notesBody.startsWith(title)) {
    errors.push(`GitHub release notes must start with '${title}'.`);
  }
  for (const section of requiredReleaseNoteSections) {
    if (!notesBody.includes(`## ${section}`)) {
      errors.push(`GitHub release notes are missing required section '## ${section}'.`);
    }
  }

  if (!includeMacos) {
    if (notesBody.includes(macosDmgName) || /_macos-universal\.dmg/i.test(notesBody)) {
      errors.push("Release notes mention a macOS DMG, but this workflow run was not started with include_macos=true.");
    }
    return { ok: errors.length === 0, errors, notesBody };
  }

  if (!notesBody.includes(macosDmgName)) {
    errors.push(`macOS release notes must name ${macosDmgName}.`);
  }
  if (!/not\s+Apple-signed/i.test(notesBody) || !/not\s+notarized/i.test(notesBody)) {
    errors.push("Release notes must state that the macOS build is not Apple-signed and not notarized.");
  }
  if (
    !notesBody.includes("System Settings") ||
    !notesBody.includes("Open Anyway") ||
    !notesBody.includes("Privacy & Security") ||
    !/confirm\s+`?Open`?/i.test(notesBody)
  ) {
    errors.push("Release notes must include the macOS System Settings > Privacy & Security > Open Anyway path and confirm Open instruction.");
  }
  if (!/macOS\s+automatic\s+updates\s+are\s+not\s+enabled/i.test(notesBody)) {
    errors.push("Release notes must state that macOS automatic updates are not enabled.");
  }
  const macosDmgVerificationPassed =
    /macOS\s+DMG\s+verification\s+(?:passed|succeeded|completed)/i.test(notesBody) ||
    /verified\s+on\s+macOS/i.test(notesBody);
  const macosDmgVerificationFailed =
    /(?:not|never)\s+verified\s+on\s+macOS/i.test(notesBody) ||
    /macOS\s+DMG\s+verification\s+(?:failed|did\s+not\s+pass|not\s+completed)/i.test(notesBody);
  if (!macosDmgVerificationPassed || macosDmgVerificationFailed) {
    errors.push("Release notes must mention that the macOS DMG was verified on macOS.");
  }
  if (!/Apple\s+Silicon/i.test(notesBody) || !/Intel/i.test(notesBody)) {
    errors.push("Release notes must mention that the macOS DMG was verified for Apple Silicon and Intel.");
  }
  if (claimsFullMacosConversionCoverage(notesBody) && !/macOS\s+Conversion\s+Matrix/i.test(notesBody)) {
    errors.push("Release notes must mention the macOS Conversion Matrix before claiming full macOS conversion coverage.");
  }
  if (claimsFullMacosConversionCoverage(notesBody) && (!/Apple\s+Silicon/i.test(notesBody) || !/Intel/i.test(notesBody))) {
    errors.push("Release notes must mention Apple Silicon and Intel before claiming full macOS conversion coverage.");
  }

  return { ok: errors.length === 0, errors, notesBody };
}
