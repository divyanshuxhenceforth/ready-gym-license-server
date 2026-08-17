require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const licenseRoutes = require("./routes/license");

const adminRoutes =
    require("./routes/admin");

const runLicenseExpiryJob =
    require("./utils/licenseExpiryJob");

const app = express();

app.use(cors());

app.use(express.json());

/*
|--------------------------------------------------------------------------
| Static files
|--------------------------------------------------------------------------
*/

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
*/

app.get("/admin", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "admin.html"
        )
    );
});

app.use(
    "/api/admin",
    adminRoutes
);

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.json({
        success: true,
        message:
            "Ready Gym License Server is running"
    });
});

app.use(
    "/api/license",
    licenseRoutes
);

/*
|--------------------------------------------------------------------------
| Server
|--------------------------------------------------------------------------
*/

const PORT =
    process.env.PORT || 5000;

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {

        console.log(
            "MongoDB connected"
        );

        runLicenseExpiryJob();

        setInterval(
            runLicenseExpiryJob,
            60 * 60 * 1000
        );

        app.listen(
            PORT, "0.0.0.0",
            () => {
                console.log(
                    `License server running on port ${PORT}`
                );
            }
        );

    })
