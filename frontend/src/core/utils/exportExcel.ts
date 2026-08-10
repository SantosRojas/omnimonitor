import * as XLSX from "xlsx";

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Builds a worksheet from rows/columns and downloads it as an .xlsx file. */
export function exportToExcel<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string,
): void {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) => columns.map((c) => c.value(row) ?? ""));
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, filename);
}
