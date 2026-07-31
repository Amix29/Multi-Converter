function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5.1 10.7 4v7.4H3V5.1Zm8.8-1.2L21 2.6v8.8h-9.2V3.9ZM3 12.6h7.7V20L3 18.9v-6.3Zm8.8 0H21v8.8l-9.2-1.3v-7.5Z" />
    </svg>
  );
}

export function LatestRelease({ apiUrl, releasesUrl }: { apiUrl: string; releasesUrl: string }) {
  return (
    <aside
      className="latest-release"
      aria-live="polite"
      data-latest-release="true"
      data-api-url={apiUrl}
      data-releases-url={releasesUrl}
    >
      <span>Latest version</span>
      <strong data-release-name="true">Checking latest release</strong>
      <p data-release-title="true">Reading the current GitHub release tag...</p>
      <p data-release-date="true">Reading the latest version from GitHub...</p>
      <p data-release-asset="true" hidden />
      <a href={releasesUrl} target="_blank" rel="noreferrer" data-release-link="true">
        Open releases
      </a>
    </aside>
  );
}

export function VersionBadge({ apiUrl, releasesUrl }: { apiUrl: string; releasesUrl: string }) {
  return (
    <a
      className="version-badge"
      href={releasesUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the latest Multi-Converter release"
      aria-live="polite"
      data-latest-version="true"
      data-api-url={apiUrl}
      data-releases-url={releasesUrl}
    >
      <span data-version-state="true">Latest</span>
      <strong data-version-label="true">...</strong>
    </a>
  );
}

export function WindowsDownloadButton({
  apiUrl,
  className = "btn primary",
  releasesUrl
}: {
  apiUrl: string;
  className?: string;
  releasesUrl: string;
}) {
  return (
    <a
      className={`${className} windows-download`}
      href={releasesUrl}
      target="_blank"
      rel="noreferrer"
      aria-busy="true"
      data-windows-download="true"
      data-api-url={apiUrl}
      data-releases-url={releasesUrl}
    >
      <WindowsIcon />
      <span data-download-label="true">Download for Windows</span>
    </a>
  );
}
