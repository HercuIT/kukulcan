require("dotenv").config();
const express = require("express");
const router = express.Router();
const axios = require("axios").default;

const GATEWAY_URL = `http://${process.env.IP_IGNITION}:${process.env.PORT_IGNITION}`;

const AUTH = {
  username: process.env.USER_IGNITION,
  password: process.env.PASSWORD_IGNITION,
};

router.get("/", async (req, res) => {
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
    console.error("Error fetching Ignition health:", error.message);
    res
      .status(503)
      .json({ status: "ERROR", message: "Could not reach Ignition Gateway." });
  }
});

module.exports = router;
