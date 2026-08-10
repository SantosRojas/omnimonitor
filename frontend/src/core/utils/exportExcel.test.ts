import { afterEach, describe, expect, it, vi } from "vitest";
import type * as XLSXType from "xlsx";
import { exportToExcel, type ExcelColumn } from "./exportExcel";

const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn() }));

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof XLSXType>();
  return { ...actual, writeFile };
});

import * as XLSX from "xlsx";

interface SampleRow {
  name: string;
  value: number;
  nullable?: string | null;
}

const ROWS: SampleRow[] = [
  { name: "alpha", value: 12.345 },
  { name: "beta", value: 0, nullable: "extra" },
  { name: "gamma", value: 7, nullable: null },
];

const COLUMNS: ExcelColumn<SampleRow>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Value", value: (r) => r.value },
  { header: "Nullable", value: (r) => r.nullable ?? "" },
];

const FILENAME = "sample-export.xlsx";

describe("exportToExcel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    writeFile.mockReset();
  });

  it("builds a worksheet with header row and mapped body rows", () => {
    const aoaSpy = vi.spyOn(XLSX.utils, "aoa_to_sheet");
    const appendSpy = vi.spyOn(XLSX.utils, "book_append_sheet");

    exportToExcel(ROWS, COLUMNS, FILENAME);

    expect(aoaSpy).toHaveBeenCalledWith([
      ["Name", "Value", "Nullable"],
      ["alpha", 12.345, ""],
      ["beta", 0, "extra"],
      ["gamma", 7, ""],
    ]);
    expect(appendSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), "Data");
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(expect.anything(), FILENAME);
  });

  it("produces a real sheet whose data matches the mapped rows", () => {
    exportToExcel(ROWS, COLUMNS, FILENAME);

    const workbook = writeFile.mock.calls[0]?.[0] as XLSXType.WorkBook;
    const sheetName = workbook.SheetNames[0]!;
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, { header: 1 });

    expect(data).toEqual([
      ["Name", "Value", "Nullable"],
      ["alpha", 12.345, ""],
      ["beta", 0, "extra"],
      ["gamma", 7, ""],
    ]);
  });
});
