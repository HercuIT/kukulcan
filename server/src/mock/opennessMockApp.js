const express = require("express");
const { XMLParser } = require("fast-xml-parser");

// Mock of a REST wrapper around Siemens TIA Portal Openness (Siemens.Engineering.dll), which is
// a local .NET assembly, not an HTTP server itself — see CLAUDE.md -> "Watch out for" and
// HTE-110. There is no real Openness server to test against yet, so this simulates the two XML
// contracts it imports: SimaticML (<Document>, SW.Blocks.* software objects) and
// AutomationML/CAx (<CAEXFile>, hardware). It lets the "siemens" compiler target's XML be
// exercised end to end before any licensed TIA Portal machine exists. This is a local,
// in-memory test double only: it never performs a real import and is never reachable from
// production; its "already imported" state resets with the process or a POST to /reset.

const SUPPORTED_ENGINEERING_VERSIONS = [
  "V14 SP1",
  "V15",
  "V15.1",
  "V16",
  "V17",
  "V18",
  "V19",
];
const IMPORT_OPTIONS = ["None", "Override"];
const SW_IMPORT_OPTIONS = [
  "None",
  "IgnoreStructuralChanges",
  "IgnoreMissingReferencedObjects",
  "IgnoreUnitAttributes",
];
const SW_TARGET_TYPES = ["Block", "Type", "TagTable"];
const TARGET_TYPES = [...SW_TARGET_TYPES, "HardwareCAx"];

function extractSwBlockNames(doc) {
  const blocks = Object.keys(doc)
    .filter((key) => key.startsWith("SW.Blocks."))
    .flatMap((key) => (Array.isArray(doc[key]) ? doc[key] : [doc[key]]));
  return blocks
    .map((block) => block?.AttributeList?.Name)
    .filter((name) => typeof name === "string" && name.length > 0);
}

function extractHardwareElementNames(caexFile) {
  const elements = caexFile?.InstanceHierarchy?.InternalElement;
  if (!elements) return [];
  const list = Array.isArray(elements) ? elements : [elements];
  return list
    .map((el) => el?.["@_Name"])
    .filter((name) => typeof name === "string" && name.length > 0);
}

function createOpennessMockApp() {
  const app = express();
  app.use(
    express.text({ type: ["application/xml", "text/xml"], limit: "10mb" }),
  );

  // Object names already "imported", keyed by targetType — lets a second import of the same
  // name without importOption=Override reproduce the exception Openness throws for that case.
  let imported = {
    Block: new Set(),
    Type: new Set(),
    TagTable: new Set(),
    HardwareCAx: new Set(),
  };

  app.post("/api/v1/siemens/import", (req, res) => {
    // Query values are always strings here: the mock's own callers only ever send one value per
    // key, never repeat a key, so the string[]/ParsedQs cases req.query's type allows don't occur.
    const targetType = /** @type {string | undefined} */ (req.query.targetType);
    const importOption = /** @type {string} */ (
      req.query.importOption || "None"
    );
    const swImportOption = /** @type {string} */ (
      req.query.swImportOption || "None"
    );

    if (!req.body || typeof req.body !== "string" || req.body.length === 0) {
      return res
        .status(400)
        .json({ status: "Error", message: "Missing XML body." });
    }
    if (targetType && !TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({
        status: "Error",
        message: `Unsupported targetType '${targetType}'. Expected one of ${TARGET_TYPES.join(", ")}.`,
      });
    }
    if (!IMPORT_OPTIONS.includes(importOption)) {
      return res.status(400).json({
        status: "Error",
        message: `Unsupported importOption '${importOption}'. Expected one of ${IMPORT_OPTIONS.join(", ")}.`,
      });
    }
    if (!SW_IMPORT_OPTIONS.includes(swImportOption)) {
      return res.status(400).json({
        status: "Error",
        message: `Unsupported swImportOption '${swImportOption}'. Expected one of ${SW_IMPORT_OPTIONS.join(", ")}.`,
      });
    }

    let parsed;
    try {
      parsed = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
      }).parse(req.body);
    } catch (error) {
      return res.status(400).json({
        status: "Error",
        message: `The XML has a syntax error: ${error.message}`,
      });
    }

    const respondWithImport = (resolvedType, names) => {
      const already = names.filter((name) => imported[resolvedType].has(name));
      if (already.length > 0 && importOption !== "Override") {
        return res.status(400).json({
          status: "Error",
          message: `Object(s) already exist: ${already.join(", ")}. Retry with importOption=Override.`,
        });
      }
      names.forEach((name) => imported[resolvedType].add(name));
      return res
        .status(200)
        .json({ status: "Success", importedObjects: names });
    };

    if (parsed.Document) {
      const resolvedType = targetType || "Block";
      if (!SW_TARGET_TYPES.includes(resolvedType)) {
        return res.status(400).json({
          status: "Error",
          message: `targetType '${resolvedType}' doesn't match a SimaticML <Document> payload.`,
        });
      }
      const version = parsed.Document.Engineering?.["@_version"];
      if (!version) {
        return res.status(400).json({
          status: "Error",
          message: '<Document> is missing <Engineering version="...">.',
        });
      }
      if (!SUPPORTED_ENGINEERING_VERSIONS.includes(version)) {
        return res.status(400).json({
          status: "Error",
          message: `Unsupported TIA Portal version '${version}'. Expected one of ${SUPPORTED_ENGINEERING_VERSIONS.join(", ")}.`,
        });
      }
      const names = extractSwBlockNames(parsed.Document);
      if (names.length === 0) {
        return res.status(400).json({
          status: "Error",
          message: "No SW.Blocks.* object found to import.",
        });
      }
      return respondWithImport(resolvedType, names);
    }

    if (parsed.CAEXFile) {
      const resolvedType = targetType || "HardwareCAx";
      if (resolvedType !== "HardwareCAx") {
        return res.status(400).json({
          status: "Error",
          message: `targetType '${resolvedType}' doesn't match an AutomationML/CAx <CAEXFile> payload.`,
        });
      }
      const schemaVersion = parsed.CAEXFile["@_SchemaVersion"];
      if (!schemaVersion) {
        return res.status(400).json({
          status: "Error",
          message: "<CAEXFile> is missing the SchemaVersion attribute.",
        });
      }
      const names = extractHardwareElementNames(parsed.CAEXFile);
      if (names.length === 0) {
        return res.status(400).json({
          status: "Error",
          message: "No <InternalElement> found to import.",
        });
      }
      return respondWithImport(resolvedType, names);
    }

    return res.status(400).json({
      status: "Error",
      message:
        "Unsupported root element. Expected <Document> (SimaticML) or <CAEXFile> (AutomationML/CAx).",
    });
  });

  // Mock-only utility: clears "already imported" state between test runs. Never part of the
  // Openness contract itself.
  app.post("/reset", (req, res) => {
    imported = {
      Block: new Set(),
      Type: new Set(),
      TagTable: new Set(),
      HardwareCAx: new Set(),
    };
    res.status(200).json({ status: "OK" });
  });

  app.use((req, res) => {
    res.status(404).json({ status: "Error", message: "Unknown route." });
  });

  return app;
}

module.exports = { createOpennessMockApp };
