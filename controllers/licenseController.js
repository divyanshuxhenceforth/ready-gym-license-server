const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const License = require("../models/License");
const generateLicenseKey = require("../utils/generateLicenseKey");
const checkLicenseExpiry = require("../utils/checkLicenseExpiry");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

/**
 * Normalize Shopify store domain.
 */
function normalizeShopDomain(shopDomain) {
    if (!shopDomain) {
        return "";
    }

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
            type: "readygym_installation",

            licenseId: license._id.toString(),

            licenseKey: license.licenseKey,

            shopDomain: license.shopDomain,

            installationId: license.installationId,

            tokenVersion: Number(
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

    return authHeader.substring(7).trim();
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

    const decoded = jwt.verify(
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

/**
 * Validate installation token against license.
 *
 * This helper checks:
 * - license exists
 * - license key
 * - installation ID
 * - shop
 * - token version
 */
async function getAuthenticatedLicense(
    req
) {
    const token =
        getBearerToken(req);

    if (!token) {
        const error =
            new Error(
                "Authorization token is required"
            );

        error.statusCode = 401;

        throw error;
    }

    let decoded;

    try {
        decoded =
            verifyInstallationToken(
                token
            );
    } catch (error) {
        const authError =
            new Error(
                "Invalid or expired activation token"
            );

        authError.statusCode = 401;

        throw authError;
    }

    const license =
        await License.findById(
            decoded.licenseId
        );

    if (!license) {
        const error =
            new Error(
                "License not found"
            );

        error.statusCode = 404;

        throw error;
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
        const error =
            new Error(
                "Invalid license token"
            );

        error.statusCode = 403;

        throw error;
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
        const error =
            new Error(
                "Installation mismatch"
            );

        error.statusCode = 403;

        throw error;
    }

    /*
    |--------------------------------------------------------------------------
    | SHOP
    |--------------------------------------------------------------------------
    */

    if (
        !license.shopDomain ||
        license.shopDomain !==
            decoded.shopDomain
    ) {
        const error =
            new Error(
                "License is not valid for this store"
            );

        error.statusCode = 403;

        throw error;
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
        const error =
            new Error(
                "Activation token has been revoked"
            );

        error.statusCode = 401;

        throw error;
    }

    return {
        license,
        decoded
    };
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
        const {
            license,
            decoded
        } =
            await getAuthenticatedLicense(
                req
            );

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
        | EXPIRATION
        |--------------------------------------------------------------------------
        */

        const expired =
            await checkLicenseExpiry(
                license
            );

        if (expired) {
            return res.status(403).json({
                success: false,
                valid: false,
                status: "expired",
                message:
                    "License has expired"
            });
        }

        /*
        |--------------------------------------------------------------------------
        | ACTIVE REQUIRED
        |--------------------------------------------------------------------------
        */

        if (
            license.status !==
            "active"
        ) {
            return res.status(403).json({
                success: false,
                valid: false,
                status:
                    license.status,
                message:
                    `License is ${license.status}`
            });
        }

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

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            valid: false,
            message:
                error.message ||
                "License verification failed"
        });
    }
};

/*
|--------------------------------------------------------------------------
| DEACTIVATE LICENSE FROM SHOPIFY
|--------------------------------------------------------------------------
*/

exports.deactivateLicense =
    async (req, res) => {
        try {
            const {
                license,
                decoded
            } =
                await getAuthenticatedLicense(
                    req
                );

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

            /*
            |--------------------------------------------------------------------------
            | INVALIDATE TOKEN
            |--------------------------------------------------------------------------
            */

            license.tokenVersion =
                Number(
                    license.tokenVersion ||
                        0
                ) + 1;

            license.lastCheckedAt =
                new Date();

            license.lastSeenAt =
                null;

            license.lastIntegrityCheckAt =
                null;

            license.themeVersion =
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

            return res.status(
                error.statusCode || 500
            ).json({
                success: false,
                message:
                    error.message ||
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
        const {
            plan = "lifetime",
            themeName = "Ready Gym"
        } = req.body;

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

        let licenseKey;
        let existingLicense;

        do {
            licenseKey =
                generateLicenseKey();

            existingLicense =
                await License.findOne({
                    licenseKey
                });
        } while (existingLicense);

        /*
        |--------------------------------------------------------------------------
        | CREATE
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

                expiresAt:
                    null,

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

exports.activateLicense =
    async (req, res) => {
        try {
            const {
                licenseKey,
                shopDomain
            } = req.body;

            /*
            |--------------------------------------------------------------------------
            | VALIDATE
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

            const normalizedShop =
                normalizeShopDomain(
                    shopDomain
                );

            const normalizedKey =
                licenseKey
                    .trim()
                    .toUpperCase();

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
            | ONLY INACTIVE LICENSES
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
            | CHECK STORE ALREADY HAS LICENSE
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

            if (existingLicense) {
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
            | CALCULATE EXPIRATION
            |--------------------------------------------------------------------------
            */

            const activationDate =
                new Date();

            let expiresAt =
                null;

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

            if (
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
                    license.tokenVersion ||
                        0
                ) + 1;

            await license.save();

            /*
            |--------------------------------------------------------------------------
            | CREATE TOKEN
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

exports.getLicenses =
    async (req, res) => {
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
|
| IMPORTANT:
|
| DO NOT increment tokenVersion here.
|
| The existing token must remain usable after the license
| is unsuspended. The "suspended" status itself blocks it.
|
|--------------------------------------------------------------------------
*/

exports.suspendLicense =
    async (req, res) => {
        try {
            const { id } =
                req.params;

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
                        "Revoked license cannot be suspended"
                });
            }

            if (
                license.status ===
                "suspended"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "License is already suspended"
                });
            }

            /*
            |--------------------------------------------------------------------------
            | SUSPEND
            |--------------------------------------------------------------------------
            */

            license.status =
                "suspended";

            /*
            |--------------------------------------------------------------------------
            | IMPORTANT
            |--------------------------------------------------------------------------
            | Do NOT change tokenVersion.
            |
            | Existing token:
            | version 1
            |
            | MongoDB:
            | version 1
            |
            | Status:
            | suspended
            |
            | Heartbeat will return suspended.
            |
            | After unsuspend:
            | status becomes active.
            |
            | Same token version 1 becomes valid again.
            |--------------------------------------------------------------------------
            */

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
|
| IMPORTANT:
|
| Do NOT increment tokenVersion.
|
| This restores the existing installation token.
|
|--------------------------------------------------------------------------
*/

exports.unsuspendLicense =
    async (req, res) => {
        try {
            const { id } =
                req.params;

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
            | MUST STILL HAVE INSTALLATION
            |--------------------------------------------------------------------------
            */

            if (
                !license.shopDomain ||
                !license.installationId
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "License has no active installation"
                });
            }

            /*
            |--------------------------------------------------------------------------
            | CHECK EXPIRATION
            |--------------------------------------------------------------------------
            */

            const expired =
                await checkLicenseExpiry(
                    license
                );

            if (expired) {
                return res.status(403).json({
                    success: false,
                    message:
                        "License has expired and cannot be unsuspended"
                });
            }

            /*
            |--------------------------------------------------------------------------
            | RESTORE ACTIVE
            |--------------------------------------------------------------------------
            */

            license.status =
                "active";

            license.lastCheckedAt =
                new Date();

            await license.save();

            /*
            |--------------------------------------------------------------------------
            | DO NOT CHANGE TOKEN VERSION
            |--------------------------------------------------------------------------
            */

            return res.json({
                success: true,
                message:
                    "License unsuspended successfully",

                license: {
                    id:
                        license._id,

                    status:
                        license.status,

                    shopDomain:
                        license.shopDomain,

                    installationId:
                        license.installationId,

                    tokenVersion:
                        license.tokenVersion
                }
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

/*
|--------------------------------------------------------------------------
| UPDATE LICENSE
|--------------------------------------------------------------------------
*/

exports.updateLicense =
    async (req, res) => {

    try {

        const { id } = req.params;

        const {
            plan,
            themeName,
            expiresAt,
            renew
        } = req.body;


        /*
        |--------------------------------------------------------------------------
        | FIND LICENSE
        |--------------------------------------------------------------------------
        */

        const license =
            await License.findById(id);

        if (!license) {

            return res.status(404).json({
                success: false,
                message: "License not found."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | REVOKED LICENSE
        |--------------------------------------------------------------------------
        |
        | Revoked licenses cannot be restored.
        |
        |--------------------------------------------------------------------------
        */

        if (
            String(
                license.status || ""
            ).toLowerCase() ===
            "revoked"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Revoked licenses cannot be updated or reactivated."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE THEME NAME
        |--------------------------------------------------------------------------
        */

        if (
            typeof themeName ===
            "string" &&
            themeName.trim()
        ) {

            license.themeName =
                themeName.trim();

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE PLAN
        |--------------------------------------------------------------------------
        */

        if (plan) {

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
                        "Invalid license plan."
                });

            }

            license.plan =
                plan;

        }


        /*
        |--------------------------------------------------------------------------
        | LIFETIME PLAN
        |--------------------------------------------------------------------------
        */

        if (
            license.plan ===
            "lifetime"
        ) {

            license.expiresAt =
                null;

            /*
            |--------------------------------------------------------------------------
            | Lifetime license should be active
            |--------------------------------------------------------------------------
            |
            | Only restore if it is currently expired.
            | Do not restore revoked licenses.
            |
            |--------------------------------------------------------------------------
            */

            if (
                license.status ===
                "expired"
            ) {

                license.status =
                    "active";

            }

        }


        /*
        |--------------------------------------------------------------------------
        | NORMAL PLAN
        |--------------------------------------------------------------------------
        */

        else if (
            expiresAt !==
            undefined
        ) {

            /*
            |--------------------------------------------------------------------------
            | Empty expiration date
            |--------------------------------------------------------------------------
            */

            if (
                expiresAt ===
                null ||
                expiresAt ===
                ""
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Expiration date is required for monthly and yearly licenses."
                });

            }


            /*
            |--------------------------------------------------------------------------
            | PARSE EXPIRATION DATE
            |--------------------------------------------------------------------------
            */

            const newExpiration =
                new Date(
                    `${expiresAt}T23:59:59`
                );


            if (
                Number.isNaN(
                    newExpiration.getTime()
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid expiration date."
                });

            }


            /*
            |--------------------------------------------------------------------------
            | EXPIRATION MUST BE IN FUTURE
            |--------------------------------------------------------------------------
            */

            if (
                newExpiration <=
                new Date()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Expiration date must be in the future."
                });

            }


            /*
            |--------------------------------------------------------------------------
            | SAVE NEW EXPIRATION
            |--------------------------------------------------------------------------
            */

            license.expiresAt =
                newExpiration;


            /*
            |--------------------------------------------------------------------------
            | REACTIVATE EXPIRED LICENSE
            |--------------------------------------------------------------------------
            |
            | THIS FIXES YOUR ISSUE.
            |
            |--------------------------------------------------------------------------
            */

            if (
                license.status ===
                "expired"
            ) {

                license.status =
                    "active";

            }


            /*
            |--------------------------------------------------------------------------
            | REACTIVATE SUSPENDED LICENSE?
            |--------------------------------------------------------------------------
            |
            | Do NOT automatically unsuspend a suspended license.
            |
            |--------------------------------------------------------------------------
            */

            if (
                license.status ===
                "suspended"
            ) {

                /*
                |--------------------------------------------------------------------------
                | Keep suspended.
                |--------------------------------------------------------------------------
                */

            }

        }


        /*
        |--------------------------------------------------------------------------
        | RENEW FLAG
        |--------------------------------------------------------------------------
        |
        | Kept for backward compatibility with old requests.
        |
        |--------------------------------------------------------------------------
        */

        if (
            renew === true &&
            license.status !==
            "revoked"
        ) {

            if (
                license.plan ===
                "lifetime"
            ) {

                license.expiresAt =
                    null;

                license.status =
                    "active";

            } else if (
                license.expiresAt &&
                new Date(
                    license.expiresAt
                ) > new Date()
            ) {

                license.status =
                    "active";

            }

        }


        /*
        |--------------------------------------------------------------------------
        | TOKEN VERSION
        |--------------------------------------------------------------------------
        |
        | If an expired license is restored, issue a new
        | token version so the installation can refresh.
        |
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
            "active"
        ) {

            /*
            |--------------------------------------------------------------------------
            | Only increment when restoring an expired license
            |--------------------------------------------------------------------------
            */

            if (
                license.tokenVersion ===
                undefined ||
                license.tokenVersion ===
                null
            ) {

                license.tokenVersion =
                    0;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | SAVE
        |--------------------------------------------------------------------------
        */

        await license.save();


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            message:
                "License updated successfully.",

            license: {

                _id:
                    license._id,

                licenseKey:
                    license.licenseKey,

                shopDomain:
                    license.shopDomain,

                themeName:
                    license.themeName,

                plan:
                    license.plan,

                status:
                    license.status,

                expiresAt:
                    license.expiresAt,

                activatedAt:
                    license.activatedAt,

                tokenVersion:
                    license.tokenVersion

            }

        });

    } catch (error) {

        console.error(
            "Update license error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to update license."

        });

    }

};

/*
|--------------------------------------------------------------------------
| ADMIN DEACTIVATE LICENSE
|--------------------------------------------------------------------------
*/

exports.adminDeactivateLicense =
    async (req, res) => {
        try {
            const { id } =
                req.params;

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

            license.shopDomain =
                null;

            license.installationId =
                null;

            /*
            |--------------------------------------------------------------------------
            | INVALIDATE TOKEN
            |--------------------------------------------------------------------------
            */

            license.tokenVersion =
                Number(
                    license.tokenVersion ||
                        0
                ) + 1;

            license.lastCheckedAt =
                new Date();

            license.lastSeenAt =
                null;

            license.lastIntegrityCheckAt =
                null;

            license.themeVersion =
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
| Admin must NOT activate a license.
| Activation happens from Shopify.
|
|--------------------------------------------------------------------------
*/

exports.adminActivateLicense =
    async (req, res) => {
        try {
            const { id } =
                req.params;

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

exports.revokeLicense =
    async (req, res) => {
        try {
            const { id } =
                req.params;

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

            license.shopDomain =
                null;

            license.installationId =
                null;

            /*
            |--------------------------------------------------------------------------
            | PERMANENT TOKEN INVALIDATION
            |--------------------------------------------------------------------------
            */

            license.tokenVersion =
                Number(
                    license.tokenVersion ||
                        0
                ) + 1;

            license.lastCheckedAt =
                new Date();

            license.lastSeenAt =
                null;

            license.lastIntegrityCheckAt =
                null;

            license.themeVersion =
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

/*
|--------------------------------------------------------------------------
| REFRESH LICENSE
|--------------------------------------------------------------------------
*/

async function refreshLicense(
    req,
    res
) {

    try {

        const token =
            getBearerToken(req);

        if (!token) {

            return res.status(401).json({
                success: false,
                message:
                    "Installation token required."
            });

        }

        let decoded;

        try {

            decoded =
                jwt.verify(
                    token,
                    process.env.JWT_SECRET
                );

        } catch (error) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid installation token."
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
                    "License not found."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | VERIFY INSTALLATION
        |--------------------------------------------------------------------------
        */

        if (
            !license.shopDomain ||
            !license.installationId
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "License is not activated."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | VERIFY TOKEN VERSION
        |--------------------------------------------------------------------------
        |
        | Allow the previous token version so that the storefront
        | can obtain a fresh token after admin renewal/reactivation.
        |
        |--------------------------------------------------------------------------
        */

        const currentVersion =
            Number(
                license.tokenVersion || 0
            );

        const tokenVersion =
            Number(
                decoded.tokenVersion
            );

        if (
            tokenVersion !==
                currentVersion &&
            tokenVersion !==
                currentVersion - 1
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Installation token is no longer valid."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK STATUS
        |--------------------------------------------------------------------------
        */

        if (
            license.status ===
                "suspended" ||
            license.status ===
                "revoked" ||
            license.status ===
                "inactive"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    `License is ${license.status}.`
            });

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK EXPIRATION
        |--------------------------------------------------------------------------
        */

        if (
            license.expiresAt &&
            new Date(
                license.expiresAt
            ) <= new Date()
        ) {

            license.status =
                "expired";

            await license.save();

            return res.status(403).json({
                success: false,
                message:
                    "License has expired."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | CREATE NEW TOKEN
        |--------------------------------------------------------------------------
        */

        const newToken =
            createInstallationToken(
                license
            );


        /*
        |--------------------------------------------------------------------------
        | UPDATE LAST CHECK
        |--------------------------------------------------------------------------
        */

        license.lastCheckedAt =
            new Date();

        license.lastSeenAt =
            new Date();

        await license.save();


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            token:
                newToken,

            license: {

                themeName:
                    license.themeName,

                plan:
                    license.plan,

                shopDomain:
                    license.shopDomain,

                activatedAt:
                    license.activatedAt,

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

            message:
                "Failed to refresh license."

        });

    }

}

/*
|--------------------------------------------------------------------------
| PUBLIC LICENSE CHECK
|--------------------------------------------------------------------------
|
| Minimal response.
|
|--------------------------------------------------------------------------
*/

exports.publicCheckLicense =
    async (req, res) => {
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

            const license =
                await License.findOne({
                    shopDomain:
                        normalizedShop,

                    status:
                        "active"
                }).sort({
                    createdAt: -1
                });

            if (!license) {
                return res.json({
                    success: true,
                    valid: false
                });
            }

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

            if (
                license.status !==
                "active"
            ) {
                return res.json({
                    success: true,
                    valid: false
                });
            }

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
*/

exports.publicIntegrityCheck =
    async (req, res) => {
        try {
            const {
                shopDomain,
                components
            } = req.body;

            if (
                !shopDomain ||
                !components
            ) {
                return res.status(400).json({
                    success: false,
                    valid: false,
                    message:
                        "Integrity information is required."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | TOKEN
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
                        "Invalid or expired installation token."
                });
            }

            const normalizedShop =
                normalizeShopDomain(
                    shopDomain
                );

            const license =
                await License.findById(
                    decoded.licenseId
                );

            if (!license) {
                return res.json({
                    success: true,
                    valid: false
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
                return res.json({
                    success: true,
                    valid: false
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
                return res.json({
                    success: true,
                    valid: false
                });
            }

            /*
            |--------------------------------------------------------------------------
            | SHOP
            |--------------------------------------------------------------------------
            */

            if (
                !license.shopDomain ||
                license.shopDomain !==
                    normalizedShop
            ) {
                return res.json({
                    success: true,
                    valid: false
                });
            }

            /*
            |--------------------------------------------------------------------------
            | TOKEN VERSION
            |--------------------------------------------------------------------------
            */

            if (
                Number(
                    decoded.tokenVersion
                ) !==
                Number(
                    license.tokenVersion ||
                        0
                )
            ) {
                return res.json({
                    success: true,
                    valid: false
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
                    (component) =>
                        components[
                            component
                        ] !== true
                );

            if (
                missingComponents.length >
                0
            ) {
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
                    valid: false,
                    reason:
                        "theme_integrity_failed",
                    missing:
                        missingComponents
                });
            }

            /*
            |--------------------------------------------------------------------------
            | SUCCESS
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
*/

exports.licenseHeartbeat =
    async (req, res) => {
        try {
            /*
            |--------------------------------------------------------------------------
            | TOKEN
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
                        "Invalid or expired installation token."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | REQUEST DATA
            |--------------------------------------------------------------------------
            */

            const {
                shopDomain,
                themeVersion
            } = req.body;

            if (!shopDomain) {
                return res.status(400).json({
                    success: false,
                    valid: false,
                    message:
                        "Shop domain is required."
                });
            }

            const normalizedShop =
                normalizeShopDomain(
                    shopDomain
                );

            /*
            |--------------------------------------------------------------------------
            | FIND LICENSE
            |--------------------------------------------------------------------------
            */

            const license =
                await License.findById(
                    decoded.licenseId
                );

            if (!license) {
                return res.status(404).json({
                    success: false,
                    valid: false,
                    message:
                        "License not found."
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
                        "License token mismatch."
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
                        "Installation mismatch."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | SHOP
            |--------------------------------------------------------------------------
            */

            if (
                !license.shopDomain ||
                license.shopDomain !==
                    normalizedShop
            ) {
                return res.status(403).json({
                    success: false,
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
                    decoded.tokenVersion
                ) !==
                Number(
                    license.tokenVersion ||
                        0
                )
            ) {
                return res.status(403).json({
                    success: false,
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
                        "revoked",
                    message:
                        "License has been revoked."
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
                        "suspended",
                    message:
                        "License is suspended."
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
                        "expired",
                    message:
                        "License has expired."
                });
            }

            /*
            |--------------------------------------------------------------------------
            | ACTIVE REQUIRED
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
                        license.status,
                    message:
                        `License is ${license.status}.`
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

            if (themeVersion) {
                license.themeVersion =
                    themeVersion;
            }

            await license.save();

            /*
            |--------------------------------------------------------------------------
            | SUCCESS
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
