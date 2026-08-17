const jwt = require("jsonwebtoken");

exports.adminLogin = async (req, res) => {
    try {
        const { secret } = req.body;

        if (!secret) {
            return res.status(400).json({
                success: false,
                message: "Admin secret is required"
            });
        }

        if (
            secret !== process.env.ADMIN_SECRET
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin credentials"
            });
        }

        const token = jwt.sign(
            {
                role: "admin"
            },
            process.env.ADMIN_JWT_SECRET,
            {
                expiresIn: "8h"
            }
        );

        return res.json({
            success: true,
            message: "Admin login successful",
            token
        });

    } catch (error) {

        console.error(
            "Admin login error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Admin login failed"
        });

    }
};