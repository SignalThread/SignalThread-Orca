import type { CsvSampleParse } from "@/lib/import-wizard/parse-csv-sample";

export type ImportWizardParsedSourceKind = "google_sheets";

export type ImportWizardParsedSource = CsvSampleParse & {
  kind: ImportWizardParsedSourceKind;
  sourceName: string;
  sourceUrl?: string;
};
