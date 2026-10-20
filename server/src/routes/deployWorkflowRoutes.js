const express = require("express");
const router = express.Router();
// .default: la exportación que describen los tipos de axios (en CommonJS es el mismo objeto).
const axios = require("axios").default;
const { XMLParser } = require("fast-xml-parser");
const logger = require("../logger");
const { summarizeBody } = require("../logger");
const { getRequestUserId } = require("../requestUser");
const { v4: uuidv4 } = require("uuid");
const { validarWorkflow } = require("../validarWorkflow");
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
    // Solo tamaño y vista previa: el cuerpo puede pesar hasta 10 MB y aún no está validado.
    ...summarizeBody(req.body),
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
// Para la prueba de contrato; la ruta lo usa sin cambios.
module.exports.validarWorkflow = validarWorkflow;
