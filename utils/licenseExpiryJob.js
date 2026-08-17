const License =
    require("../models/License");

async function runLicenseExpiryJob() {

    try {

        const now =
            new Date();

        console.log(
            "Running license expiry check:",
            now.toISOString()
        );

        const expiredLicenses =
            await License.find({
                status: {
                    $in: [
                        "active",
                        "inactive"
                    ]
                },

                plan: {
                    $ne: "lifetime"
                },

                expiresAt: {
                    $ne: null,
                    $lte: now
                }
            });

        console.log(
            "Expired licenses found:",
            expiredLicenses.length
        );

        for (
            const license
            of expiredLicenses
        ) {

            license.status =
                "expired";

            license.tokenVersion =
                Number(
                    license.tokenVersion || 0
                ) + 1;

            license.lastCheckedAt =
                now;

            await license.save();

            console.log(
                "Expired license:",
                license.licenseKey
            );
        }

    } catch (error) {

        console.error(
            "LICENSE EXPIRY JOB ERROR:"
        );

        console.error(error);

    }
}

module.exports =
    runLicenseExpiryJob;