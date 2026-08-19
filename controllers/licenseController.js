const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const License = require("../models/License");

const generateLicenseKey =
    require("../utils/generateLicenseKey");

const checkLicenseExpiry =
    require("../utils/checkLicenseExpiry");


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/


/**
 * Normalize Shopify store domain.
 */
function normalizeShopDomain(shopDomain) {

    return shopDomain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
}


/**
 * Create signed Ready Gym installation token.
 */
function createInstallationToken(license) {

    return jwt.sign(
        {
            type:
                "readygym_installation",

            licenseId:
                license._id.toString(),

            licenseKey:
                license.licenseKey,

            shopDomain:
                license.shopDomain,

            installationId:
                license.installationId,

            tokenVersion:
                Number(
                    license.tokenVersion || 0
                )
        },

        process.env.JWT_SECRET,

        {
            expiresIn: "30d"
        }
    );
}


/**
 * Extract Bearer token.
 */
function getBearerToken(req) {

    const authHeader =
        req.headers.authorization;

    if (
        !authHeader ||
        !authHeader.startsWith("Bearer ")
    ) {
        return null;
    }

    return authHeader.substring(7);
}


/**
 * Verify Ready Gym installation token.
 */
function verifyInstallationToken(token) {

    if (!token) {
        throw new Error(
            "Installation token is required"
        );
    }

    const decoded =
        jwt.verify(
            token,
            process.env.JWT_SECRET
        );

    if (
        decoded.type !==
        "readygym_installation"
    ) {
        throw new Error(
            "Invalid installation token"
        );
    }

    return decoded;
}


/*
|--------------------------------------------------------------------------
| CHECK LICENSE
|--------------------------------------------------------------------------
*/

exports.checkLicense = async (
    req,
    res
) => {

    try {

        const token =
            getBearerToken(req);


        if (!token) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Authorization token is required"
            });
        }


        let decoded;

        try {

            decoded =
                verifyInstallationToken(
                    token
                );

        } catch (error) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Invalid or expired activation token"
            });
        }


        const license =
            await License.findById(
                decoded.licenseId
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                valid: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | LICENSE KEY MATCH
        |--------------------------------------------------------------------------
        */

        if (
            license.licenseKey !==
            decoded.licenseKey
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "Invalid license token"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | INSTALLATION MATCH
        |--------------------------------------------------------------------------
        */

        if (
            !license.installationId ||
            license.installationId !==
                decoded.installationId
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "Installation mismatch"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REVOKED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "revoked"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License is revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SUSPENDED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "suspended"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License is suspended"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | TOKEN VERSION
        |--------------------------------------------------------------------------
        */

        if (
            Number(
                license.tokenVersion || 0
            ) !==
            Number(
                decoded.tokenVersion || 0
            )
        ) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Activation token has been revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SHOP MATCH
        |--------------------------------------------------------------------------
        */

        if (
            !license.shopDomain ||
            license.shopDomain !==
                decoded.shopDomain
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License is not valid for this store"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | EXPIRATION
        |--------------------------------------------------------------------------
        */

        const isExpired =
            await checkLicenseExpiry(
                license
            );


        if (isExpired) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License has expired"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | STATUS
        |--------------------------------------------------------------------------
        */

        if (
            license.status !==
            "active"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    `License is ${license.status}`
            });
        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE LAST CHECK
        |--------------------------------------------------------------------------
        */

        const now =
            new Date();

        license.lastCheckedAt =
            now;

        license.lastSeenAt =
            now;

        await license.save();


        return res.json({

            success: true,

            valid: true,

            message:
                "License is valid",

            license: {

                themeName:
                    license.themeName,

                plan:
                    license.plan,

                shopDomain:
                    license.shopDomain,

                installationId:
                    license.installationId,

                expiresAt:
                    license.expiresAt

            }

        });

    } catch (error) {

        console.error(
            "Check license error:",
            error
        );

        return res.status(500).json({
            success: false,
            valid: false,
            message:
                "License verification failed"
        });
    }
};


/*
|--------------------------------------------------------------------------
| DEACTIVATE LICENSE FROM SHOPIFY
|--------------------------------------------------------------------------
*/

exports.deactivateLicense = async (
    req,
    res
) => {

    try {

        const token =
            getBearerToken(req);


        if (!token) {

            return res.status(401).json({
                success: false,
                message:
                    "Authorization token is required"
            });
        }


        let decoded;

        try {

            decoded =
                verifyInstallationToken(
                    token
                );

        } catch (error) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid or expired activation token"
            });
        }


        const license =
            await License.findById(
                decoded.licenseId
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | LICENSE KEY
        |--------------------------------------------------------------------------
        */

        if (
            license.licenseKey !==
            decoded.licenseKey
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Invalid license token"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | INSTALLATION
        |--------------------------------------------------------------------------
        */

        if (
            license.installationId !==
            decoded.installationId
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Installation mismatch"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SHOP
        |--------------------------------------------------------------------------
        */

        if (
            license.shopDomain !==
            decoded.shopDomain
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "License store mismatch"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | TOKEN VERSION
        |--------------------------------------------------------------------------
        */

        if (
            Number(
                license.tokenVersion || 0
            ) !==
            Number(
                decoded.tokenVersion || 0
            )
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Activation token has been revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | RELEASE LICENSE
        |--------------------------------------------------------------------------
        */

        license.shopDomain =
            null;

        license.installationId =
            null;

        license.status =
            "inactive";

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;

        license.lastCheckedAt =
            new Date();

        license.lastSeenAt =
            null;


        await license.save();


        return res.json({
            success: true,
            message:
                "License deactivated successfully"
        });

    } catch (error) {

        console.error(
            "Deactivate license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "License deactivation failed"
        });
    }
};


/*
|--------------------------------------------------------------------------
| CREATE LICENSE
|--------------------------------------------------------------------------
*/

exports.createLicense = async (
    req,
    res
) => {

    try {

        let {
            plan = "lifetime",
            themeName = "Ready Gym"
        } = req.body;


        /*
        |--------------------------------------------------------------------------
        | VALIDATE PLAN
        |--------------------------------------------------------------------------
        */

        const allowedPlans = [
            "monthly",
            "yearly",
            "lifetime"
        ];


        if (
            !allowedPlans.includes(
                plan
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid plan"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | EXPIRATION STARTS AT ACTIVATION
        |--------------------------------------------------------------------------
        */

        const expiresAt =
            null;


        /*
        |--------------------------------------------------------------------------
        | GENERATE UNIQUE LICENSE KEY
        |--------------------------------------------------------------------------
        */

        let licenseKey;
        let existingLicense;


        do {

            licenseKey =
                generateLicenseKey();

            existingLicense =
                await License.findOne({
                    licenseKey
                });

        } while (
            existingLicense
        );


        /*
        |--------------------------------------------------------------------------
        | CREATE LICENSE
        |--------------------------------------------------------------------------
        */

        const license =
            await License.create({

                licenseKey,

                shopDomain:
                    null,

                installationId:
                    null,

                themeName:
                    themeName?.trim() ||
                    "Ready Gym",

                status:
                    "inactive",

                plan,

                expiresAt,

                activatedAt:
                    null,

                lastCheckedAt:
                    null,

                lastSeenAt:
                    null,

                lastIntegrityCheckAt:
                    null,

                themeVersion:
                    null,

                tokenVersion:
                    0

            });


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.status(201).json({

            success: true,

            message:
                "License created successfully",

            license: {

                id:
                    license._id,

                licenseKey:
                    license.licenseKey,

                themeName:
                    license.themeName,

                plan:
                    license.plan,

                status:
                    license.status,

                expiresAt:
                    license.expiresAt,

                activatedAt:
                    license.activatedAt

            }

        });

    } catch (error) {

        console.error(
            "Create license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| ACTIVATE LICENSE
|--------------------------------------------------------------------------
*/

exports.activateLicense = async (
    req,
    res
) => {

    try {

        const {
            licenseKey,
            shopDomain
        } = req.body;


        /*
        |--------------------------------------------------------------------------
        | VALIDATE REQUEST
        |--------------------------------------------------------------------------
        */

        if (
            !licenseKey ||
            !shopDomain
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "License key and shop domain are required"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | NORMALIZE
        |--------------------------------------------------------------------------
        */

        const normalizedShop =
            normalizeShopDomain(
                shopDomain
            );

        const normalizedKey =
            licenseKey.trim();


        /*
        |--------------------------------------------------------------------------
        | FIND LICENSE
        |--------------------------------------------------------------------------
        */

        const license =
            await License.findOne({
                licenseKey:
                    normalizedKey
            });


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REVOKED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "revoked"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "License is revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SUSPENDED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "suspended"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "License is suspended"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | ALREADY ACTIVE
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "active"
        ) {

            if (
                license.shopDomain ===
                normalizedShop
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "License is already active on this store"
                });
            }


            return res.status(403).json({
                success: false,
                message:
                    "License is already activated on another store"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | ONLY INACTIVE LICENSES CAN ACTIVATE
        |--------------------------------------------------------------------------
        */

        if (
            license.status !==
            "inactive"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    `License is ${license.status}`
            });
        }


        /*
        |--------------------------------------------------------------------------
        | CHECK WHETHER STORE ALREADY HAS LICENSE
        |--------------------------------------------------------------------------
        */

        const existingLicense =
            await License.findOne({
                shopDomain:
                    normalizedShop,

                licenseKey: {
                    $ne:
                        normalizedKey
                },

                status: {
                    $in: [
                        "active",
                        "suspended"
                    ]
                }
            });


        if (
            existingLicense
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "This store already has another license activated"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | GENERATE INSTALLATION ID
        |--------------------------------------------------------------------------
        */

        const installationId =
            `INST-${crypto
                .randomBytes(8)
                .toString("hex")
                .toUpperCase()}`;


        /*
        |--------------------------------------------------------------------------
        | START PLAN
        |--------------------------------------------------------------------------
        */

        const activationDate =
            new Date();

        let expiresAt =
            null;


        /*
        |--------------------------------------------------------------------------
        | MONTHLY
        |--------------------------------------------------------------------------
        */

        if (
            license.plan ===
            "monthly"
        ) {

            expiresAt =
                new Date(
                    activationDate
                );

            expiresAt.setMonth(
                expiresAt.getMonth() +
                1
            );
        }


        /*
        |--------------------------------------------------------------------------
        | YEARLY
        |--------------------------------------------------------------------------
        */

        else if (
            license.plan ===
            "yearly"
        ) {

            expiresAt =
                new Date(
                    activationDate
                );

            expiresAt.setFullYear(
                expiresAt.getFullYear() +
                1
            );
        }


        /*
        |--------------------------------------------------------------------------
        | LIFETIME
        |--------------------------------------------------------------------------
        */

        else if (
            license.plan ===
            "lifetime"
        ) {

            expiresAt =
                null;
        }


        /*
        |--------------------------------------------------------------------------
        | ACTIVATE
        |--------------------------------------------------------------------------
        */

        license.shopDomain =
            normalizedShop;

        license.installationId =
            installationId;

        license.status =
            "active";

        license.activatedAt =
            activationDate;

        license.expiresAt =
            expiresAt;

        license.lastCheckedAt =
            activationDate;

        license.lastSeenAt =
            activationDate;

        license.lastIntegrityCheckAt =
            null;

        license.themeVersion =
            null;

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;


        await license.save();


        /*
        |--------------------------------------------------------------------------
        | CREATE SIGNED INSTALLATION TOKEN
        |--------------------------------------------------------------------------
        */

        const token =
            createInstallationToken(
                license
            );


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            message:
                "License activated successfully",

            license: {

                themeName:
                    license.themeName,

                plan:
                    license.plan,

                shopDomain:
                    license.shopDomain,

                installationId:
                    license.installationId,

                activatedAt:
                    license.activatedAt,

                expiresAt:
                    license.expiresAt

            },

            token

        });

    } catch (error) {

        console.error(
            "Activate license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "License activation failed"
        });
    }
};


/*
|--------------------------------------------------------------------------
| GET ALL LICENSES
|--------------------------------------------------------------------------
*/

exports.getLicenses = async (
    req,
    res
) => {

    try {

        const licenses =
            await License.find()
                .sort({
                    createdAt: -1
                })
                .lean();


        return res.json({

            success: true,

            count:
                licenses.length,

            licenses

        });

    } catch (error) {

        console.error(
            "Get licenses error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch licenses"
        });
    }
};


/*
|--------------------------------------------------------------------------
| SUSPEND LICENSE
|--------------------------------------------------------------------------
*/

exports.suspendLicense = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        const license =
            await License.findById(
                id
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        license.status =
            "suspended";


        /*
        |--------------------------------------------------------------------------
        | Invalidate all existing tokens
        |--------------------------------------------------------------------------
        */

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;


        license.lastCheckedAt =
            new Date();


        await license.save();


        return res.json({
            success: true,
            message:
                "License suspended successfully"
        });

    } catch (error) {

        console.error(
            "Suspend license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to suspend license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| UNSUSPEND LICENSE
|--------------------------------------------------------------------------
*/

exports.unsuspendLicense = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        const license =
            await License.findById(
                id
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        if (
            license.status !==
            "suspended"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "License is not suspended"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Reactivate
        |--------------------------------------------------------------------------
        */

        license.status =
            "active";


        /*
        |--------------------------------------------------------------------------
        | Invalidate suspended token
        |--------------------------------------------------------------------------
        */

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;


        license.lastCheckedAt =
            new Date();


        await license.save();


        return res.json({
            success: true,
            message:
                "License unsuspended successfully"
        });

    } catch (error) {

        console.error(
            "Unsuspend license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to unsuspend license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| UPDATE LICENSE
|--------------------------------------------------------------------------
*/

exports.updateLicense = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        const {
            plan,
            expiresAt,
            themeName,
            renew = false
        } = req.body;


        const license =
            await License.findById(
                id
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REVOKED LICENSE
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "revoked"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Revoked licenses cannot be renewed"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | PLAN
        |--------------------------------------------------------------------------
        */

        if (
            plan !== undefined
        ) {

            const allowedPlans = [
                "monthly",
                "yearly",
                "lifetime"
            ];


            if (
                !allowedPlans.includes(
                    plan
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid plan"
                });
            }


            license.plan =
                plan;
        }


        /*
        |--------------------------------------------------------------------------
        | THEME NAME
        |--------------------------------------------------------------------------
        */

        if (
            themeName !== undefined
        ) {

            license.themeName =
                themeName.trim() ||
                "Ready Gym";
        }


        /*
        |--------------------------------------------------------------------------
        | LIFETIME
        |--------------------------------------------------------------------------
        */

        if (
            license.plan ===
            "lifetime"
        ) {

            license.expiresAt =
                null;


            if (
                renew === true
            ) {

                license.status =
                    "active";

                license.tokenVersion =
                    Number(
                        license.tokenVersion || 0
                    ) + 1;
            }
        }


        /*
        |--------------------------------------------------------------------------
        | MONTHLY / YEARLY
        |--------------------------------------------------------------------------
        */

        else if (
            expiresAt !== undefined
        ) {

            if (
                expiresAt === null ||
                expiresAt === ""
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Expiration date is required for monthly/yearly licenses"
                });
            }


            const date =
                new Date(
                    expiresAt
                );


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid expiration date"
                });
            }


            /*
            |--------------------------------------------------------------------------
            | Renewal date must be future
            |--------------------------------------------------------------------------
            */

            if (
                renew === true &&
                date <= new Date()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Renewal date must be in the future"
                });
            }


            license.expiresAt =
                date;


            /*
            |--------------------------------------------------------------------------
            | Renew
            |--------------------------------------------------------------------------
            */

            if (
                renew === true
            ) {

                license.status =
                    "active";

                license.tokenVersion =
                    Number(
                        license.tokenVersion || 0
                    ) + 1;
            }
        }


        await license.save();


        return res.json({

            success: true,

            message:
                renew === true
                    ? "License renewed successfully"
                    : "License updated successfully",

            license

        });

    } catch (error) {

        console.error(
            "Update license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to update license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| ADMIN DEACTIVATE LICENSE
|--------------------------------------------------------------------------
*/

exports.adminDeactivateLicense = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        const license =
            await License.findById(
                id
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | DEACTIVATE
        |--------------------------------------------------------------------------
        */

        license.status =
            "inactive";


        /*
        |--------------------------------------------------------------------------
        | REMOVE STORE BINDING
        |--------------------------------------------------------------------------
        */

        license.shopDomain =
            null;

        license.installationId =
            null;


        /*
        |--------------------------------------------------------------------------
        | INVALIDATE TOKENS
        |--------------------------------------------------------------------------
        */

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;


        license.lastCheckedAt =
            new Date();

        license.lastSeenAt =
            null;


        await license.save();


        return res.json({

            success: true,

            message:
                "License deactivated successfully",

            license: {

                id:
                    license._id,

                licenseKey:
                    license.licenseKey,

                status:
                    license.status,

                shopDomain:
                    license.shopDomain,

                tokenVersion:
                    license.tokenVersion

            }

        });

    } catch (error) {

        console.error(
            "Admin deactivate license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to deactivate license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| ADMIN ACTIVATE LICENSE
|--------------------------------------------------------------------------
|
| Admin cannot activate an unactivated license.
| Activation must happen from the Shopify store.
|--------------------------------------------------------------------------
*/

exports.adminActivateLicense = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        const license =
            await License.findById(
                id
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        if (
            license.status ===
            "revoked"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Revoked licenses cannot be activated."
            });
        }


        if (
            license.status ===
            "active"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "License is already active."
            });
        }


        return res.status(403).json({
            success: false,
            message:
                "This license can only be activated from the Shopify store."
        });

    } catch (error) {

        console.error(
            "Admin activate license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to activate license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| REVOKE LICENSE
|--------------------------------------------------------------------------
*/

exports.revokeLicense = async (
    req,
    res
) => {

    try {

        const {
            id
        } = req.params;


        const license =
            await License.findById(
                id
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REVOKE
        |--------------------------------------------------------------------------
        */

        license.status =
            "revoked";


        /*
        |--------------------------------------------------------------------------
        | REMOVE STORE BINDING
        |--------------------------------------------------------------------------
        */

        license.shopDomain =
            null;

        license.installationId =
            null;


        /*
        |--------------------------------------------------------------------------
        | INVALIDATE TOKENS
        |--------------------------------------------------------------------------
        */

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;


        license.lastCheckedAt =
            new Date();

        license.lastSeenAt =
            null;


        await license.save();


        return res.json({

            success: true,

            message:
                "License revoked successfully",

            license: {

                id:
                    license._id,

                licenseKey:
                    license.licenseKey,

                status:
                    license.status,

                tokenVersion:
                    license.tokenVersion

            }

        });

    } catch (error) {

        console.error(
            "Revoke license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to revoke license"
        });
    }
};


/*
|--------------------------------------------------------------------------
| REFRESH LICENSE TOKEN
|--------------------------------------------------------------------------
*/

exports.refreshLicense = async (
    req,
    res
) => {

    try {

        const token =
            getBearerToken(req);


        if (!token) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Authorization token is required"
            });
        }


        let decoded;

        /*
        |--------------------------------------------------------------------------
        | Allow expired JWT to be verified
        |--------------------------------------------------------------------------
        |
        | The JWT can expire after 30 days, but the license itself
        | may still be active. We therefore verify the signature while
        | ignoring JWT expiration.
        |
        */

        try {

            decoded =
                jwt.verify(
                    token,
                    process.env.JWT_SECRET,
                    {
                        ignoreExpiration:
                            true
                    }
                );


            if (
                decoded.type !==
                "readygym_installation"
            ) {

                throw new Error(
                    "Invalid installation token"
                );
            }

        } catch (error) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Invalid activation token"
            });
        }


        const license =
            await License.findById(
                decoded.licenseId
            );


        if (!license) {

            return res.status(404).json({
                success: false,
                valid: false,
                message:
                    "License not found"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | LICENSE KEY
        |--------------------------------------------------------------------------
        */

        if (
            license.licenseKey !==
            decoded.licenseKey
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "Invalid license token"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | INSTALLATION
        |--------------------------------------------------------------------------
        */

        if (
            !license.installationId ||
            license.installationId !==
                decoded.installationId
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "Installation mismatch"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REVOKED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "revoked"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License has been revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SUSPENDED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "suspended"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License is suspended"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SHOP MATCH
        |--------------------------------------------------------------------------
        */

        if (
            !license.shopDomain ||
            license.shopDomain !==
                decoded.shopDomain
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License store mismatch"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | TOKEN VERSION
        |--------------------------------------------------------------------------
        |
        | Current token:
        |
        | decoded = currentVersion
        |
        | Token issued immediately before renewal:
        |
        | decoded = currentVersion - 1
        |
        | This allows a renewed active license to refresh its
        | old token once.
        |
        */

        const currentVersion =
            Number(
                license.tokenVersion || 0
            );

        const oldVersion =
            Number(
                decoded.tokenVersion || 0
            );


        if (
            oldVersion !==
                currentVersion &&
            oldVersion !==
                currentVersion - 1
        ) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Activation token has been revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | EXPIRATION
        |--------------------------------------------------------------------------
        */

        const isExpired =
            await checkLicenseExpiry(
                license
            );


        if (isExpired) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    "License has expired"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | ACTIVE STATUS
        |--------------------------------------------------------------------------
        */

        if (
            license.status !==
            "active"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    `License is ${license.status}`
            });
        }


        /*
        |--------------------------------------------------------------------------
        | CREATE NEW INSTALLATION TOKEN
        |--------------------------------------------------------------------------
        */

        const newToken =
            createInstallationToken(
                license
            );


        /*
        |--------------------------------------------------------------------------
        | UPDATE ACTIVITY
        |--------------------------------------------------------------------------
        */

        const now =
            new Date();

        license.lastCheckedAt =
            now;

        license.lastSeenAt =
            now;


        await license.save();


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            valid: true,

            message:
                "Activation token refreshed",

            token:
                newToken,

            license: {

                themeName:
                    license.themeName,

                plan:
                    license.plan,

                shopDomain:
                    license.shopDomain,

                installationId:
                    license.installationId,

                expiresAt:
                    license.expiresAt

            }

        });

    } catch (error) {

        console.error(
            "Refresh license error:",
            error
        );

        return res.status(500).json({
            success: false,
            valid: false,
            message:
                "License refresh failed"
        });
    }
};


/*
|--------------------------------------------------------------------------
| PUBLIC LICENSE CHECK
|--------------------------------------------------------------------------
|
| This endpoint intentionally returns minimal information.
| It does NOT expose installationId or license metadata.
|--------------------------------------------------------------------------
*/

exports.publicCheckLicense = async (
    req,
    res
) => {

    try {

        const {
            shopDomain
        } = req.body;


        if (!shopDomain) {

            return res.status(400).json({
                success: false,
                valid: false,
                message:
                    "Shop domain is required"
            });
        }


        const normalizedShop =
            normalizeShopDomain(
                shopDomain
            );


        console.log(
            "PUBLIC LICENSE CHECK:",
            normalizedShop
        );


        /*
        |--------------------------------------------------------------------------
        | FIND ACTIVE LICENSE
        |--------------------------------------------------------------------------
        */

        const license =
            await License.findOne({

                shopDomain:
                    normalizedShop,

                status:
                    "active"

            }).sort({
                createdAt: -1
            });


        /*
        |--------------------------------------------------------------------------
        | NO LICENSE
        |--------------------------------------------------------------------------
        */

        if (!license) {

            console.log(
                "NO ACTIVE LICENSE FOUND FOR:",
                normalizedShop
            );

            return res.json({
                success: true,
                valid: false
            });
        }


        /*
        |--------------------------------------------------------------------------
        | EXPIRATION
        |--------------------------------------------------------------------------
        */

        const isExpired =
            await checkLicenseExpiry(
                license
            );


        if (isExpired) {

            console.log(
                "LICENSE EXPIRED:",
                license.licenseKey
            );

            return res.json({
                success: true,
                valid: false
            });
        }


        /*
        |--------------------------------------------------------------------------
        | FINAL STATUS
        |--------------------------------------------------------------------------
        */

        if (
            license.status !==
            "active"
        ) {

            return res.json({
                success: true,
                valid: false
            });
        }


        /*
        |--------------------------------------------------------------------------
        | VALID
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            valid: true
        });

    } catch (error) {

        console.error(
            "Public license check error:",
            error
        );

        return res.status(500).json({
            success: false,
            valid: false,
            message:
                "License verification failed"
        });
    }
};


/*
|--------------------------------------------------------------------------
| PUBLIC INTEGRITY CHECK
|--------------------------------------------------------------------------
|
| NOTE:
| This is still a client-reported integrity check.
| It is useful as a tamper signal but is NOT cryptographic proof.
|--------------------------------------------------------------------------
*/

exports.publicIntegrityCheck = async (
    req,
    res
) => {

    try {

        const {
            shopDomain,
            installationId,
            components
        } = req.body;


        if (
            !shopDomain ||
            !installationId ||
            !components
        ) {

            return res.status(400).json({
                success: false,
                valid: false,
                message:
                    "Integrity information is required."
            });
        }


        const normalizedShop =
            normalizeShopDomain(
                shopDomain
            );


        /*
        |--------------------------------------------------------------------------
        | FIND INSTALLATION
        |--------------------------------------------------------------------------
        */

        const license =
            await License.findOne({

                shopDomain:
                    normalizedShop,

                installationId:
                    installationId,

                status:
                    "active"

            });


        if (!license) {

            return res.json({
                success: true,
                valid: false
            });
        }


        /*
        |--------------------------------------------------------------------------
        | EXPIRATION
        |--------------------------------------------------------------------------
        */

        const expired =
            await checkLicenseExpiry(
                license
            );


        if (expired) {

            return res.json({
                success: true,
                valid: false
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REQUIRED COMPONENTS
        |--------------------------------------------------------------------------
        */

        const requiredComponents = [

            "rg-license-js",

            "rg-license-lock",

            "rg-license-marker"

        ];


        const missingComponents =
            requiredComponents.filter(
                component =>
                    components[
                        component
                    ] !== true
            );


        if (
            missingComponents.length > 0
        ) {

            return res.json({

                success: true,

                valid: false,

                reason:
                    "theme_integrity_failed",

                missing:
                    missingComponents

            });
        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE INTEGRITY ACTIVITY
        |--------------------------------------------------------------------------
        */

        const now =
            new Date();


        license.lastCheckedAt =
            now;

        license.lastIntegrityCheckAt =
            now;

        license.lastSeenAt =
            now;


        await license.save();


        return res.json({
            success: true,
            valid: true
        });

    } catch (error) {

        console.error(
            "Integrity check error:",
            error
        );

        return res.status(500).json({
            success: false,
            valid: false
        });
    }
};


/*
|--------------------------------------------------------------------------
| LICENSE HEARTBEAT
|--------------------------------------------------------------------------
|
| The heartbeat is now authenticated using the signed
| Ready Gym installation token.
|--------------------------------------------------------------------------
*/

exports.licenseHeartbeat = async (
    req,
    res
) => {

    try {

        const {
            shopDomain,
            themeVersion
        } = req.body;


        /*
        |--------------------------------------------------------------------------
        | SHOP REQUIRED
        |--------------------------------------------------------------------------
        */

        if (!shopDomain) {

            return res.status(400).json({
                success: false,
                valid: false,
                message:
                    "Shop domain is required."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | GET TOKEN
        |--------------------------------------------------------------------------
        */

        const token =
            getBearerToken(req);


        if (!token) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Installation token required."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | VERIFY TOKEN
        |--------------------------------------------------------------------------
        */

        let decoded;

        try {

            decoded =
                verifyInstallationToken(
                    token
                );

        } catch (error) {

            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Invalid installation token."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | NORMALIZE SHOP
        |--------------------------------------------------------------------------
        */

        const normalizedShop =
            normalizeShopDomain(
                shopDomain
            );


        /*
        |--------------------------------------------------------------------------
        | FIND LICENSE USING TOKEN
        |--------------------------------------------------------------------------
        */

        const license =
            await License.findById(
                decoded.licenseId
            );


        if (!license) {

            return res.status(404).json({
                success: true,
                valid: false,
                message:
                    "License not found."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | LICENSE KEY MATCH
        |--------------------------------------------------------------------------
        */

        if (
            license.licenseKey !==
            decoded.licenseKey
        ) {

            return res.status(403).json({
                success: true,
                valid: false,
                message:
                    "Invalid license token."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | INSTALLATION MATCH
        |--------------------------------------------------------------------------
        */

        if (
            !license.installationId ||
            license.installationId !==
                decoded.installationId
        ) {

            return res.status(403).json({
                success: true,
                valid: false,
                message:
                    "Installation mismatch."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | STORE MATCH
        |--------------------------------------------------------------------------
        */

        if (
            !license.shopDomain ||
            license.shopDomain !==
                normalizedShop ||
            decoded.shopDomain !==
                normalizedShop
        ) {

            return res.status(403).json({
                success: true,
                valid: false,
                message:
                    "Store mismatch."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | TOKEN VERSION
        |--------------------------------------------------------------------------
        */

        if (
            Number(
                decoded.tokenVersion || 0
            ) !==
            Number(
                license.tokenVersion || 0
            )
        ) {

            return res.status(403).json({
                success: true,
                valid: false,
                message:
                    "Installation token has been invalidated."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | REVOKED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "revoked"
        ) {

            return res.json({
                success: true,
                valid: false,
                status:
                    "revoked"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SUSPENDED
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "suspended"
        ) {

            return res.json({
                success: true,
                valid: false,
                status:
                    "suspended"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | EXPIRATION
        |--------------------------------------------------------------------------
        */

        const expired =
            await checkLicenseExpiry(
                license
            );


        if (expired) {

            return res.json({
                success: true,
                valid: false,
                status:
                    "expired"
            });
        }


        /*
        |--------------------------------------------------------------------------
        | STATUS
        |--------------------------------------------------------------------------
        */

        if (
            license.status !==
            "active"
        ) {

            return res.json({
                success: true,
                valid: false,
                status:
                    license.status
            });
        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE INSTALLATION ACTIVITY
        |--------------------------------------------------------------------------
        */

        const now =
            new Date();


        license.lastSeenAt =
            now;

        license.lastCheckedAt =
            now;


        if (
            themeVersion
        ) {

            license.themeVersion =
                themeVersion;
        }


        await license.save();


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            valid: true,

            status:
                license.status,

            themeVersion:
                license.themeVersion,

            expiresAt:
                license.expiresAt,

            lastSeenAt:
                license.lastSeenAt

        });

    } catch (error) {

        console.error(
            "License heartbeat error:",
            error
        );

        return res.status(500).json({
            success: false,
            valid: false,
            message:
                "Heartbeat failed."
        });
    }
};
