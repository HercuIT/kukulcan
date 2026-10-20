// The Siemens TIA Portal Openness mock (server/src/mock/opennessMockApp.js): simulates the
// SimaticML and AutomationML/CAx import contract so Siemens XML can be tested before a real
// Openness server exists (HTE-110). Run with: npm run test:node (from the repo root).
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

const importXml = (xml, query = "") =>
  fetch(`${baseUrl}/api/v1/siemens/import${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xml,
  });

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
  test("positive: a valid <Document> block imports and names the object", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      status: "Success",
      importedObjects: ["MyFunctionBlock"],
    });
  });

  test("positive: importOption=Override re-imports an already-imported block", async () => {
    await importXml(simaticBlock("MyFunctionBlock"));
    const res = await importXml(
      simaticBlock("MyFunctionBlock"),
      "?importOption=Override",
    );
    assert.equal(res.status, 200);
  });

  test("negative: missing body gets a 400", async () => {
    const res = await importXml("");
    assert.equal(res.status, 400);
  });

  test("negative: malformed XML gets a 400 with a syntax message", async () => {
    const res = await importXml("<<<");
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /syntax error/);
  });

  test("negative: an unsupported root element gets a 400", async () => {
    const res = await importXml("<Foo/>");
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Unsupported root element/);
  });

  test("negative: <Document> missing <Engineering version> gets a 400", async () => {
    const res = await importXml(
      '<Document><SW.Blocks.CompileUnit><AttributeList><Name>X</Name></AttributeList></SW.Blocks.CompileUnit></Document>',
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Engineering version/);
  });

  test("negative: an unsupported TIA Portal version gets a 400", async () => {
    const res = await importXml(simaticBlock("MyFunctionBlock", "V99"));
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Unsupported TIA Portal version/);
  });

  test("negative: re-importing without Override gets a 400", async () => {
    await importXml(simaticBlock("MyFunctionBlock"));
    const res = await importXml(simaticBlock("MyFunctionBlock"));
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /already exist/);
  });

  test("negative: an invalid importOption gets a 400", async () => {
    const res = await importXml(
      simaticBlock("MyFunctionBlock"),
      "?importOption=Delete",
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /importOption/);
  });

  test("negative: an invalid targetType gets a 400", async () => {
    const res = await importXml(
      simaticBlock("MyFunctionBlock"),
      "?targetType=Nonsense",
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /targetType/);
  });

  test("negative: targetType=HardwareCAx against a <Document> payload gets a 400", async () => {
    const res = await importXml(
      simaticBlock("MyFunctionBlock"),
      "?targetType=HardwareCAx",
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /doesn't match/);
  });

  test("negative: a <Document> with no SW.Blocks.* object gets a 400", async () => {
    const res = await importXml('<Document><Engineering version="V16"/></Document>');
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /No SW\.Blocks/);
  });

  test("edge: several SW.Blocks.* objects in one <Document> all import", async () => {
    const xml = `<Document>
      <Engineering version="V16"/>
      <SW.Blocks.CompileUnit ID="0"><AttributeList><Name>A</Name></AttributeList></SW.Blocks.CompileUnit>
      <SW.Blocks.GlobalDB ID="1"><AttributeList><Name>B</Name></AttributeList></SW.Blocks.GlobalDB>
    </Document>`;
    const res = await importXml(xml);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).importedObjects, ["A", "B"]);
  });

  test("edge: a block with no <Name> is skipped, and an all-skipped payload is a 400", async () => {
    const xml = `<Document>
      <Engineering version="V16"/>
      <SW.Blocks.CompileUnit ID="0"><AttributeList><ProgrammingLanguage>SCL</ProgrammingLanguage></AttributeList></SW.Blocks.CompileUnit>
    </Document>`;
    const res = await importXml(xml);
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /No SW\.Blocks/);
  });

  test("edge: /reset clears already-imported state", async () => {
    await importXml(simaticBlock("MyFunctionBlock"));
    await fetch(`${baseUrl}/reset`, { method: "POST" });
    const res = await importXml(simaticBlock("MyFunctionBlock"));
    assert.equal(res.status, 200);
  });
});

describe("Siemens Openness mock: AutomationML/CAx (hardware)", () => {
  test("positive: a valid <CAEXFile> imports and names the element", async () => {
    const res = await importXml(caexHardware("ET 200SP station_1"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      status: "Success",
      importedObjects: ["ET 200SP station_1"],
    });
  });

  test("negative: <CAEXFile> missing SchemaVersion gets a 400", async () => {
    const res = await importXml(
      '<CAEXFile><InstanceHierarchy><InternalElement Name="X"/></InstanceHierarchy></CAEXFile>',
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /SchemaVersion/);
  });

  test("negative: a <CAEXFile> with no <InternalElement> gets a 400", async () => {
    const res = await importXml(
      '<CAEXFile SchemaVersion="2.15"><InstanceHierarchy/></CAEXFile>',
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /InternalElement/);
  });

  test("edge: targetType=Block against a <CAEXFile> payload gets a 400", async () => {
    const res = await importXml(
      caexHardware("ET 200SP station_1"),
      "?targetType=Block",
    );
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /doesn't match/);
  });
});
