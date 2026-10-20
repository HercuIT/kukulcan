const { XMLParser } = require("fast-xml-parser");

// Contrato del XML que recibe /api/deploy-workflow y que se reenvía a recibirXML en Ignition.
// Vive aparte de la ruta para que la prueba de contrato (supabase/tests/xml-contract.test.mjs) lo
// use sin cargar axios, el logger ni la configuración de Ignition.
function validarWorkflow(xmlString) {
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (tagName, jPath) =>
      jPath.endsWith(".Node") ||
      jPath.endsWith(".Connection") ||
      jPath.endsWith(".Parameter"),
  };

  try {
    const parser = new XMLParser(options);
    const jsonObj = parser.parse(xmlString);

    const workflow = jsonObj.Workflow;
    if (!workflow) {
      return {
        isValid: false,
        message: "The root element <Workflow> was not found.",
      };
    }

    const workflowId = workflow["@_id"];
    if (!workflowId || workflowId.trim() === "") {
      return {
        isValid: false,
        message:
          "The <Workflow> element must have an 'id' attribute and it cannot be empty.",
      };
    }

    const nodes = workflow.Nodes?.Node;
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return {
        isValid: false,
        message: "The XML does not contain a valid list of nodes (<Node>).",
      };
    }

    for (const node of nodes) {
      const nodeType = node["@_type"];
      const nodeName = node["@_name"];
      if (nodeType === "BeginElement" || nodeType === "EndElement") {
        continue;
      }
      if (!node.Parameters?.Parameter) {
        return {
          isValid: false,
          message: `Validation error: Node named '${nodeName}' must have at least one <Parameter> element.`,
        };
      }
      for (const param of node.Parameters.Parameter) {
        const paramName = param["@_name"];
        const paramValue = param["@_value"];
        if (!paramName || paramName.trim() === "") {
          return {
            isValid: false,
            message: `Error in node '${nodeName}': A parameter was found without a 'name' attribute.`,
          };
        }
        if (paramValue === undefined || paramValue.toString().trim() === "") {
          return {
            isValid: false,
            message: `Node '${nodeName}' requires a value for the parameter '${paramName}'.`,
          };
        }
      }
    }

    const connections = workflow.Connections?.Connection;
    if (connections && Array.isArray(connections)) {
      for (const conn of connections) {
        const fromAttr = conn["@_from"];
        const toAttr = conn["@_to"];
        if (!fromAttr || !toAttr) {
          return {
            isValid: false,
            message: `Validation Error: A connection has an incorrect format or is missing 'from'/'to' attributes.`,
          };
        }
      }
    }
    return {
      isValid: true,
      message: "XML validated successfully.",
      workflowId,
    };
  } catch (error) {
    return {
      isValid: false,
      message: `Unexpected error during validation: ${error.message}`,
    };
  }
}

module.exports = { validarWorkflow };
