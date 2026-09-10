import ExcelJS from 'exceljs';
import type {
  EmployeeFieldCatalogEntry,
  EmployeeListRow,
} from './employees.service';

export const EMPLOYEES_EXPORT_FILENAME = 'employees-export.xlsx';

export async function buildEmployeesExportWorkbook(
  rows: EmployeeListRow[],
  columnKeys: readonly string[],
  catalogFields: EmployeeFieldCatalogEntry[],
): Promise<Buffer> {
  const labelByKey = new Map(
    catalogFields.map((field) => [field.key, field.label]),
  );
  const dataTypeByKey = new Map(
    catalogFields.map((field) => [field.key, field.dataType]),
  );

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Employees');

  worksheet.addRow(columnKeys.map((key) => labelByKey.get(key) ?? key));

  for (const row of rows) {
    worksheet.addRow(
      columnKeys.map((key) =>
        formatExportCellValue(row.values[key], dataTypeByKey.get(key)),
      ),
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function formatExportCellValue(
  value: string | number | null | undefined,
  dataType: EmployeeFieldCatalogEntry['dataType'] | undefined,
): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (dataType === 'number' && typeof value === 'number') {
    return value;
  }

  if (dataType === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
  }

  return value;
}
