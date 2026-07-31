import type { CSSProperties } from "react";

export type FormatRow = {
  category: string;
  formats: string;
};

type PreparedFormatRow = Omit<FormatRow, "formats"> & {
  formats: string[];
  normalizedFormats: string[];
};

export function FormatSearchTable({ rows }: { rows: FormatRow[] }) {
  const preparedRows: PreparedFormatRow[] = rows.map((row) => {
    const formats = row.formats.split(",").map((format) => format.trim());

    return {
      ...row,
      formats,
      normalizedFormats: formats.map((format) => format.toLowerCase())
    };
  });

  return (
    <div className="format-search" data-format-search="true" data-search-active="false">
      <label className="search-label" htmlFor="format-search">
        Search a format
      </label>
      <input
        id="format-search"
        type="search"
        data-format-search-input="true"
        placeholder="PDF, MP4, WebP, DOCX..."
        aria-describedby="format-search-count"
      />
      <p id="format-search-count" className="search-count" data-format-search-count="true">
        {rows.length} categories shown
      </p>

      <div className="table-scroll">
        <table className="data-table format-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Recognized formats</th>
            </tr>
          </thead>
          <tbody>
            {preparedRows.map((row) => (
              <tr data-format-row="true" key={row.category}>
                <th scope="row">{row.category}</th>
                <td>
                  <span className="format-chip-list">
                    {row.formats.map((format, index) => {
                      const isOptionalOnSmallScreens = index > 7;

                      return (
                        <span
                          className={["format-chip", isOptionalOnSmallScreens ? "compact-optional" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          data-format-chip="true"
                          data-format-index={index}
                          data-format-normalized={row.normalizedFormats[index]}
                          key={format}
                          style={{ "--format-index": Math.min(index, 10) } as CSSProperties}
                        >
                          {format}
                        </span>
                      );
                    })}
                  </span>
                </td>
              </tr>
            ))}
            <tr data-format-empty-row="true" hidden>
              <td colSpan={2} className="empty-results">
                No format found for this search.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
