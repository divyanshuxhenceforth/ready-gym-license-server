const checkLicenseExpiry =
    require("../utils/checkLicenseExpiry");

const jwt = require("jsonwebtoken");
const License = require("../models/License");
const generateLicenseKey = require("../utils/generateLicenseKey");


exports.checkLicense = async (req, res) => {
    try {

        const authHeader =
            req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Authorization token is required"
            });
        }

        const token =
            authHeader.substring(7);

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
        | REVOKED
        |--------------------------------------------------------------------------
        */

        if (
            license.status === "revoked"
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
            license.status === "suspended"
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
            license.status !== "active"
        ) {

            return res.status(403).json({
                success: false,
                valid: false,
                message:
                    `License is ${license.status}`
            });
        }

        license.lastCheckedAt =
            new Date();

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

exports.deactivateLicense = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const token = authHeader.substring(7);

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired activation token",
      });
    }

    const license = await License.findById(decoded.licenseId);

    if (!license) {
      return res.status(404).json({
        success: false,
        message: "License not found",
      });
    }

    // Make sure token belongs to this license
    if (license.licenseKey !== decoded.licenseKey) {
      return res.status(403).json({
        success: false,
        message: "Invalid license token",
      });
    }

    // Make sure token belongs to the currently
    // activated Shopify store
    if (license.shopDomain !== decoded.shopDomain) {
      return res.status(403).json({
        success: false,
        message: "License store mismatch",
      });
    }

    // Release the license
    license.shopDomain = null;
    license.status = "inactive";
    license.tokenVersion += 1;
    license.lastCheckedAt = new Date();

    await license.save();

    return res.json({
      success: true,
      message: "License deactivated successfully",
    });
  } catch (error) {
    console.error("Deactivate license error:", error);

    return res.status(500).json({
      success: false,
      message: "License deactivation failed",
    });
  }
};

exports.createLicense = async (req, res) => {
  try {
    const {
      plan = "lifetime",
      themeName = "Ready Gym",
      expiresAt = null,
    } = req.body;

    // Validate plan
    const allowedPlans = ["monthly", "yearly", "lifetime"];

    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan",
      });
    }

    let licenseKey;
    let existingLicense;

    // Generate unique license key
    do {
      licenseKey = generateLicenseKey();

      existingLicense = await License.findOne({
        licenseKey,
      });
    } while (existingLicense);

    if (plan === "lifetime") {
        expiresAt = null;
    }

    // Create license
    const license = await License.create({
      licenseKey,
      shopDomain: null,
      themeName,
      status: "inactive",
      plan,
      expiresAt,
    });

    return res.status(201).json({
      success: true,
      message: "License created successfully",
      license: {
        id: license._id,
        licenseKey: license.licenseKey,
        themeName: license.themeName,
        plan: license.plan,
        status: license.status,
        expiresAt: license.expiresAt,
      },
    });
  } catch (error) {
    console.error("Create license error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create license",
    });
  }
};

exports.activateLicense = async (req, res) => {
  try {
    const { licenseKey, shopDomain } = req.body;

    if (!licenseKey || !shopDomain) {
      return res.status(400).json({
        success: false,
        message: "License key and shop domain are required",
      });
    }

    // Normalize shop domain
    const normalizedShop = shopDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    // Find license
    const license = await License.findOne({
      licenseKey: licenseKey.trim(),
    });

    if (!license) {
    return res.status(404).json({
        success: false,
        message: "License not found"
    });
    }

    const isExpired =
        await checkLicenseExpiry(
            license
        );

    if (isExpired) {

        return res.status(403).json({
            success: false,
            message:
                "License has expired"
        });
    }

    // Check status
    if (license.status !== "active" && license.status !== "inactive") {
      return res.status(403).json({
        success: false,
        message: `License is ${license.status}`,
      });
    }

    // Check expiration
    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      license.status = "expired";

      await license.save();

      return res.status(403).json({
        success: false,
        message: "License has expired",
      });
    }

    // If already activated on another store
    if (license.shopDomain && license.shopDomain !== normalizedShop) {
      return res.status(403).json({
        success: false,
        message: "License is already activated on another store",
      });
    }

    // Bind license to store
    license.shopDomain =
    normalizedShop;

    license.status =
        "active";

    license.activatedAt =
        license.activatedAt ||
        new Date();

    license.lastCheckedAt =
        new Date();

    /*
    |--------------------------------------------------------------------------
    | New activation = new token version
    |--------------------------------------------------------------------------
    */

    license.tokenVersion += 1;

    await license.save();

    // Create activation token
    const token = jwt.sign(
      {
        licenseId: license._id.toString(),
        licenseKey: license.licenseKey,
        shopDomain: normalizedShop,
        themeName: license.themeName,
        plan: license.plan,
        tokenVersion: license.tokenVersion,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    return res.json({
      success: true,
      message: "License activated successfully",

      license: {
        themeName: license.themeName,
        plan: license.plan,
        shopDomain: license.shopDomain,
        expiresAt: license.expiresAt,
      },

      token,
    });
  } catch (error) {
    console.error("Activate license error:", error);

    return res.status(500).json({
      success: false,
      message: "License activation failed",
    });
  }
};


exports.getLicenses = async (req, res) => {
    try {

        const licenses =
            await License.find()
                .sort({
                    createdAt: -1
                })
                .lean();

        return res.json({
            success: true,
            count: licenses.length,
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


exports.suspendLicense = async (req, res) => {
    try {
        const { id } = req.params;

        const license = await License.findById(id);

        if (!license) {
            return res.status(404).json({
                success: false,
                message: "License not found"
            });
        }

        license.status = "suspended";

        // Revoke existing activation token
        license.tokenVersion += 1;

        await license.save();

        return res.json({
            success: true,
            message: "License suspended successfully"
        });

    } catch (error) {
        console.error(
            "Suspend license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to suspend license"
        });
    }
};


exports.unsuspendLicense = async (
    req,
    res
) => {

    try {

        const { id } = req.params;

        const license =
            await License.findById(id);

        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });

        }

        license.status = "active";

        // Revoke old suspended token
        license.tokenVersion += 1;

        await license.save();

        return res.json({
            success: true,
            message:
                "License activated successfully"
        });

    } catch (error) {

        console.error(
            "Unsuspend license error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to activate license"
        });

    }
};

exports.updateLicense = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            plan,
            expiresAt,
            themeName,
            renew = false
        } = req.body;

        const license =
            await License.findById(id);

        if (!license) {
            return res.status(404).json({
                success: false,
                message: "License not found"
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Revoked licenses cannot be renewed
        |--------------------------------------------------------------------------
        */

        if (
            license.status === "revoked"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Revoked licenses cannot be renewed"
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Plan
        |--------------------------------------------------------------------------
        */

        if (plan !== undefined) {

            const allowedPlans = [
                "monthly",
                "yearly",
                "lifetime"
            ];

            if (
                !allowedPlans.includes(plan)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid plan"
                });
            }

            license.plan = plan;
        }

        /*
        |--------------------------------------------------------------------------
        | Theme name
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
        | Lifetime
        |--------------------------------------------------------------------------
        */

        if (
            license.plan === "lifetime"
        ) {

            license.expiresAt = null;

            if (renew === true) {
                license.status = "active";
                license.tokenVersion =
                    Number(
                        license.tokenVersion || 0
                    ) + 1;
            }

        }

        /*
        |--------------------------------------------------------------------------
        | Monthly / Yearly
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
                new Date(expiresAt);

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
            | Date must be in the future when renewing
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
            | Reactivate
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


exports.adminDeactivateLicense = async (req, res) => {
    try {
        const { id } = req.params;

        console.log(
            "Admin deactivate request:",
            id
        );

        const license =
            await License.findById(id);

        if (!license) {
            return res.status(404).json({
                success: false,
                message: "License not found"
            });
        }

        console.log(
            "License found:",
            license.licenseKey
        );

        /*
        |--------------------------------------------------------------------------
        | Deactivate license
        |--------------------------------------------------------------------------
        */

        license.status = "inactive";

        /*
        |--------------------------------------------------------------------------
        | Remove store binding
        |--------------------------------------------------------------------------
        */

        license.shopDomain = null;

        /*
        |--------------------------------------------------------------------------
        | Revoke all existing activation tokens
        |--------------------------------------------------------------------------
        */

        license.tokenVersion =
            Number(license.tokenVersion || 0) + 1;

        license.lastCheckedAt =
            new Date();

        await license.save();

        console.log(
            "License deactivated:",
            license.licenseKey
        );

        return res.json({
            success: true,
            message:
                "License deactivated successfully",
            license: {
                id: license._id,
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
            "ADMIN DEACTIVATE ERROR:"
        );

        console.error(error);

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to deactivate license"
        });
    }
};


exports.adminActivateLicense = async (
    req,
    res
) => {

    try {

        const { id } =
            req.params;

        const license =
            await License.findById(id);

        if (!license) {

            return res.status(404).json({
                success: false,
                message:
                    "License not found"
            });

        }

        /*
        |--------------------------------------------------------------------------
        | Revoked licenses cannot be reactivated
        |--------------------------------------------------------------------------
        */

        if (
            license.status === "revoked"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Revoked licenses cannot be activated"
            });

        }

        /*
        |--------------------------------------------------------------------------
        | Expiration
        |--------------------------------------------------------------------------
        */

        if (
            license.expiresAt &&
            new Date() >=
            new Date(license.expiresAt)
        ) {

            license.status =
                "expired";

            license.tokenVersion =
                Number(
                    license.tokenVersion || 0
                ) + 1;

            await license.save();

            return res.status(403).json({
                success: false,
                message:
                    "Cannot activate an expired license"
            });
        }

        license.status =
            "active";

        license.tokenVersion =
            Number(
                license.tokenVersion || 0
            ) + 1;

        await license.save();

        return res.json({
            success: true,
            message:
                "License activated successfully"
        });

    } catch (error) {

        console.error(
            "Admin activate error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to activate license"
        });
    }
};


/*
        |--------------------------------------------------------------------------
        | revoke controller
        |--------------------------------------------------------------------------
        */


exports.revokeLicense = async (req, res) => {
    try {
        const { id } = req.params;

        const license =
            await License.findById(id);

        if (!license) {
            return res.status(404).json({
                success: false,
                message: "License not found"
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Revoke license
        |--------------------------------------------------------------------------
        */

        license.status = "revoked";

        /*
        |--------------------------------------------------------------------------
        | Remove store binding
        |--------------------------------------------------------------------------
        */

        license.shopDomain = null;

        /*
        |--------------------------------------------------------------------------
        | Invalidate all existing tokens
        |--------------------------------------------------------------------------
        */

        license.tokenVersion =
            Number(license.tokenVersion || 0) + 1;

        license.lastCheckedAt =
            new Date();

        await license.save();

        return res.json({
            success: true,
            message:
                "License revoked successfully",
            license: {
                id: license._id,
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


exports.refreshLicense = async (req, res) => {
    try {

        const authHeader =
            req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                valid: false,
                message:
                    "Authorization token is required"
            });
        }

        const token =
            authHeader.substring(7);

        let decoded;

        /*
        |--------------------------------------------------------------------------
        | We intentionally allow an expired JWT to be decoded.
        |
        | This endpoint is only allowed to refresh an activation when the
        | license itself is currently active and belongs to the same store.
        |--------------------------------------------------------------------------
        */

        try {

            decoded =
                jwt.verify(
                    token,
                    process.env.JWT_SECRET,
                    {
                        ignoreExpiration: true
                    }
                );

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
        | Revoked licenses can NEVER be refreshed
        |--------------------------------------------------------------------------
        */

        if (
            license.status === "revoked"
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
        | Suspended licenses cannot be refreshed
        |--------------------------------------------------------------------------
        */

        if (
            license.status === "suspended"
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
        | License must currently be active
        |--------------------------------------------------------------------------
        */

        if (
            license.status !== "active"
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
        | Store must match
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
        | Token version check
        |
        | Normal token:
        |
        | tokenVersion === license.tokenVersion
        |
        | After renewal:
        |
        | old tokenVersion = 3
        | license tokenVersion = 4
        |
        | We allow exactly that one-version transition.
        |--------------------------------------------------------------------------
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
        | Check expiration
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
        | Issue a new token
        |--------------------------------------------------------------------------
        */

        /*
        | If the token was already current, don't increment the version.
        |
        | If it was one version behind because of renewal, use the current
        | version.
        */

        const tokenVersion =
            currentVersion;

        const newToken =
            jwt.sign(
                {
                    licenseId:
                        license._id.toString(),

                    licenseKey:
                        license.licenseKey,

                    shopDomain:
                        license.shopDomain,

                    themeName:
                        license.themeName,

                    plan:
                        license.plan,

                    tokenVersion:
                        tokenVersion
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: "30d"
                }
            );

        license.lastCheckedAt =
            new Date();

        await license.save();

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


exports.publicCheckLicense = async (req, res) => {
    try {

        const { shopDomain } = req.body;

        if (!shopDomain) {
            return res.status(400).json({
                success: false,
                valid: false,
                message: "Shop domain is required"
            });
        }

        const normalizedShop = shopDomain
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/\/$/, "");

        const license = await License.findOne({
            shopDomain: normalizedShop
        });

        if (!license) {
            return res.json({
                success: true,
                valid: false
            });
        }

        const isExpired =
            await checkLicenseExpiry(license);

        if (isExpired) {
            return res.json({
                success: true,
                valid: false
            });
        }

        if (license.status !== "active") {
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
