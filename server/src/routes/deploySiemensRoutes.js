const express = require("express");
const router = express.Router();
const logger = require("../logger");
const { summarizeBody } = require("../logger");
const { getRequestUserId } = require("../requestUser");
const { v4: uuidv4 } = require("uuid");

// Stub (HTE-110): pushing a compiled file to TIA Portal needs a licensed, always-on Windows
// machine running TIA Portal with the Openness add-on enabled, listening for requests like
// this one — infrastructure this project doesn't have yet. Unlike Ignition (already just a
// gateway sitting on the network), there is nothing to POST to. This route exists so the
// request/response contract can be built and tested now, but it never contacts anything and
// always answers 501: it must not be mistaken for a working deploy. Replace the body of the
// try block below with a real Openness call once that server exists.
router.post("/", async (req, res) => {
  const requestId = uuidv4();
  const userId = await getRequestUserId(req);
  const method = req.method;
  const route = req.originalUrl;
  const timestamp = new Date().toISOString();

  logger.info({
    requestId,
    event: "API_REQUEST",
    timestamp,
    method,
    route,
    userId,
    // Solo tamaño y vista previa: el cuerpo puede pesar hasta 10 MB.
    ...summarizeBody(req.body),
  });

  // app.js only parses a body into a string for Content-Type application/xml or text/xml
  // (express.text()'s own `type` list); anything else leaves req.body unparsed or non-string,
  // so this one check also rejects the wrong content type, not just a missing body.
  if (!req.body || typeof req.body !== "string" || req.body.length === 0) {
    logger.warn({
      requestId,
      event: "BAD_REQUEST",
      timestamp,
      method,
      route,
      userId,
      message: "Missing workflow data",
    });
    return res.status(400).json({
      status: "ERROR",
      message: "Bad Request. Missing workflow data",
    });
  }

  logger.warn({
    requestId,
    event: "SIEMENS_DEPLOY_NOT_CONFIGURED",
    timestamp,
    method,
    route,
    userId,
    message:
      "No TIA Portal Openness server is configured; the file was not sent anywhere.",
  });

  res.status(501).json({
    status: "NOT_CONFIGURED",
    message:
      "Siemens deploy isn't available yet: this environment has no TIA Portal Openness " +
      "server to push to (see HTE-110). Download the compiled file and import it into TIA " +
      "Portal by hand, or configure the Openness server before retrying.",
  });
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
