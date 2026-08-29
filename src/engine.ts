import { addWarning, createRunContext, isRecord, type JsonValue, type LoadedDocument, type RunContext } from "./context.js";
import { loadDocument } from "./documents.js";
import { cleanupReservedOutput, prepareRoot, publishFile, reserveOutputDirectory } from "./files.js";
import type { FileSystem, ReservedDirectory } from "./files.js";
import { Fail, disclaimer, findingDisclaimer, methods, rules } from "./model.js";
import type { CompareOptions, CompareResult, Finding, HttpMethod, Report, RuleId } from "./model.js";
import { compareText as sort, pointerToken as ptr, renderHtml } from "./report.js";
import { resolveNode, type ResolvedNode } from "./resolver.js";

type JsonRecord = { [key: string]: JsonValue };
type SchemaSide = "req" | "res";
interface ParameterEntry {
  parameter: JsonRecord;
  pointer: string;
  document: LoadedDocument;
}

function jsonRecord(value: JsonValue | undefined): JsonRecord | undefined {
  return value !== undefined && isRecord(value) ? value : undefined;
}

function addFinding(findings: Finding[], ruleId: RuleId, method: HttpMethod, path: string, pointer: string, message: string): void {
  findings.push({ ruleId, method, path, pointer, message, consumerIds: [] });
}

async function schema(value: JsonValue | undefined, context: RunContext, document: LoadedDocument, location: string, depth = 0): Promise<ResolvedNode | undefined> {
  if (value === undefined) return undefined;
  if (depth > 32) throw new Fail("INPUT_LIMIT");
  const resolved = await resolveNode(value, context, document);
  if (!isRecord(resolved.value)) throw new Fail("CAPABILITY_UNSUPPORTED");
  for (const key of Object.keys(resolved.value)) {
    if (["type", "properties", "required", "items", "readOnly", "writeOnly", "enum", "$ref"].includes(key)) continue;
    if (["title", "description", "example", "examples", "deprecated", "format"].includes(key)) {
      addWarning(context, "IGNORED_SCHEMA_KEYWORD", `${location}/${ptr(key)}`, `ignored schema keyword: ${key}`);
      continue;
    }
    throw new Fail("CAPABILITY_UNSUPPORTED");
  }
  const enumValues = resolved.value.enum;
  if (enumValues !== undefined && (!Array.isArray(enumValues) || enumValues.some((entry) => typeof entry !== "string") || new Set(enumValues).size !== enumValues.length)) throw new Fail("CAPABILITY_UNSUPPORTED");
  const type = resolved.value.type;
  if (type !== undefined && (typeof type !== "string" || !["object", "array", "string", "number", "integer", "boolean"].includes(type))) throw new Fail("CAPABILITY_UNSUPPORTED");
  const required = resolved.value.required;
  if (required !== undefined && (!Array.isArray(required) || required.some((entry) => typeof entry !== "string") || new Set(required).size !== required.length)) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (resolved.value.readOnly !== undefined && typeof resolved.value.readOnly !== "boolean") throw new Fail("CAPABILITY_UNSUPPORTED");
  if (resolved.value.writeOnly !== undefined && typeof resolved.value.writeOnly !== "boolean") throw new Fail("CAPABILITY_UNSUPPORTED");
  if (resolved.value.properties !== undefined && !isRecord(resolved.value.properties)) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (resolved.value.items !== undefined && !isRecord(resolved.value.items)) throw new Fail("CAPABILITY_UNSUPPORTED");
  return resolved;
}

async function validateSchemaTree(value: JsonValue | undefined, context: RunContext, document: LoadedDocument, location: string, depth = 0): Promise<void> {
  const resolved = await schema(value, context, document, location, depth);
  if (!resolved) return;
  const current = resolved.value as JsonRecord;
  const properties = jsonRecord(current.properties);
  if (properties) for (const key of Object.keys(properties)) await validateSchemaTree(properties[key], context, resolved.document, `${location}/properties/${ptr(key)}`, depth + 1);
  if (current.items !== undefined) await validateSchemaTree(current.items, context, resolved.document, `${location}/items`, depth + 1);
}

function sameStringSet(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.some((value) => typeof value !== "string") || right.some((value) => typeof value !== "string")) return false;
  return left.length === right.length && left.every((value) => right.includes(value));
}

function stringValues(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

async function diffSchema(
  baselineValue: JsonValue | undefined, candidateValue: JsonValue | undefined, context: RunContext,
  baselineDocument: LoadedDocument, candidateDocument: LoadedDocument, location: string,
  method: HttpMethod, path: string, side: SchemaSide, findings: Finding[], depth = 0,
): Promise<void> {
  const baseline = await schema(baselineValue, context, baselineDocument, location, depth);
  const candidate = await schema(candidateValue, context, candidateDocument, location, depth);
  if (!baseline) { await validateSchemaTree(candidateValue, context, candidateDocument, location, depth); return; }
  const oldSchema = baseline.value as JsonRecord;
  if (!candidate) {
    await validateSchemaTree(baselineValue, context, baselineDocument, location, depth);
    if (side === "res") for (const key of stringValues(oldSchema.required)) addFinding(findings, "RESPONSE_REQUIRED_PROPERTY_REMOVED", method, path, `${location}/properties/${ptr(key)}`, `required response property removed: ${key}`);
    return;
  }
  const newSchema = candidate.value as JsonRecord;
  const oldEnum = oldSchema.enum;
  const newEnum = newSchema.enum;
  if (side === "res" && ((oldEnum !== undefined || newEnum !== undefined) && !sameStringSet(oldEnum, newEnum))) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (side === "req" && (oldEnum || newEnum)) {
    const oldValues = Array.isArray(oldEnum) ? oldEnum : undefined;
    const newValues = Array.isArray(newEnum) ? newEnum : undefined;
    if (oldValues && newValues) {
      for (const value of oldValues) {
        if (!newValues.includes(value)) addFinding(findings, "ENUM_VALUE_REMOVED", method, path, `${location}/enum`, `enum value removed: ${value}`);
      }
    } else if (oldValues || newValues) {
      addWarning(context, "ENUM_DOMAIN_UNBOUNDED", location, oldValues ? "request enum domain removed" : "request enum domain added");
    }
  }
  const oldRequired = new Set(stringValues(oldSchema.required));
  const newRequired = new Set(stringValues(newSchema.required));
  const oldProperties = jsonRecord(oldSchema.properties) ?? Object.create(null) as JsonRecord;
  const newProperties = jsonRecord(newSchema.properties) ?? Object.create(null) as JsonRecord;
  for (const key of newRequired) if (side === "req" && !oldRequired.has(key) && jsonRecord(newProperties[key])?.readOnly !== true) addFinding(findings, "REQUEST_REQUIRED_PROPERTY_ADDED", method, path, `${location}/properties/${ptr(key)}`, `required request property added: ${key}`);
  for (const key of oldRequired) if (!newRequired.has(key) && side === "res" && jsonRecord(oldProperties[key])?.writeOnly !== true) addFinding(findings, "RESPONSE_REQUIRED_PROPERTY_REMOVED", method, path, `${location}/properties/${ptr(key)}`, `required response property removed: ${key}`);
  for (const key of Object.keys(oldProperties)) {
    if (Object.hasOwn(newProperties, key)) await diffSchema(oldProperties[key], newProperties[key], context, baseline.document, candidate.document, `${location}/properties/${ptr(key)}`, method, path, side, findings, depth + 1);
    else await validateSchemaTree(oldProperties[key], context, baseline.document, `${location}/properties/${ptr(key)}`, depth + 1);
  }
  for (const key of Object.keys(newProperties)) if (!Object.hasOwn(oldProperties, key)) await validateSchemaTree(newProperties[key], context, candidate.document, `${location}/properties/${ptr(key)}`, depth + 1);
  if (oldSchema.items !== undefined && newSchema.items !== undefined) await diffSchema(oldSchema.items, newSchema.items, context, baseline.document, candidate.document, `${location}/items`, method, path, side, findings, depth + 1);
  else if (oldSchema.items !== undefined) await validateSchemaTree(oldSchema.items, context, baseline.document, `${location}/items`, depth + 1);
  else if (newSchema.items !== undefined) await validateSchemaTree(newSchema.items, context, candidate.document, `${location}/items`, depth + 1);
}

function content(value: JsonValue | undefined): JsonRecord | undefined {
  const record = jsonRecord(value);
  if (!record || record.content === undefined) return undefined;
  if (!isRecord(record.content)) throw new Fail("CAPABILITY_UNSUPPORTED");
  return record.content;
}

function parameterIdentity(parameter: JsonRecord): string | undefined {
  return typeof parameter.name === "string" && typeof parameter.in === "string" ? `${parameter.in}:${parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name}` : undefined;
}

function validateParameter(parameter: JsonValue): JsonRecord {
  rejectsUnsupportedReference(parameter);
  const record = jsonRecord(parameter);
  if (!record || typeof record.name !== "string" || record.name.length === 0 || typeof record.in !== "string" || !["path", "query", "header", "cookie"].includes(record.in)) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (record.required !== undefined && typeof record.required !== "boolean") throw new Fail("CAPABILITY_UNSUPPORTED");
  if (record.content !== undefined) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (record.schema !== undefined && !isRecord(record.schema)) throw new Fail("CAPABILITY_UNSUPPORTED");
  return record;
}

function validateParameters(value: JsonValue | undefined): JsonValue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Fail("CAPABILITY_UNSUPPORTED");
  value.forEach(validateParameter);
  return value;
}

function collectEffectiveParameters(
  pathItem: JsonRecord,
  operation: JsonRecord,
  document: LoadedDocument,
  context: RunContext,
  pathItemBase: string,
  operationBase: string,
  emitWarnings: boolean,
): Map<string, ParameterEntry> {
  const found = new Map<string, ParameterEntry>();
  const add = (value: JsonValue, pointer: string): void => {
    const parameter = jsonRecord(value);
    const key = parameter && parameterIdentity(parameter);
    if (!parameter || !key) return;
    if (parameter.in === "path") {
      if (emitWarnings) addWarning(context, "IGNORED_PARAMETER_LOCATION", pointer, "ignored path parameter");
      return;
    }
    if (!['query', 'header', 'cookie'].includes(parameter.in as string)) throw new Fail("CAPABILITY_UNSUPPORTED");
    found.set(key, { parameter, pointer, document });
  };
  for (const [index, value] of validateParameters(pathItem.parameters).entries()) add(value, `${pathItemBase}/parameters/${index}`);
  for (const [index, value] of validateParameters(operation.parameters).entries()) add(value, `${operationBase}/parameters/${index}`);
  return found;
}

function rejectsUnsupportedReference(value: JsonValue | undefined): void {
  if (isRecord(value) && Object.hasOwn(value, "$ref")) throw new Fail("CAPABILITY_UNSUPPORTED");
}

async function validateOperationSurface(operation: JsonRecord, pathItem: JsonRecord, context: RunContext, document: LoadedDocument, base: string): Promise<void> {
  const parameters = [...validateParameters(pathItem.parameters), ...validateParameters(operation.parameters)];
  for (const [index, parameter] of parameters.entries()) {
    const record = validateParameter(parameter);
    await validateSchemaTree(record.schema, context, document, `${base}/parameters/${index}/schema`);
  }
  rejectsUnsupportedReference(operation.requestBody);
  const requestBody = jsonRecord(operation.requestBody);
  if (operation.requestBody !== undefined && !requestBody) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (requestBody) {
    if (requestBody.required !== undefined && typeof requestBody.required !== "boolean") throw new Fail("CAPABILITY_UNSUPPORTED");
    const requestContent = content(requestBody);
    if (requestContent) for (const [mediaType, media] of Object.entries(requestContent)) {
      const mediaRecord = jsonRecord(media);
      if (!mediaRecord) throw new Fail("CAPABILITY_UNSUPPORTED");
      await validateSchemaTree(mediaRecord.schema, context, document, `${base}/requestBody/content/${ptr(mediaType)}/schema`);
    }
  }
  const responses = jsonRecord(operation.responses);
  if (operation.responses !== undefined && !responses) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (!responses) return;
  for (const [code, response] of Object.entries(responses)) {
    rejectsUnsupportedReference(response);
    const responseRecord = jsonRecord(response);
    if (!responseRecord) throw new Fail("CAPABILITY_UNSUPPORTED");
    const responseContent = content(responseRecord);
    if (responseContent) for (const [mediaType, media] of Object.entries(responseContent)) {
      const mediaRecord = jsonRecord(media);
      if (!mediaRecord) throw new Fail("CAPABILITY_UNSUPPORTED");
      await validateSchemaTree(mediaRecord.schema, context, document, `${base}/responses/${ptr(code)}/content/${ptr(mediaType)}/schema`);
    }
  }
}

async function validateOpenApiSurface(document: LoadedDocument, context: RunContext): Promise<void> {
  const root = jsonRecord(document.value);
  if (!root) throw new Fail("DOCUMENT_INVALID");
  const paths = jsonRecord(root.paths);
  if (root.paths !== undefined && !paths) throw new Fail("CAPABILITY_UNSUPPORTED");
  if (!paths) return;
  for (const path of Object.keys(paths)) {
    const pathValue = paths[path]!;
    if (isRecord(pathValue) && Object.hasOwn(pathValue, "$ref")) continue;
    const pathItem = jsonRecord(pathValue);
    if (!pathItem) throw new Fail("CAPABILITY_UNSUPPORTED");
    for (const method of methods) {
      if (!Object.hasOwn(pathItem, method)) continue;
      const operationValue = pathItem[method]!;
      if (isRecord(operationValue) && Object.hasOwn(operationValue, "$ref")) throw new Fail("CAPABILITY_UNSUPPORTED");
      const operation = jsonRecord(operationValue);
      if (!operation) throw new Fail("CAPABILITY_UNSUPPORTED");
    }
  }
}

function validateResolvedPathItem(value: JsonValue): JsonRecord {
  const pathItem = jsonRecord(value);
  if (!pathItem) throw new Fail("CAPABILITY_UNSUPPORTED");
  for (const method of methods) {
    if (!Object.hasOwn(pathItem, method)) continue;
    const operationValue = pathItem[method]!;
    if (isRecord(operationValue) && Object.hasOwn(operationValue, "$ref")) throw new Fail("CAPABILITY_UNSUPPORTED");
    if (!jsonRecord(operationValue)) throw new Fail("CAPABILITY_UNSUPPORTED");
  }
  return pathItem;
}

function buildReport(context: RunContext, findings: Finding[]): Report {
  findings.forEach((finding) => finding.consumerIds.sort(sort));
  const unique = findings.filter((finding, index, all) => !all.some((other, otherIndex) => otherIndex < index && finding.pointer.startsWith(`${other.pointer}/`) && (other.ruleId === "REQUEST_REQUIRED_PROPERTY_ADDED" || other.ruleId === "RESPONSE_REQUIRED_PROPERTY_REMOVED" || other.ruleId === "OPERATION_REMOVED")));
  unique.sort((left, right) => [left.method, left.path, left.pointer, left.ruleId, left.message].map((value, index) => sort(value, [right.method, right.path, right.pointer, right.ruleId, right.message][index]!)).find(Boolean) ?? 0);
  context.warnings.sort((left, right) => sort(left.location, right.location) || sort(left.code, right.code) || sort(left.message, right.message));
  const summary = Object.fromEntries(rules.map((rule) => [rule, unique.filter((finding) => finding.ruleId === rule).length])) as Record<RuleId, number>;
  return { verdict: unique.length ? "supported-breaking-change-detected" : "no-supported-breaking-change-detected", disclaimer: unique.length ? findingDisclaimer : disclaimer, inputSha256: Object.fromEntries(Object.entries(context.hashes).sort(([left], [right]) => sort(left, right))), supportedRules: rules, findings: unique, warnings: context.warnings, summary };
}

async function annotateConsumers(consumersPath: string | undefined, context: RunContext, baseline: JsonRecord, findings: Finding[]): Promise<void> {
  if (!consumersPath) return;
  const manifest = jsonRecord((await loadDocument(consumersPath, context)).value);
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.consumers)) throw new Fail("CONSUMER_INVALID");
  const paths = jsonRecord(baseline.paths) ?? Object.create(null) as JsonRecord;
  const consumerIds = new Set<string>();
  for (const value of manifest.consumers) {
    const consumer = jsonRecord(value);
    if (!consumer || typeof consumer.id !== "string" || consumer.id.trim().length === 0 || consumerIds.has(consumer.id) || !Array.isArray(consumer.operations)) throw new Fail("CONSUMER_INVALID");
    consumerIds.add(consumer.id);
    for (const value of consumer.operations) {
      const operation = jsonRecord(value);
      const pathItem = operation && typeof operation.path === "string" ? jsonRecord(paths[operation.path]) : undefined;
      if (!operation || typeof operation.method !== "string" || !methods.includes(operation.method as HttpMethod) || typeof operation.path !== "string" || !pathItem || !jsonRecord(pathItem[operation.method])) throw new Fail("CONSUMER_INVALID");
      for (const finding of findings) if (finding.method === operation.method && finding.path === operation.path) finding.consumerIds.push(consumer.id);
    }
  }
}

export async function compareWithFileSystem(options: CompareOptions, fs: FileSystem): Promise<CompareResult> {
  let output: ReservedDirectory | undefined;
  try {
    const root = await prepareRoot(fs, options.root);
    output = await reserveOutputDirectory(fs, root, options.outDir);
    const context = createRunContext(root, fs);
    const baselineDocument = await loadDocument(options.baseline, context);
    const candidateDocument = await loadDocument(options.candidate, context);
    const baseline = jsonRecord(baselineDocument.value);
    const candidate = jsonRecord(candidateDocument.value);
    if (!baseline || !candidate || typeof baseline.openapi !== "string" || typeof candidate.openapi !== "string" || !/^3\.(?:0|1)\.\d+$/u.test(baseline.openapi) || !/^3\.(?:0|1)\.\d+$/u.test(candidate.openapi)) throw new Fail("DOCUMENT_INVALID");
    await validateOpenApiSurface(baselineDocument, context);
    await validateOpenApiSurface(candidateDocument, context);
    const findings: Finding[] = [];
    const oldPaths = jsonRecord(baseline.paths) ?? Object.create(null) as JsonRecord;
    const newPaths = jsonRecord(candidate.paths) ?? Object.create(null) as JsonRecord;
    if (jsonRecord(baseline.info)) addWarning(context, "IGNORED_OPENAPI_SURFACE", "/info", "ignored OpenAPI surface");
    for (const path of Object.keys(oldPaths)) {
      const oldPath = await resolveNode(oldPaths[path]!, context, baselineDocument);
      const candidateValue = newPaths[path];
      const newPath = candidateValue === undefined ? undefined : await resolveNode(candidateValue, context, candidateDocument);
      const oldPathItem = validateResolvedPathItem(oldPath.value);
      const newPathItem = newPath ? validateResolvedPathItem(newPath.value) : undefined;
      for (const method of methods) {
        const oldOperation = jsonRecord(oldPathItem[method]);
        if (!oldOperation) continue;
        const newOperation = newPathItem && jsonRecord(newPathItem[method]);
        const base = `/paths/${ptr(path)}/${method}`;
        await validateOperationSurface(oldOperation, oldPathItem, context, oldPath.document, base);
        if (newOperation) await validateOperationSurface(newOperation, newPathItem!, context, newPath?.document ?? candidateDocument, base);
        if (!newOperation) { addFinding(findings, "OPERATION_REMOVED", method, path, base, "operation removed"); continue; }
        const pathItemBase = `/paths/${ptr(path)}`;
        const oldParameterMap = collectEffectiveParameters(oldPathItem, oldOperation, oldPath.document, context, pathItemBase, base, false);
        const newParameterMap = collectEffectiveParameters(newPathItem!, newOperation, newPath?.document ?? candidateDocument, context, pathItemBase, base, true);
        for (const [key, entry] of newParameterMap) {
          const previous = oldParameterMap.get(key);
          if (entry.parameter.required === true && previous?.parameter.required !== true) addFinding(findings, "REQUIRED_PARAMETER_ADDED", method, path, entry.pointer, `required ${entry.parameter.in} parameter added: ${entry.parameter.name}`);
          await diffSchema(previous?.parameter.schema, entry.parameter.schema, context, previous?.document ?? oldPath.document, entry.document, `${entry.pointer}/schema`, method, path, "req", findings);
        }
        const oldRequestBody = oldOperation.requestBody, newRequestBody = newOperation.requestBody;
        if (oldRequestBody === undefined && newRequestBody !== undefined) addWarning(context, "NEW_REQUEST_BODY", `${base}/requestBody`, "new request body");
        if (isRecord(oldRequestBody) && isRecord(newRequestBody)) {
          if (oldRequestBody.required !== newRequestBody.required) addWarning(context, "REQUEST_BODY_REQUIRED_CHANGED", `${base}/requestBody/required`, "request body required flag changed");
          const oldContent = content(oldRequestBody), newContent = content(newRequestBody);
          if (oldContent && newContent) {
            for (const mediaType of Object.keys(oldContent)) if (mediaType !== "application/json") addWarning(context, "IGNORED_MEDIA_TYPE", `${base}/requestBody/content/${ptr(mediaType)}`, "ignored media type");
            await diffSchema(jsonRecord(oldContent["application/json"])?.schema, jsonRecord(newContent["application/json"])?.schema, context, oldPath.document, newPath?.document ?? candidateDocument, `${base}/requestBody/content/application~1json/schema`, method, path, "req", findings);
          }
        }
        const oldResponses = jsonRecord(oldOperation.responses) ?? Object.create(null) as JsonRecord;
        const newResponses = jsonRecord(newOperation.responses) ?? Object.create(null) as JsonRecord;
        for (const code of Object.keys(oldResponses)) {
          if (!/^\d+$/u.test(code) && code !== "default") continue;
          const oldContent = content(oldResponses[code]), newContent = content(newResponses[code]);
          if (oldContent) for (const mediaType of Object.keys(oldContent)) if (mediaType !== "application/json") addWarning(context, "IGNORED_MEDIA_TYPE", `${base}/responses/${code}/content/${ptr(mediaType)}`, "ignored media type");
          await diffSchema(jsonRecord(oldContent?.["application/json"])?.schema, jsonRecord(newContent?.["application/json"])?.schema, context, oldPath.document, newPath?.document ?? candidateDocument, `${base}/responses/${code}/content/application~1json/schema`, method, path, "res", findings);
        }
      }
    }
    await annotateConsumers(options.consumers, context, baseline, findings);
    const report = buildReport(context, findings);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const html = renderHtml(report);
    await publishFile(fs, output, "report.json", json);
    await publishFile(fs, output, "report.html", html);
    return { exitCode: report.findings.length ? 2 : 0, report };
  } catch (error) {
    await cleanupReservedOutput(fs, output);
    return { exitCode: 3, errorCode: error instanceof Fail ? error.code : "INTERNAL_ERROR", report: undefined };
  }
}
