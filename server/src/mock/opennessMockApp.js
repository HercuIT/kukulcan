const express = require("express");
const multer = require("multer");
const { XMLParser } = require("fast-xml-parser");
const { v4: uuidv4 } = require("uuid");

// Mock of a REST wrapper around Siemens TIA Portal Openness (Siemens.Engineering.dll), which is
// a local .NET assembly, not an HTTP server itself — see CLAUDE.md -> "Watch out for" and
// HTE-110. There is no real Openness server to test against yet, so this simulates the HTTP
// contract of an ASP.NET Core controller that wraps it: multipart/form-data with a File field,
// TargetType/ImportOption/SwImportOption/CaxImportOption fields, and a
// {Success, Message, ImportedObjectNames, LogFilePath, ExecutionTimeMs} response — matching
// that real controller's wire shape so nothing calling this mock has to change once a real
// Openness-backed service exists on a licensed TIA Portal machine.
//
// IMPORTANT — unverified XML rules: the real Import() calls hand the file to TIA Portal itself,
// which does its own validation; this mock cannot reproduce that. The SimaticML/AutomationML
// tag names and structure checked below (<Document>, <Engineering version>, SW.Blocks.*,
// <CAEXFile>, SchemaVersion, InternalElement) are a best-effort reading of Siemens' public
// documentation, not a verified export from a real TIA Portal project. Passing a fixture through
// this mock proves the code agrees with its own reading of that format — it does NOT prove a
// real TIA Portal would accept the file. Per HTE-110's rollout, get a reference export from the
// actual TIA Portal version being targeted and check it against the rules below before relying
// on this for anything beyond exercising the HTTP contract.
//
// This is a local, in-memory test double only: it never performs a real import and is never
// reachable from production; its "already imported" state resets with the process or a POST to
// /reset.

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
const CAX_IMPORT_OPTIONS = [
  "MoveToParkingLot",
  "RetainTiaDevice",
  "OverwriteTiaDevice",
];
// Matches the real controller's ImportTargetType enum (PlcBlock is its default, value 0).
const SW_TARGET_TYPES = ["PlcBlock", "PlcType", "PlcTagTable"];
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
  const upload = multer({ storage: multer.memoryStorage() });

  // Object names already "imported", keyed by TargetType — lets a second import of the same
  // name without ImportOption=Override reproduce the exception Openness throws for that case.
  let imported = {
    PlcBlock: new Set(),
    PlcType: new Set(),
    PlcTagTable: new Set(),
    HardwareCAx: new Set(),
  };

  app.post("/api/v1/siemens/import", upload.single("File"), (req, res) => {
    const startedAt = Date.now();
    const respond = (status, body) =>
      res
        .status(status)
        .json({ ExecutionTimeMs: Date.now() - startedAt, ...body });

    if (!req.file || req.file.size === 0) {
      return respond(400, {
        Success: false,
        Message: "A non-empty XML file must be uploaded.",
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }

    const targetType = req.body.TargetType || "PlcBlock";
    const importOption = req.body.ImportOption || "None";
    const swImportOption = req.body.SwImportOption || "None";
    const caxImportOption = req.body.CaxImportOption || "MoveToParkingLot";

    if (!TARGET_TYPES.includes(targetType)) {
      return respond(400, {
        Success: false,
        Message: `General Exception: Unsupported import target type '${targetType}'.`,
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }
    if (!IMPORT_OPTIONS.includes(importOption)) {
      return respond(400, {
        Success: false,
        Message: `General Exception: Unsupported ImportOption '${importOption}'.`,
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }
    if (!SW_IMPORT_OPTIONS.includes(swImportOption)) {
      return respond(400, {
        Success: false,
        Message: `General Exception: Unsupported SwImportOption '${swImportOption}'.`,
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }
    if (!CAX_IMPORT_OPTIONS.includes(caxImportOption)) {
      return respond(400, {
        Success: false,
        Message: `General Exception: Unsupported CaxImportOption '${caxImportOption}'.`,
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }

    let parsed;
    try {
      parsed = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
      }).parse(req.file.buffer.toString("utf8"));
    } catch (error) {
      return respond(400, {
        Success: false,
        Message: `Openness Exception: The XML has a syntax error: ${error.message}`,
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }

    const respondWithImport = (names, logFilePath = null) => {
      const already = names.filter((name) => imported[targetType].has(name));
      if (already.length > 0 && importOption !== "Override") {
        return respond(400, {
          Success: false,
          Message: `Openness Exception: Object(s) already exist: ${already.join(", ")}. Retry with ImportOption=Override.`,
          ImportedObjectNames: [],
          LogFilePath: null,
        });
      }
      names.forEach((name) => imported[targetType].add(name));
      return respond(200, {
        Success: true,
        Message: "Successfully imported XML into TIA Portal project.",
        ImportedObjectNames: names,
        LogFilePath: logFilePath,
      });
    };

    if (SW_TARGET_TYPES.includes(targetType)) {
      if (!parsed.Document) {
        return respond(400, {
          Success: false,
          Message: `General Exception: TargetType '${targetType}' expects a SimaticML <Document> payload.`,
          ImportedObjectNames: [],
          LogFilePath: null,
        });
      }
      const version = parsed.Document.Engineering?.["@_version"];
      if (!version) {
        return respond(400, {
          Success: false,
          Message:
            'Openness Exception: <Document> is missing <Engineering version="...">.',
          ImportedObjectNames: [],
          LogFilePath: null,
        });
      }
      if (!SUPPORTED_ENGINEERING_VERSIONS.includes(version)) {
        return respond(400, {
          Success: false,
          Message: `Openness Exception: Unsupported TIA Portal version '${version}'.`,
          ImportedObjectNames: [],
          LogFilePath: null,
        });
      }
      const names = extractSwBlockNames(parsed.Document);
      if (names.length === 0) {
        return respond(400, {
          Success: false,
          Message: "Openness Exception: No SW.Blocks.* object found to import.",
          ImportedObjectNames: [],
          LogFilePath: null,
        });
      }
      return respondWithImport(names);
    }

    // targetType === "HardwareCAx"
    if (!parsed.CAEXFile) {
      return respond(400, {
        Success: false,
        Message:
          "General Exception: TargetType 'HardwareCAx' expects an AutomationML/CAx <CAEXFile> payload.",
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }
    const schemaVersion = parsed.CAEXFile["@_SchemaVersion"];
    if (!schemaVersion) {
      return respond(400, {
        Success: false,
        Message:
          "Openness Exception: <CAEXFile> is missing the SchemaVersion attribute.",
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }
    const names = extractHardwareElementNames(parsed.CAEXFile);
    if (names.length === 0) {
      return respond(400, {
        Success: false,
        Message: "Openness Exception: No <InternalElement> found to import.",
        ImportedObjectNames: [],
        LogFilePath: null,
      });
    }
    return respondWithImport(names, `/tmp/CAx_Import_Log_${uuidv4()}.log`);
  });

  // Mock-only utility: clears "already imported" state between test runs. Never part of the
  // Openness contract itself.
  app.post("/reset", (req, res) => {
    imported = {
      PlcBlock: new Set(),
      PlcType: new Set(),
      PlcTagTable: new Set(),
      HardwareCAx: new Set(),
    };
    res.status(200).json({ Success: true });
  });

  app.use((req, res) => {
    res.status(404).json({ Success: false, Message: "Unknown route." });
  });

  return app;
}

module.exports = { createOpennessMockApp };
