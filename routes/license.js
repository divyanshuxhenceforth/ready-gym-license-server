const express = require("express");

const {
    createLicense,
    activateLicense,
    checkLicense,
    publicCheckLicense,
    deactivateLicense,
    refreshLicense,
    getLicenses,
    suspendLicense,
    unsuspendLicense,
    updateLicense,
    adminActivateLicense,
    adminDeactivateLicense,
    revokeLicense
} = require("../controllers/licenseController");

const adminAuth =
    require("../middleware/adminAuth");

const router =
    express.Router();



/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

router.post(
    "/create",
    adminAuth,
    createLicense
);

router.get(
    "/admin/list",
    adminAuth,
    getLicenses
);

router.patch(
    "/admin/:id/update",
    adminAuth,
    updateLicense
);

router.patch(
    "/admin/:id/activate",
    adminAuth,
    adminActivateLicense
);

router.patch(
    "/admin/:id/deactivate",
    adminAuth,
    adminDeactivateLicense
);

router.patch(
    "/admin/:id/suspend",
    adminAuth,
    suspendLicense
);

router.patch(
    "/admin/:id/unsuspend",
    adminAuth,
    unsuspendLicense
);

router.patch(
    "/admin/:id/revoke",
    adminAuth,
    revokeLicense
);

router.post(
    "/refresh",
    refreshLicense
);


/*
|--------------------------------------------------------------------------
| THEME
|--------------------------------------------------------------------------
*/

router.post(
    "/activate",
    activateLicense
);

router.post(
    "/check",
    checkLicense
);

router.post(
    "/deactivate",
    deactivateLicense
);


module.exports = router;
