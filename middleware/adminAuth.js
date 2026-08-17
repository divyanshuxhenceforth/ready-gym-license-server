const jwt = require("jsonwebtoken");

const adminAuth = (
    req,
    res,
    next
) => {

    const authHeader =
        req.headers.authorization;

    if (
        !authHeader ||
        !authHeader.startsWith("Bearer ")
    ) {
        return res.status(401).json({
            success: false,
            message:
                "Admin authentication required"
        });
    }

    const token =
        authHeader.substring(7);

    try {

        const decoded =
            jwt.verify(
                token,
                process.env.ADMIN_JWT_SECRET
            );

        if (
            decoded.role !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Admin access denied"
            });
        }

        req.admin = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message:
                "Invalid or expired admin token"
        });

    }
};

module.exports = adminAuth;