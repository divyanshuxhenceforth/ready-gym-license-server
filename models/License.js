const mongoose = require("mongoose");

const licenseSchema = new mongoose.Schema(
    {
        licenseKey: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        shopDomain: {
            type: String,
            default: null,
            index: true
        },

        installationId: {
            type: String,
            default: null,
            index: true
        },
        themeVersion: {
            type: String,
            default: null
        },
        
        lastSeenAt: {
            type: Date,
            default: null
        },
        
        lastIntegrityCheckAt: {
            type: Date,
            default: null
        },

        themeName: {
            type: String,
            default: "Ready Gym"
        },

        status: {
            type: String,
            enum: [
                "active",
                "inactive",
                "expired",
                "suspended",
                "revoked"
            ],
            default: "active"
        },

        plan: {
            type: String,
            enum: [
                "monthly",
                "yearly",
                "lifetime"
            ],
            default: "monthly"
        },

        expiryMode: {
            type: String,
            enum: [
                "automatic",
                "manual"
            ],
            default: "automatic"
        },

        expiresAt: {
            type: Date,
            default: null
        },

        activatedAt: {
            type: Date,
            default: null
        },

        lastCheckedAt: {
            type: Date,
            default: null
        },

        tokenVersion: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "License",
    licenseSchema
);
