export type ErrorCode =
  | "CLI_USAGE"
  | "PATH_INVALID"
  | "INPUT_RACE"
  | "INPUT_LIMIT"
  | "DOCUMENT_INVALID"
  | "REF_INVALID"
  | "CAPABILITY_UNSUPPORTED"
  | "CONSUMER_INVALID"
  | "OUTPUT_INVALID"
  | "INTERNAL_ERROR";
export type ExitCode = 0 | 2 | 3;
export type HttpMethod = "get" | "put" | "post" | "delete" | "patch" | "head" | "options" | "trace";
export type RuleId = "ENUM_VALUE_REMOVED" | "OPERATION_REMOVED" | "REQUIRED_PARAMETER_ADDED" | "REQUEST_REQUIRED_PROPERTY_ADDED" | "RESPONSE_REQUIRED_PROPERTY_REMOVED";
export type WarningCode = "IGNORED_SCHEMA_KEYWORD" | "ENUM_DOMAIN_UNBOUNDED" | "IGNORED_OPENAPI_SURFACE" | "IGNORED_PARAMETER_LOCATION" | "NEW_REQUEST_BODY" | "REQUEST_BODY_REQUIRED_CHANGED" | "IGNORED_MEDIA_TYPE";

export interface CompareOptions {
  root: string;
  baseline: string;
  candidate: string;
  outDir: string;
  consumers?: string;
}

export interface Finding {
  ruleId: RuleId;
  method: HttpMethod;
  path: string;
  pointer: string;
  message: string;
  consumerIds: string[];
}

export interface Warning {
  code: WarningCode;
  location: string;
  message: string;
}

export interface Report {
  verdict: "supported-breaking-change-detected" | "no-supported-breaking-change-detected";
  disclaimer: string;
  inputSha256: Record<string, string>;
  supportedRules: readonly RuleId[];
  findings: Finding[];
  warnings: Warning[];
  summary: Record<RuleId, number>;
}

export type CompareResult =
  | { exitCode: 0 | 2; report: Report; errorCode?: undefined }
  | { exitCode: 3; errorCode: ErrorCode; report: undefined };

export class Fail extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export const rules: readonly RuleId[] = [
  "ENUM_VALUE_REMOVED",
  "OPERATION_REMOVED",
  "REQUIRED_PARAMETER_ADDED",
  "REQUEST_REQUIRED_PROPERTY_ADDED",
  "RESPONSE_REQUIRED_PROPERTY_REMOVED",
];

export const methods: readonly HttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
  "trace",
];
export const disclaimer = "No supported breaking changes detected. This is not a general OpenAPI compatibility verdict. Review warnings and supportedRules.";
export const findingDisclaimer = "Supported breaking changes were detected under the listed supported rules. This is not a general OpenAPI compatibility verdict.";
