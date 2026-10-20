// The Siemens TIA Portal Openness mock (server/src/mock/opennessMockApp.js): simulates the
// wire contract of an ASP.NET Core controller wrapping Openness, so it can be exercised before
// a real Openness-backed service exists (HTE-110). Run with: npm run test:node (repo root).
//
// Reminder (see the long comment atop opennessMockApp.js): the SimaticML/AutomationML tag rules
// these tests check are an unverified reading of Siemens' format, not a confirmed TIA Portal
// export. These tests prove the mock agrees with itself, not that a real TIA Portal would
// accept the file.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createOpennessMockApp } = require("../src/mock/opennessMockApp");

let server;
let baseUrl;

before(async () => {
  const app = createOpennessMockApp();
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  await fetch(`${baseUrl}/reset`, { method: "POST" });
});

const importXml = (xml, fields = {}) => {
  const form = new FormData();
  if (xml !== null) {
    form.append("File", new Blob([xml], { type: "application/xml" }), "block.xml");
  }
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return fetch(`${baseUrl}/api/v1/siemens/import`, {
    method: "POST",
    body: form,
  });
};

const simaticBlock = (name, version = "V16") => `<?xml version="1.0" encoding="utf-8"?>
<Document>
  <Engineering version="${version}"/>
  <SW.Blocks.CompileUnit ID="0">
    <AttributeList>
      <Name>${name}</Name>
      <ProgrammingLanguage>SCL</ProgrammingLanguage>
    </AttributeList>
  </SW.Blocks.CompileUnit>
</Document>`;

const caexHardware = (name, schemaVersion = "2.15") => `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile FileName="HardwareConfig.aml" SchemaVersion="${schemaVersion}">
  <InstanceHierarchy Name="APC Sample Instance Hierarchy">
    <InternalElement ID="3f770698-940d-49c2-9f77-06fc458e1340" Name="${name}"/>
  </InstanceHierarchy>
</CAEXFile>`;

describe("Siemens Openness mock: SimaticML (SW blocks)", () => {
  test("positive: a valid <Document> block imports and names the object (default TargetType=PlcBlock)", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.Success, true);
    assert.deepEqual(json.ImportedObjectNames, ["MyFunctionBlock"]);
    assert.equal(json.LogFilePath, null);
    assert.equal(typeof json.ExecutionTimeMs, "number");
  });

  test("positive: ImportOption=Override re-imports an already-imported block", async () => {
    await importXml(simaticBlock("MyFunctionBlock"));
    const res = await importXml(simaticBlock("MyFunctionBlock"), {
      ImportOption: "Override",
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).Success, true);
  });

  test("negative: a missing file gets a 400, not a 500", async () => {
    const res = await importXml(null);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.Success, false);
    assert.match(json.Message, /non-empty XML file/);
  });

  test("negative: malformed XML gets a 400 with a syntax message", async () => {
    const res = await importXml("<<<");
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /syntax error/);
  });

  test("negative: a <Document> missing <Engineering version> gets a 400", async () => {
    const res = await importXml(
      "<Document><SW.Blocks.CompileUnit><AttributeList><Name>X</Name></AttributeList></SW.Blocks.CompileUnit></Document>",
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /Engineering version/);
  });

  test("negative: an unsupported TIA Portal version gets a 400", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock", "V99"));
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /Unsupported TIA Portal version/);
  });

  test("negative: re-importing without Override gets a 400", async () => {
    await importXml(simaticBlock("MyFunctionBlock"));
    const res = await importXml(simaticBlock("MyFunctionBlock"));
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /already exist/);
  });

  test("negative: an invalid ImportOption gets a 400", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock"), {
      ImportOption: "Delete",
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /ImportOption/);
  });

  test("negative: an invalid TargetType gets a 400", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock"), {
      TargetType: "Nonsense",
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /import target type/);
  });

  test("negative: TargetType=HardwareCAx against a <Document> payload gets a 400", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock"), {
      TargetType: "HardwareCAx",
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /CAEXFile/);
  });

  test("negative: a <Document> with no SW.Blocks.* object gets a 400", async () => {
    const res = await importXml('<Document><Engineering version="V16"/></Document>');
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /No SW\.Blocks/);
  });

  test("edge: several SW.Blocks.* objects in one <Document> all import", async () => {
    const xml = `<Document>
      <Engineering version="V16"/>
      <SW.Blocks.CompileUnit ID="0"><AttributeList><Name>A</Name></AttributeList></SW.Blocks.CompileUnit>
      <SW.Blocks.GlobalDB ID="1"><AttributeList><Name>B</Name></AttributeList></SW.Blocks.GlobalDB>
    </Document>`;
    const res = await importXml(xml);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).ImportedObjectNames, ["A", "B"]);
  });

  test("edge: a block with no <Name> is skipped, and an all-skipped payload is a 400", async () => {
    const xml = `<Document>
      <Engineering version="V16"/>
      <SW.Blocks.CompileUnit ID="0"><AttributeList><ProgrammingLanguage>SCL</ProgrammingLanguage></AttributeList></SW.Blocks.CompileUnit>
    </Document>`;
    const res = await importXml(xml);
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /No SW\.Blocks/);
  });

  test("edge: /reset clears already-imported state", async () => {
    await importXml(simaticBlock("MyFunctionBlock"));
    await fetch(`${baseUrl}/reset`, { method: "POST" });
    const res = await importXml(simaticBlock("MyFunctionBlock"));
    assert.equal(res.status, 200);
  });

  test("edge: TargetType=PlcType and PlcTagTable also accept a <Document> payload", async () => {
    for (const targetType of ["PlcType", "PlcTagTable"]) {
      const res = await importXml(simaticBlock(`Obj_${targetType}`), {
        TargetType: targetType,
      });
      assert.equal(res.status, 200, `expected 200 for TargetType=${targetType}`);
    }
  });
});

describe("Siemens Openness mock: AutomationML/CAx (hardware)", () => {
  test("positive: a valid <CAEXFile> imports, names the element, and sets LogFilePath", async () => {
    const res = await importXml(caexHardware("ET 200SP station_1"), {
      TargetType: "HardwareCAx",
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.Success, true);
    assert.deepEqual(json.ImportedObjectNames, ["ET 200SP station_1"]);
    assert.match(json.LogFilePath, /CAx_Import_Log_.*\.log/);
  });

  test("negative: <CAEXFile> missing SchemaVersion gets a 400", async () => {
    const res = await importXml(
      '<CAEXFile><InstanceHierarchy><InternalElement Name="X"/></InstanceHierarchy></CAEXFile>',
      { TargetType: "HardwareCAx" },
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /SchemaVersion/);
  });

  test("negative: a <CAEXFile> with no <InternalElement> gets a 400", async () => {
    const res = await importXml(
      '<CAEXFile SchemaVersion="2.15"><InstanceHierarchy/></CAEXFile>',
      { TargetType: "HardwareCAx" },
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /InternalElement/);
  });

  test("negative: an invalid CaxImportOption gets a 400", async () => {
    const res = await importXml(caexHardware("ET 200SP station_1"), {
      TargetType: "HardwareCAx",
      CaxImportOption: "Nonsense",
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /CaxImportOption/);
  });

  test("edge: the default TargetType (PlcBlock) against a <CAEXFile> payload gets a 400", async () => {
    const res = await importXml(caexHardware("ET 200SP station_1"));
    assert.equal(res.status, 400);
    assert.match((await res.json()).Message, /SimaticML/);
  });
});
