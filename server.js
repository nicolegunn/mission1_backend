const express = require("express");
const multer = require("multer");
const axios = require("axios");
const cors = require("cors");
const mysql = require("mysql2");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4001;

app.use(
  cors({
    origin: "https://red-mud-0cb8e9600.5.azurestaticapps.net",
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type",
  })
);
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { ca: fs.readFileSync("./DigiCertGlobalRootCA.crt.pem") },
});

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    // Log the incoming file details
    console.log("Received file:", req.file);

    // Call Azure to get car body type
    const bodyTypeResponse = await axios.post(
      `${process.env.VISION_ENDPOINT}${process.env.BODY_TYPE_PROJECT_ID}/classify/iterations/body_type/image`,
      req.file.buffer,
      {
        headers: {
          "Content-Type": "application/octet-stream",
          "Prediction-Key": process.env.PREDICTION_KEY,
        },
      }
    );

    const bodyType = bodyTypeResponse.data.predictions[0].tagName;
    const bodyTypeConfidence = Math.round(
      bodyTypeResponse.data.predictions[0].probability * 100
    );

    // Log the response for debugging
    console.log("Body type response:", bodyType);

    // Call Azure to get car make
    const carMakeResponse = await axios.post(
      `${process.env.VISION_ENDPOINT}${process.env.MAKE_PROJECT_ID}/classify/iterations/make/image`,
      req.file.buffer,
      {
        headers: {
          "Content-Type": "application/octet-stream",
          "Prediction-Key": process.env.PREDICTION_KEY,
        },
      }
    );

    const carMake = carMakeResponse.data.predictions[0].tagName;
    const carMakeConfidence = Math.round(
      carMakeResponse.data.predictions[0].probability * 100
    );

    // Log the response for debugging
    console.log("Car make response:", carMake);

    // Combine the results from both requests
    const combinedData = {
      bodyType: bodyType,
      bodyTypeConfidence: bodyTypeConfidence,
      carMake: carMake,
      carMakeConfidence: carMakeConfidence,
    };

    // Send the combined data back to the front end
    res.json(combinedData);
  } catch (error) {
    console.error("Error analyzing image:", error);

    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);
    }

    res.json({ error: "Failed to analyze image" });
  }
});

app.post("/calculate", async (req, res) => {
  try {
    const { bodyType, make } = req.body;
    console.log("post received");
    console.log(bodyType);
    console.log(make);

    const [makeResults] = await pool
      .promise()
      .query("SELECT multiple FROM make WHERE make = ?", [make]);
    const [bodyTypeResults] = await pool
      .promise()
      .query("SELECT premium FROM body_type WHERE body_type = ?", [bodyType]);

    if (makeResults.length === 0 || bodyTypeResults.length === 0) {
      return res
        .status(404)
        .json({ error: "Make or body type not found in database" });
    }

    const multiple = parseFloat(makeResults[0].multiple);
    const base_premium = parseFloat(bodyTypeResults[0].premium);

    // Combine the results from both requests
    const combinedData = {
      base_premium: base_premium,
      multiple: multiple,
    };

    // Send the combined data back to the front end
    res.json(combinedData);
  } catch (error) {
    console.error("Error sending premium data:", error);

    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);
    }

    res.json({ error: "something went wrong..." });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
