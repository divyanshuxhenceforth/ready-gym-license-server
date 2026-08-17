const License = require("../models/License");

async function checkLicenseExpiry(license) {

    if (!license) {
        return false;
    }

    /*
    |--------------------------------------------------------------------------
    | Lifetime licenses never expire
    |--------------------------------------------------------------------------
    */

    if (license.plan === "lifetime") {

        if (license.expiresAt !== null) {

            license.expiresAt = null;

            await license.save();

        }

        return false;
    }

    /*
    |--------------------------------------------------------------------------
    | No expiration date
    |--------------------------------------------------------------------------
    */

    if (!license.expiresAt) {
        return false;
    }

    /*
    |--------------------------------------------------------------------------
    | Already expired
    |--------------------------------------------------------------------------
    */

    if (
        new Date() >=
        new Date(license.expiresAt)
    ) {

        if (
            license.status !== "expired"
        ) {

            license.status = "expired";

            /*
            | Revoke existing JWT tokens
            */

            license.tokenVersion += 1;

            await license.save();
        }

        return true;
    }

    return false;
}

module.exports =
    checkLicenseExpiry;