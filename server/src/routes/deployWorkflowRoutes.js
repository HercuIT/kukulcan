const express = require("express");
const router = express.Router();
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const logger = require("../logger");
const { getRequestUserId } = require("../requestUser");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const GATEWAY_URL = `http://${process.env.IP_IGNITION}:${process.env.PORT_IGNITION}`;
const AUTH = {
  username: process.env.USER_IGNITION,
  password: process.env.PASSWORD_IGNITION,
};

async function enviarXmlAIgnition(xmlData) {
  try {
    const urlIgnition = `${GATEWAY_URL}/system/webdev/${process.env.PROJECT_NAME_IGNITION}/api/recibirXML`;
    const respuestaIgnition = await axios.post(urlIgnition, xmlData, {
      headers: { "Content-Type": "application/xml" },
      auth: AUTH,
      timeout: 5000,
    });
    const data = respuestaIgnition.data;

    if (data.message === "The file already exists in the destination folder.") {
      logger.warn({
        event: "IGNITION_FILE_EXISTS",
        timestamp: new Date().toISOString(),
        message: data.message,
        filename: data.filename,
      });
      return {
        success: false,
        error: data.message + " File name: " + data.filename,
      };
    } else if (data.status === "ERROR") {
      logger.error({
        event: "IGNITION_ERROR",
        timestamp: new Date().toISOString(),
        message: data.message,
      });
      return { success: false, error: data.message };
    } else {
      logger.info({
        event: "IGNITION_SUCCESS",
        timestamp: new Date().toISOString(),
        message: "XML sent to Ignition successfully.",
        ignitionResponse: data,
      });
      return { success: true, data };
    }
  } catch (error) {
    logger.error({
      event: "IGNITION_EXCEPTION",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

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

router.post("/", async (req, res) => {
  const requestId = uuidv4();
  const userId = await getRequestUserId(req);
  const method = req.method;
  const route = req.originalUrl;
  const timestamp = new Date().toISOString();

  let workflowId = "unknown";
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const jsonObj = parser.parse(req.body);
    workflowId = jsonObj?.Workflow?.["@_id"] || "unknown";
  } catch {
    // XML inválido: la validación de abajo lo reporta.
  }

  logger.info({
    requestId,
    event: "API_REQUEST",
    timestamp,
    method,
    route,
    userId,
    workflowId,
    body: req.body,
  });

  try {
    if (!req.body || typeof req.body !== "string" || req.body.length === 0) {
      logger.warn({
        requestId,
        event: "BAD_REQUEST",
        timestamp,
        method,
        route,
        userId,
        workflowId,
        message: "Missing workflow data",
      });
      return res.status(400).json({
        status: "ERROR",
        message: "Bad Request. Missing workflow data",
      });
    }
    if (!req.is("application/xml") && !req.is("text/xml")) {
      logger.warn({
        requestId,
        event: "UNSUPPORTED_MEDIA_TYPE",
        timestamp,
        method,
        route,
        userId,
        workflowId,
        message: "Unsupported Media Type",
      });
      return res.status(415).json({
        error: "Unsupported Media Type. This endpoint only accepts XML.",
      });
    }

    const xmlStringParaEnviar = req.body;
    const validacion = validarWorkflow(xmlStringParaEnviar);
    workflowId = validacion.workflowId || workflowId;

    if (!validacion.isValid) {
      logger.warn({
        requestId,
        event: "VALIDATION_ERROR",
        timestamp,
        method,
        route,
        userId,
        workflowId,
        message: validacion.message,
      });
      return res.status(400).json({
        status: "ERROR",
        message: "Bad Request. Invalid XML structure.",
        cause: validacion.message,
      });
    }

    logger.info({
      requestId,
      event: "DEPLOY_ATTEMPT",
      timestamp,
      method,
      route,
      userId,
      workflowId,
    });

    const resultado = await enviarXmlAIgnition(xmlStringParaEnviar);

    if (resultado.success) {
      logger.info({
        requestId,
        event: "DEPLOY_SUCCESS",
        timestamp,
        method,
        route,
        workflowId,
        userId,
      });
      res.status(200).json({
        status: "OK",
        message: "Workflow deployed successfully to Ignition.",
      });
    } else {
      logger.error({
        requestId,
        timestamp,
        errorCode: 500,
        message: `Ignition SDK connection failed: ${resultado.error}`,
        stack: resultado.error?.stack || null,
        method,
        route,
        workflowId,
        userId,
      });
      res.status(502).json({
        status: "ERROR",
        message:
          "Failed to send XML to Ignition. Check the status of the ignition server",
        cause: resultado.error,
      });
    }
  } catch (error) {
    logger.error({
      requestId,
      timestamp,
      errorCode: 500,
      message: `Ignition SDK connection failed: ${error.message}`,
      stack: error.stack,
      method,
      route,
      workflowId,
      userId,
    });
    res
      .status(500)
      .json({ error: "Internal Server Error.", cause: error.message });
  }
});

router.all("/", (req, res) => {
  const requestId = uuidv4();
  logger.warn({
    requestId,
    event: "METHOD_NOT_ALLOWED",
    timestamp: new Date().toISOString(),
    method: req.method,
    route: req.originalUrl,
  });
  res.setHeader("Allow", "POST");
  res
    .status(405)
    .json({ error: `Method ${req.method} not allowed. Please use POST.` });
});

module.exports = router;
