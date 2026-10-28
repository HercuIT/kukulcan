require("dotenv").config();
const express = require("express");
const router = express.Router();
const axios = require("axios").default;
const { v4: uuidv4 } = require("uuid");
const logger = require("../logger");

const GATEWAY_URL = `http://${process.env.IP_IGNITION}:${process.env.PORT_IGNITION}`;

const AUTH = {
  username: process.env.USER_IGNITION,
  password: process.env.PASSWORD_IGNITION,
};

router.get("/", async (req, res) => {
  const requestId = uuidv4();
  try {
    const response = await axios.get(`${GATEWAY_URL}/system/gwinfo`, {
      auth: AUTH,
      timeout: 5000,
    });

    if (
      response.status === 200 &&
      response.data.includes("ContextStatus=RUNNING")
    ) {
      res.status(200).json({
        status: "OK",
        message: "Ignition Gateway is running and reachable.",
      });
    } else {
      res.status(503).json({
        status: "ERROR",
        message: "Gateway is reachable but not in a RUNNING state.",
      });
    }
  } catch (error) {
    // Only the error message, never `error.config` (it carries the gateway's basic-auth
    // credentials), reaches the log or the client.
    logger.error({
      requestId,
      event: "IGNITION_HEALTH_CHECK_FAILED",
      route: req.originalUrl,
      message: `Could not reach Ignition Gateway at ${GATEWAY_URL}: ${error.message}`,
    });
    res
      .status(503)
      .json({ status: "ERROR", message: "Could not reach Ignition Gateway." });
  }
});

module.exports = router;
