```javascript
"use strict";

/*
|--------------------------------------------------------------------------
| READY GYM LICENSE ADMIN
|--------------------------------------------------------------------------
| Authentication:
| - Uses sessionStorage only
| - Logout hidden when logged out
| - No localStorage/sessionStorage mixing
|
| Date handling:
| - License expiry is controlled by the server/database
| - Browser local date is NOT used to determine license validity
|--------------------------------------------------------------------------
*/

let adminToken = "";
let selectedLicenseId = null;
let allLicenses = [];


/*
|--------------------------------------------------------------------------
| DOM ELEMENTS
|--------------------------------------------------------------------------
*/

const loginSection =
    document.getElementById("loginSection");

const dashboardSection =
    document.getElementById("dashboardSection");

const adminSecretInput =
    document.getElementById("adminSecret");

const loginButton =
    document.getElementById("loginButton");

const loginMessage =
    document.getElementById("loginMessage");

const refreshButton =
    document.getElementById("refreshButton");

const createLicenseButton =
    document.getElementById("createLicenseButton");

const createMessage =
    document.getElementById("createMessage");

const licenseTableBody =
    document.getElementById("licenseTableBody");

const licenseSearch =
    document.getElementById("licenseSearch");

const licenseStatusFilter =
    document.getElementById("licenseStatusFilter");

const logoutButton =
    document.getElementById("logoutButton");

const licenseModal =
    document.getElementById("licenseModal");

const closeLicenseModal =
    document.getElementById("closeLicenseModal");

const cancelLicenseModal =
    document.getElementById("cancelLicenseModal");

const saveLicenseButton =
    document.getElementById("saveLicenseButton");

const modalCopyButton =
    document.getElementById("modalCopyButton");

const licenseModalMessage =
    document.getElementById("licenseModalMessage");

const renewMonthButton =
    document.getElementById("renewMonthButton");

const renewYearButton =
    document.getElementById("renewYearButton");

const renewLicenseButton =
    document.getElementById("renewLicenseButton");

const renewalExpiresAt =
    document.getElementById("renewalExpiresAt");

const renewalDateGroup =
    document.getElementById("renewalDateGroup");

const detailPlan =
    document.getElementById("detailPlan");


/*
|--------------------------------------------------------------------------
| INITIAL AUTH CHECK
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    function () {

        updateAuthUI();

    }
);


/*
|--------------------------------------------------------------------------
| RESTORE SESSION
|--------------------------------------------------------------------------
*/

const savedAdminToken =
    sessionStorage.getItem(
        "readygym_admin_token"
    );

if (savedAdminToken) {

    adminToken =
        savedAdminToken;

    updateAuthUI();

    loadLicenses().catch(
        function () {

            logout();

        }
    );
}


/*
|--------------------------------------------------------------------------
| API HELPER
|--------------------------------------------------------------------------
*/

async function apiRequest(
    url,
    options = {}
) {

    const headers = {

        "Content-Type":
            "application/json",

        ...(options.headers || {})

    };


    if (adminToken) {

        headers.Authorization =
            `Bearer ${adminToken}`;

    }


    const response =
        await fetch(
            url,
            {
                ...options,
                headers
            }
        );


    let result = {};

    try {

        result =
            await response.json();

    } catch (error) {

        result = {};

    }


    /*
    |--------------------------------------------------------------------------
    | Unauthorized
    |--------------------------------------------------------------------------
    */

    if (
        response.status ===
        401
    ) {

        logout();

        throw new Error(
            "Admin session expired. Please login again."
        );

    }


    if (!response.ok) {

        throw new Error(
            result.message ||
            "Request failed"
        );

    }


    return result;
}


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

if (loginButton) {

    loginButton.addEventListener(
        "click",
        async function () {

            const secret =
                adminSecretInput.value.trim();


            if (!secret) {

                loginMessage.textContent =
                    "Please enter admin secret.";

                return;

            }


            loginButton.disabled =
                true;

            loginMessage.textContent =
                "Logging in...";


            try {

                const response =
                    await fetch(
                        "/api/admin/login",
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    secret
                                })
                        }
                    );


                const result =
                    await response.json();


                if (
                    !response.ok ||
                    !result.success
                ) {

                    throw new Error(
                        result.message ||
                        "Login failed"
                    );

                }


                /*
                |--------------------------------------------------------------------------
                | Save JWT
                |--------------------------------------------------------------------------
                */

                adminToken =
                    result.token;


                sessionStorage.setItem(
                    "readygym_admin_token",
                    adminToken
                );


                adminSecretInput.value =
                    "";


                loginMessage.textContent =
                    "";


                updateAuthUI();


                await loadLicenses();


            } catch (error) {

                adminToken =
                    "";

                sessionStorage.removeItem(
                    "readygym_admin_token"
                );


                updateAuthUI();


                loginMessage.textContent =
                    error.message;


            } finally {

                loginButton.disabled =
                    false;

            }

        }
    );

}


/*
|--------------------------------------------------------------------------
| AUTH UI
|--------------------------------------------------------------------------
*/

function updateAuthUI() {

    const token =
        sessionStorage.getItem(
            "readygym_admin_token"
        );


    /*
    |--------------------------------------------------------------------------
    | LOGGED IN
    |--------------------------------------------------------------------------
    */

    if (token) {

        if (loginSection) {

            loginSection.hidden =
                true;

        }


        if (dashboardSection) {

            dashboardSection.hidden =
                false;

        }


        if (logoutButton) {

            logoutButton.hidden =
                false;

        }


        if (refreshButton) {

            refreshButton.hidden =
                false;

        }

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | LOGGED OUT
    |--------------------------------------------------------------------------
    */

    if (loginSection) {

        loginSection.hidden =
            false;

    }


    if (dashboardSection) {

        dashboardSection.hidden =
            true;

    }


    if (logoutButton) {

        logoutButton.hidden =
            true;

    }


    if (refreshButton) {

        refreshButton.hidden =
            true;

    }

}


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        function () {

            logout();

        }
    );

}


function logout() {

    adminToken =
        "";

    sessionStorage.removeItem(
        "readygym_admin_token"
    );


    /*
    |--------------------------------------------------------------------------
    | Clear current data
    |--------------------------------------------------------------------------
    */

    allLicenses =
        [];

    selectedLicenseId =
        null;


    /*
    |--------------------------------------------------------------------------
    | Close modal if open
    |--------------------------------------------------------------------------
    */

    if (licenseModal) {

        licenseModal.hidden =
            true;

    }


    document.body.style.overflow =
        "";


    /*
    |--------------------------------------------------------------------------
    | Update screen
    |--------------------------------------------------------------------------
    */

    updateAuthUI();


    if (loginMessage) {

        loginMessage.textContent =
            "Please login again.";

    }

}


/*
|--------------------------------------------------------------------------
| LOAD LICENSES
|--------------------------------------------------------------------------
*/

async function loadLicenses() {

    const result =
        await apiRequest(
            "/api/license/admin/list"
        );


    allLicenses =
        result.licenses || [];


    renderStatistics(
        allLicenses
    );


    applyLicenseFilters();

}


/*
|--------------------------------------------------------------------------
| STATISTICS
|--------------------------------------------------------------------------
*/

function renderStatistics(
    licenses
) {

    const total =
        licenses.length;


    const active =
        licenses.filter(
            license =>
                license.status ===
                "active"
        ).length;


    const inactive =
        licenses.filter(
            license =>
                license.status ===
                "inactive"
        ).length;


    const suspended =
        licenses.filter(
            license =>
                license.status ===
                "suspended"
        ).length;


    const revoked =
        licenses.filter(
            license =>
                license.status ===
                "revoked"
        ).length;


    const totalElement =
        document.getElementById(
            "totalLicenses"
        );

    const activeElement =
        document.getElementById(
            "activeLicenses"
        );

    const inactiveElement =
        document.getElementById(
            "inactiveLicenses"
        );

    const suspendedElement =
        document.getElementById(
            "suspendedLicenses"
        );

    const revokedElement =
        document.getElementById(
            "revokedLicenses"
        );


    if (totalElement)
        totalElement.textContent =
            total;


    if (activeElement)
        activeElement.textContent =
            active;


    if (inactiveElement)
        inactiveElement.textContent =
            inactive;


    if (suspendedElement)
        suspendedElement.textContent =
            suspended;


    if (revokedElement)
        revokedElement.textContent =
            revoked;

}


/*
|--------------------------------------------------------------------------
| RENDER LICENSES
|--------------------------------------------------------------------------
*/

function renderLicenses(
    licenses
) {

    if (!licenseTableBody) {
        return;
    }


    licenseTableBody.innerHTML =
        "";


    if (!licenses.length) {

        licenseTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    No licenses found.
                </td>
            </tr>
        `;

        return;

    }


    licenses.forEach(
        function (license) {

            const row =
                document.createElement(
                    "tr"
                );


            const created =
                license.createdAt
                    ? formatDateTime(
                        license.createdAt
                    )
                    : "-";


            const store =
                license.shopDomain ||
                "Not activated";


            let actionHtml =
                "";


            /*
            |--------------------------------------------------------------------------
            | Status action
            |--------------------------------------------------------------------------
            */

            if (
                license.status ===
                "active"
            ) {

                actionHtml = `
                    <button
                        class="small-button small-suspend"
                        onclick="suspendLicense('${license._id}')"
                    >
                        Suspend
                    </button>
                `;

            } else if (
                license.status ===
                "inactive"
            ) {

                actionHtml = `
                    <button
                        class="small-button small-activate"
                        onclick="activateLicense('${license._id}')"
                    >
                        Activate
                    </button>
                `;

            } else if (
                license.status ===
                "suspended"
            ) {

                actionHtml = `
                    <button
                        class="small-button small-activate"
                        onclick="unsuspendLicense('${license._id}')"
                    >
                        Unsuspend
                    </button>
                `;

            } else {

                actionHtml = `
                    <span>
                        No action
                    </span>
                `;

            }


            /*
            |--------------------------------------------------------------------------
            | Revoke button
            |--------------------------------------------------------------------------
            */

            const revokeHtml =
                license.status !==
                    "revoked" &&
                license.status !==
                    "expired"

                    ? `
                        <button
                            class="small-button revoke-button"
                            onclick="revokeLicense('${license._id}')"
                        >
                            Revoke
                        </button>
                    `
                    : "";


            row.innerHTML = `

                <td>
                    <span class="license-key">
                        ${escapeHtml(
                            license.licenseKey
                        )}
                    </span>
                </td>

                <td>
                    ${escapeHtml(
                        store
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        license.plan
                    )}
                </td>

                <td>
                    <span class="status status-${escapeHtml(
                        license.status
                    )}">
                        ${escapeHtml(
                            license.status
                        )}
                    </span>
                </td>

                <td>
                    ${created}
                </td>

                <td>

                    <div class="actions">

                        <button
                            class="small-button view-button"
                            onclick="viewLicense('${license._id}')"
                        >
                            View
                        </button>

                        <button
                            class="small-button copy-button"
                            onclick="copyLicenseKey('${license.licenseKey}')"
                        >
                            Copy
                        </button>

                        ${actionHtml}

                        ${revokeHtml}

                    </div>

                </td>
            `;


            licenseTableBody.appendChild(
                row
            );

        }
    );

}


/*
|--------------------------------------------------------------------------
| CREATE LICENSE
|--------------------------------------------------------------------------
*/

if (createLicenseButton) {

    createLicenseButton.addEventListener(
        "click",
        async function () {

            createMessage.textContent =
                "Creating license...";


            createLicenseButton.disabled =
                true;


            try {

                const plan =
                    document.getElementById(
                        "licensePlan"
                    ).value;


                const themeName =
                    document.getElementById(
                        "themeName"
                    ).value.trim() ||
                    "Ready Gym";


                const expiresAt =
                    document.getElementById(
                        "licenseExpiresAt"
                    ).value;


                const result =
                    await apiRequest(
                        "/api/license/create",
                        {
                            method:
                                "POST",

                            body:
                                JSON.stringify({
                                    plan,
                                    themeName,
                                    expiresAt:
                                        expiresAt ||
                                        null
                                })
                        }
                    );


                createMessage.textContent =
                    `License created: ${result.license.licenseKey}`;


                await loadLicenses();


            } catch (error) {

                createMessage.textContent =
                    error.message;

            } finally {

                createLicenseButton.disabled =
                    false;

            }

        }
    );

}


/*
|--------------------------------------------------------------------------
| SUSPEND
|--------------------------------------------------------------------------
*/

async function suspendLicense(
    id
) {

    if (
        !confirm(
            "Are you sure you want to suspend this license?"
        )
    ) {

        return;

    }


    try {

        await apiRequest(
            `/api/license/admin/${id}/suspend`,
            {
                method:
                    "PATCH"
            }
        );


        await loadLicenses();


    } catch (error) {

        alert(
            error.message
        );

    }

}


/*
|--------------------------------------------------------------------------
| UNSUSPEND
|--------------------------------------------------------------------------
*/

async function unsuspendLicense(
    id
) {

    try {

        await apiRequest(
            `/api/license/admin/${id}/unsuspend`,
            {
                method:
                    "PATCH"
            }
        );


        await loadLicenses();


    } catch (error) {

        alert(
            error.message
        );

    }

}


/*
|--------------------------------------------------------------------------
| ACTIVATE
|--------------------------------------------------------------------------
*/

async function activateLicense(
    id
) {

    try {

        await apiRequest(
            `/api/license/admin/${id}/activate`,
            {
                method:
                    "PATCH"
            }
        );


        await loadLicenses();


    } catch (error) {

        alert(
            error.message
        );

    }

}


/*
|--------------------------------------------------------------------------
| DEACTIVATE
|--------------------------------------------------------------------------
*/

async function deactivateLicense(
    id
) {

    if (
        !confirm(
            "Deactivate this license?"
        )
    ) {

        return;

    }


    try {

        await apiRequest(
            `/api/license/admin/${id}/deactivate`,
            {
                method:
                    "PATCH"
            }
        );


        await loadLicenses();


    } catch (error) {

        alert(
            error.message
        );

    }

}


/*
|--------------------------------------------------------------------------
| REVOKE
|--------------------------------------------------------------------------
*/

async function revokeLicense(
    id
) {

    const license =
        allLicenses.find(
            item =>
                String(
                    item._id
                ) ===
                String(id)
        );


    if (!license) {

        alert(
            "License not found."
        );

        return;

    }


    const confirmed =
        confirm(
            `Are you sure you want to permanently revoke license ${license.licenseKey}?\n\n` +
            `This will invalidate the current activation and the license cannot be activated again.`
        );


    if (!confirmed) {
        return;
    }


    try {

        await apiRequest(
            `/api/license/admin/${id}/revoke`,
            {
                method:
                    "PATCH"
            }
        );


        await loadLicenses();


        alert(
            "License revoked successfully."
        );


    } catch (error) {

        alert(
            error.message
        );

    }

}


/*
|--------------------------------------------------------------------------
| REFRESH
|--------------------------------------------------------------------------
*/

if (refreshButton) {

    refreshButton.addEventListener(
        "click",
        async function () {

            try {

                await loadLicenses();

            } catch (error) {

                alert(
                    error.message
                );

            }

        }
    );

}


/*
|--------------------------------------------------------------------------
| SEARCH / FILTER
|--------------------------------------------------------------------------
*/

function applyLicenseFilters() {

    if (
        !licenseSearch ||
        !licenseStatusFilter
    ) {

        return;

    }


    const search =
        licenseSearch.value
            .trim()
            .toLowerCase();


    const status =
        licenseStatusFilter.value;


    const filtered =
        allLicenses.filter(
            function (license) {

                const key =
                    (
                        license.licenseKey ||
                        ""
                    ).toLowerCase();


                const store =
                    (
                        license.shopDomain ||
                        ""
                    ).toLowerCase();


                const matchesSearch =
                    !search ||
                    key.includes(search) ||
                    store.includes(search);


                const matchesStatus =
                    status === "all" ||
                    license.status === status;


                return (
                    matchesSearch &&
                    matchesStatus
                );

            }
        );


    renderLicenses(
        filtered
    );

}


if (licenseSearch) {

    licenseSearch.addEventListener(
        "input",
        applyLicenseFilters
    );

}


if (licenseStatusFilter) {

    licenseStatusFilter.addEventListener(
        "change",
        applyLicenseFilters
    );

}


/*
|--------------------------------------------------------------------------
| COPY LICENSE
|--------------------------------------------------------------------------
*/

async function copyLicenseKey(
    licenseKey
) {

    try {

        await navigator.clipboard.writeText(
            licenseKey
        );


        alert(
            "License key copied."
        );


    } catch (error) {

        alert(
            "Unable to copy license key."
        );

    }

}


/*
|--------------------------------------------------------------------------
| VIEW LICENSE
|--------------------------------------------------------------------------
*/

function viewLicense(
    id
) {

    const license =
        allLicenses.find(
            item =>
                String(
                    item._id
                ) ===
                String(id)
        );


    if (!license) {

        alert(
            "License not found."
        );

        return;

    }


    selectedLicenseId =
        license._id;


    document.getElementById(
        "detailLicenseKey"
    ).value =
        license.licenseKey || "";


    document.getElementById(
        "detailShopDomain"
    ).value =
        license.shopDomain ||
        "Not activated";


    document.getElementById(
        "detailThemeName"
    ).value =
        license.themeName ||
        "Ready Gym";


    detailPlan.value =
        license.plan ||
        "lifetime";


    document.getElementById(
        "detailStatus"
    ).value =
        license.status ||
        "";


    document.getElementById(
        "detailExpiresAt"
    ).value =
        formatDateForInput(
            license.expiresAt
        );


    document.getElementById(
        "detailCreatedAt"
    ).value =
        formatDateTime(
            license.createdAt
        );


    document.getElementById(
        "detailActivatedAt"
    ).value =
        formatDateTime(
            license.activatedAt
        );


    document.getElementById(
        "detailLastCheckedAt"
    ).value =
        formatDateTime(
            license.lastCheckedAt
        );


    document.getElementById(
        "detailTokenVersion"
    ).value =
        license.tokenVersion ??
        0;


    if (renewalExpiresAt) {

        renewalExpiresAt.value =
            formatDateForInput(
                license.expiresAt
            );

    }


    licenseModalMessage.textContent =
        "";


    toggleExpirationField();


    licenseModal.hidden =
        false;


    document.body.style.overflow =
        "hidden";

}


/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
| IMPORTANT:
| These functions ONLY format the stored server/database date.
| They do NOT decide whether the license is expired.
|
| Actual expiration decision happens on Node.js server:
|
| new Date() >= new Date(license.expiresAt)
|--------------------------------------------------------------------------
*/

function formatDateForInput(
    value
) {

    if (!value) {
        return "";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    /*
    |--------------------------------------------------------------------------
    | Use UTC values from the stored ISO date.
    |--------------------------------------------------------------------------
    */

    const year =
        date.getUTCFullYear();


    const month =
        String(
            date.getUTCMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            date.getUTCDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


function formatDateTime(
    value
) {

    if (!value) {

        return "Never";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Never";

    }


    /*
    |--------------------------------------------------------------------------
    | Display stored server date.
    |--------------------------------------------------------------------------
    */

    return date.toISOString();

}


/*
|--------------------------------------------------------------------------
| MODAL CLOSE
|--------------------------------------------------------------------------
*/

function closeLicenseModalWindow() {

    if (licenseModal) {

        licenseModal.hidden =
            true;

    }


    document.body.style.overflow =
        "";


    selectedLicenseId =
        null;

}


if (closeLicenseModal) {

    closeLicenseModal.addEventListener(
        "click",
        closeLicenseModalWindow
    );

}


if (cancelLicenseModal) {

    cancelLicenseModal.addEventListener(
        "click",
        closeLicenseModalWindow
    );

}


if (licenseModal) {

    const overlay =
        licenseModal.querySelector(
            ".modal-overlay"
        );


    if (overlay) {

        overlay.addEventListener(
            "click",
            closeLicenseModalWindow
        );

    }

}


/*
|--------------------------------------------------------------------------
| LIFETIME PLAN HANDLING
|--------------------------------------------------------------------------
*/

if (detailPlan) {

    detailPlan.addEventListener(
        "change",
        toggleExpirationField
    );

}


function toggleExpirationField() {

    const expiresInput =
        document.getElementById(
            "detailExpiresAt"
        );


    if (
        !expiresInput ||
        !detailPlan
    ) {

        return;

    }


    if (
        detailPlan.value ===
        "lifetime"
    ) {

        expiresInput.value =
            "";

        expiresInput.disabled =
            true;


        if (renewalDateGroup) {

            renewalDateGroup.style.display =
                "none";

        }


        if (renewLicenseButton) {

            renewLicenseButton.style.display =
                "none";

        }

    } else {

        expiresInput.disabled =
            false;


        if (renewalDateGroup) {

            renewalDateGroup.style.display =
                "flex";

        }


        if (renewLicenseButton) {

            renewLicenseButton.style.display =
                "inline-block";

        }

    }

}


/*
|--------------------------------------------------------------------------
| SAVE LICENSE CHANGES
|--------------------------------------------------------------------------
*/

if (saveLicenseButton) {

    saveLicenseButton.addEventListener(
        "click",
        async function () {

            if (!selectedLicenseId) {
                return;
            }


            saveLicenseButton.disabled =
                true;


            licenseModalMessage.textContent =
                "Saving changes...";


            try {

                const plan =
                    detailPlan.value;


                const themeName =
                    document.getElementById(
                        "detailThemeName"
                    ).value.trim();


                const expiresAt =
                    document.getElementById(
                        "detailExpiresAt"
                    ).value;


                const result =
                    await apiRequest(
                        `/api/license/admin/${selectedLicenseId}/update`,
                        {
                            method:
                                "PATCH",

                            body:
                                JSON.stringify({

                                    plan,

                                    themeName,

                                    expiresAt:
                                        plan ===
                                        "lifetime"
                                            ? null
                                            : (
                                                expiresAt ||
                                                null
                                            )

                                })
                        }
                    );


                licenseModalMessage.textContent =
                    result.message ||
                    "License updated successfully.";


                await loadLicenses();


                setTimeout(
                    function () {

                        closeLicenseModalWindow();

                    },
                    700
                );


            } catch (error) {

                licenseModalMessage.textContent =
                    error.message;

            } finally {

                saveLicenseButton.disabled =
                    false;

            }

        }
    );

}


/*
|--------------------------------------------------------------------------
| COPY FROM MODAL
|--------------------------------------------------------------------------
*/

if (modalCopyButton) {

    modalCopyButton.addEventListener(
        "click",
        async function () {

            const key =
                document.getElementById(
                    "detailLicenseKey"
                ).value;


            try {

                await navigator.clipboard.writeText(
                    key
                );


                licenseModalMessage.textContent =
                    "License key copied.";


            } catch (error) {

                licenseModalMessage.textContent =
                    "Unable to copy license key.";

            }

        }
    );

}


/*
|--------------------------------------------------------------------------
| RENEW LICENSE
|--------------------------------------------------------------------------
*/

async function renewLicenseUntil(
    newDate,
    label
) {

    if (!selectedLicenseId) {
        return;
    }


    const confirmed =
        confirm(
            `Renew this license for ${label}?\n\nNew expiration: ${newDate}`
        );


    if (!confirmed) {
        return;
    }


    if (renewMonthButton)
        renewMonthButton.disabled =
            true;


    if (renewYearButton)
        renewYearButton.disabled =
            true;


    if (renewLicenseButton)
        renewLicenseButton.disabled =
            true;


    licenseModalMessage.textContent =
        "Renewing license...";


    try {

        const result =
            await apiRequest(
                `/api/license/admin/${selectedLicenseId}/update`,
                {
                    method:
                        "PATCH",

                    body:
                        JSON.stringify({

                            plan:
                                detailPlan.value,

                            expiresAt:
                                newDate,

                            renew:
                                true

                        })
                }
            );


        licenseModalMessage.textContent =
            result.message ||
            "License renewed successfully.";


        await loadLicenses();


        setTimeout(
            function () {

                closeLicenseModalWindow();

            },
            700
        );


    } catch (error) {

        licenseModalMessage.textContent =
            error.message;

    } finally {

        if (renewMonthButton)
            renewMonthButton.disabled =
                false;


        if (renewYearButton)
            renewYearButton.disabled =
                false;


        if (renewLicenseButton)
            renewLicenseButton.disabled =
                false;

    }

}


/*
|--------------------------------------------------------------------------
| RENEW 1 MONTH
|--------------------------------------------------------------------------
*/

if (renewMonthButton) {

    renewMonthButton.addEventListener(
        "click",
        function () {

            const license =
                allLicenses.find(
                    item =>
                        String(
                            item._id
                        ) ===
                        String(
                            selectedLicenseId
                        )
                );


            let date;


            /*
            |--------------------------------------------------------------------------
            | If current expiry exists and is still in future,
            | extend from that expiry.
            |--------------------------------------------------------------------------
            */

            if (
                license &&
                license.expiresAt &&
                new Date(
                    license.expiresAt
                ).getTime() >
                    Date.now()
            ) {

                date =
                    new Date(
                        license.expiresAt
                    );

            } else {

                date =
                    new Date();

            }


            date.setUTCMonth(
                date.getUTCMonth() + 1
            );


            renewLicenseUntil(
                formatDateForInput(
                    date
                ),
                "1 month"
            );

        }
    );

}


/*
|--------------------------------------------------------------------------
| RENEW 1 YEAR
|--------------------------------------------------------------------------
*/

if (renewYearButton) {

    renewYearButton.addEventListener(
        "click",
        function () {

            const license =
                allLicenses.find(
                    item =>
                        String(
                            item._id
                        ) ===
                        String(
                            selectedLicenseId
                        )
                );


            let date;


            if (
                license &&
                license.expiresAt &&
                new Date(
                    license.expiresAt
                ).getTime() >
                    Date.now()
            ) {

                date =
                    new Date(
                        license.expiresAt
                    );

            } else {

                date =
                    new Date();

            }


            date.setUTCFullYear(
                date.getUTCFullYear() + 1
            );


            renewLicenseUntil(
                formatDateForInput(
                    date
                ),
                "1 year"
            );

        }
    );

}


/*
|--------------------------------------------------------------------------
| CUSTOM RENEWAL
|--------------------------------------------------------------------------
*/

if (renewLicenseButton) {

    renewLicenseButton.addEventListener(
        "click",
        function () {

            const newDate =
                renewalExpiresAt.value;


            if (!newDate) {

                licenseModalMessage.textContent =
                    "Please select a renewal date.";

                return;

            }


            renewLicenseUntil(
                newDate,
                "custom period"
            );

        }
    );

}


/*
|--------------------------------------------------------------------------
| HTML ESCAPING
|--------------------------------------------------------------------------
*/

function escapeHtml(
    value
) {

    return String(
        value
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}
```
