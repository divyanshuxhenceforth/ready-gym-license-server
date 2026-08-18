"use strict";

let adminToken = "";

const loginSection =
    document.getElementById(
        "loginSection"
    );

const dashboardSection =
    document.getElementById(
        "dashboardSection"
    );

const adminSecretInput =
    document.getElementById(
        "adminSecret"
    );

const loginButton =
    document.getElementById(
        "loginButton"
    );

const loginMessage =
    document.getElementById(
        "loginMessage"
    );

const refreshButton =
    document.getElementById(
        "refreshButton"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );

const createLicenseButton =
    document.getElementById(
        "createLicenseButton"
    );

const createMessage =
    document.getElementById(
        "createMessage"
    );

const licenseTableBody =
    document.getElementById(
        "licenseTableBody"
    );

const licenseSearch =
    document.getElementById(
        "licenseSearch"
    );

const licenseStatusFilter =
    document.getElementById(
        "licenseStatusFilter"
    );

const licenseModal =
    document.getElementById(
        "licenseModal"
    );

const closeLicenseModal =
    document.getElementById(
        "closeLicenseModal"
    );

const cancelLicenseModal =
    document.getElementById(
        "cancelLicenseModal"
    );

const saveLicenseButton =
    document.getElementById(
        "saveLicenseButton"
    );

const modalCopyButton =
    document.getElementById(
        "modalCopyButton"
    );

const licenseModalMessage =
    document.getElementById(
        "licenseModalMessage"
    );

const renewMonthButton =
    document.getElementById(
        "renewMonthButton"
    );

const renewYearButton =
    document.getElementById(
        "renewYearButton"
    );

const renewLicenseButton =
    document.getElementById(
        "renewLicenseButton"
    );

const renewalExpiresAt =
    document.getElementById(
        "renewalExpiresAt"
    );

const renewalDateGroup =
    document.getElementById(
        "renewalDateGroup"
    );

const detailPlan =
    document.getElementById(
        "detailPlan"
    );

let selectedLicenseId = null;

let allLicenses = [];


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
            loginSection.hidden = true;
        }

        if (dashboardSection) {
            dashboardSection.hidden = false;
        }

        if (logoutButton) {
            logoutButton.hidden = false;
        }

        if (refreshButton) {
            refreshButton.hidden = false;
        }

    }

    /*
    |--------------------------------------------------------------------------
    | LOGGED OUT
    |--------------------------------------------------------------------------
    */

    else {

        if (loginSection) {
            loginSection.hidden = false;
        }

        if (dashboardSection) {
            dashboardSection.hidden = true;
        }

        if (logoutButton) {
            logoutButton.hidden = true;
        }

        if (refreshButton) {
            refreshButton.hidden = true;
        }
    }
}


/*
|--------------------------------------------------------------------------
| RESTORE ADMIN SESSION
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

    loadLicenses()
        .catch(() => {
            logout();
        });

} else {

    updateAuthUI();

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

        ...(options.headers || {}),

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
                headers,
            }
        );

    const result =
        await response.json();

    /*
    |--------------------------------------------------------------------------
    | ADMIN SESSION EXPIRED
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
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                secret,
                            }),
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

            adminToken =
                result.token;

            /*
            |--------------------------------------------------------------------------
            | STORE ADMIN JWT
            |--------------------------------------------------------------------------
            */

            sessionStorage.setItem(
                "readygym_admin_token",
                adminToken
            );

            adminSecretInput.value =
                "";

            /*
            |--------------------------------------------------------------------------
            | UPDATE AUTH UI
            |--------------------------------------------------------------------------
            */

            updateAuthUI();

            await loadLicenses();

        } catch (error) {

            loginMessage.textContent =
                error.message;

            adminToken =
                "";

            updateAuthUI();

        } finally {

            loginButton.disabled =
                false;

        }

    }
);


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
            (license) =>
                license.status ===
                "active"
        ).length;

    const inactive =
        licenses.filter(
            (license) =>
                license.status ===
                "inactive"
        ).length;

    const suspended =
        licenses.filter(
            (license) =>
                license.status ===
                "suspended"
        ).length;

    const revoked =
        licenses.filter(
            (license) =>
                license.status ===
                "revoked"
        ).length;

    document.getElementById(
        "totalLicenses"
    ).textContent =
        total;

    document.getElementById(
        "activeLicenses"
    ).textContent =
        active;

    document.getElementById(
        "inactiveLicenses"
    ).textContent =
        inactive;

    document.getElementById(
        "suspendedLicenses"
    ).textContent =
        suspended;

    document.getElementById(
        "revokedLicenses"
    ).textContent =
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
        (license) => {

            const row =
                document.createElement(
                    "tr"
                );

            const created =
                license.createdAt
                    ? new Date(
                        license.createdAt
                    ).toLocaleDateString()
                    : "-";

            const store =
                license.shopDomain ||
                "Not activated";

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
                    <span class="status status-${license.status}">
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

                        ${
                            license.status ===
                            "active"

                            ? `
                                <button
                                    class="small-button small-suspend"
                                    onclick="suspendLicense('${license._id}')"
                                >
                                    Suspend
                                </button>
                            `

                            : license.status ===
                              "inactive"

                            ? `
                                <button
                                    class="small-button small-activate"
                                    onclick="activateLicense('${license._id}')"
                                >
                                    Activate
                                </button>
                            `

                            : license.status ===
                              "suspended"

                            ? `
                                <button
                                    class="small-button small-activate"
                                    onclick="unsuspendLicense('${license._id}')"
                                >
                                    Unsuspend
                                </button>
                            `

                            : `
                                <span>
                                    No action
                                </span>
                            `
                        }

                        ${
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
                            : ""
                        }

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


            const result =
                await apiRequest(
                    "/api/license/create",
                    {
                        method: "POST",

                        body:
                            JSON.stringify({
                                plan,
                                themeName
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
                method: "PATCH",
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
                method: "PATCH",
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
| REFRESH
|--------------------------------------------------------------------------
*/

refreshButton.addEventListener(
    "click",
    async function () {

        /*
        |--------------------------------------------------------------------------
        | Refresh only works while logged in
        |--------------------------------------------------------------------------
        */

        if (!adminToken) {

            updateAuthUI();

            return;

        }

        try {

            await loadLicenses();

        } catch (error) {

            alert(
                error.message
            );

        }

    }
);


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

logoutButton.addEventListener(
    "click",
    function () {

        logout();

    }
);


/*
|--------------------------------------------------------------------------
| HTML ESCAPING
|--------------------------------------------------------------------------
*/

function escapeHtml(
    value
) {

    return String(value)

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


/*
|--------------------------------------------------------------------------
| LOGOUT FUNCTION
|--------------------------------------------------------------------------
*/

function logout() {

    adminToken =
        "";

    sessionStorage.removeItem(
        "readygym_admin_token"
    );

    /*
    |--------------------------------------------------------------------------
    | Hide dashboard
    |--------------------------------------------------------------------------
    */

    dashboardSection.hidden =
        true;

    /*
    |--------------------------------------------------------------------------
    | Show login
    |--------------------------------------------------------------------------
    */

    loginSection.hidden =
        false;

    /*
    |--------------------------------------------------------------------------
    | Hide admin-only buttons
    |--------------------------------------------------------------------------
    */

    logoutButton.hidden =
        true;

    refreshButton.hidden =
        true;

    loginMessage.textContent =
        "Please login again.";
}


/*
|--------------------------------------------------------------------------
| SEARCH / FILTER
|--------------------------------------------------------------------------
*/

function applyLicenseFilters() {

    const search =
        licenseSearch.value
            .trim()
            .toLowerCase();

    const status =
        licenseStatusFilter.value;

    const filtered =
        allLicenses.filter(
            (license) => {

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

licenseSearch.addEventListener(
    "input",
    applyLicenseFilters
);

licenseStatusFilter.addEventListener(
    "change",
    applyLicenseFilters
);


/*
|--------------------------------------------------------------------------
| COPY FUNCTION
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
                method: "PATCH",
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
                method: "PATCH",
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
| VIEW LICENSE
|--------------------------------------------------------------------------
*/

function viewLicense(
    id
) {

    const license =
        allLicenses.find(
            (item) =>
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
        license.licenseKey ||
        "";

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

    document.getElementById(
        "detailPlan"
    ).value =
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

    licenseModalMessage.textContent =
        "";

    /*
    |--------------------------------------------------------------------------
    | Lifetime license handling
    |--------------------------------------------------------------------------
    */
    
    toggleExpirationField();
    
    /*
    |--------------------------------------------------------------------------
    | Revoked license action handling
    |--------------------------------------------------------------------------
    */
    
    updateLicenseModalActions(
        license.status
    );
    
    licenseModal.hidden =
        false;

    renewalExpiresAt.value =
        formatDateForInput(
            license.expiresAt
        );
}


/*
|--------------------------------------------------------------------------
| DATE FORMATTING
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

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
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

    return date.toLocaleString();
}


/*
|--------------------------------------------------------------------------
| MODAL CLOSING
|--------------------------------------------------------------------------
*/

function closeLicenseModalWindow() {

    licenseModal.hidden =
        true;

    document.body.style.overflow =
        "";

    selectedLicenseId =
        null;
}

closeLicenseModal.addEventListener(
    "click",
    closeLicenseModalWindow
);

cancelLicenseModal.addEventListener(
    "click",
    closeLicenseModalWindow
);

licenseModal
    .querySelector(
        ".modal-overlay"
    )
    .addEventListener(
        "click",
        closeLicenseModalWindow
    );


/*
|--------------------------------------------------------------------------
| LIFETIME PLAN HANDLING
|--------------------------------------------------------------------------
*/

detailPlan.addEventListener(
    "change",
    toggleExpirationField
);

function toggleExpirationField() {

    const expiresInput =
        document.getElementById(
            "detailExpiresAt"
        );

    const isLifetime =
        detailPlan.value ===
        "lifetime";

    const license =
        allLicenses.find(
            (item) =>
                String(
                    item._id
                ) ===
                String(
                    selectedLicenseId
                )
        );

    const isRevoked =
        license &&
        String(
            license.status || ""
        ).toLowerCase() ===
        "revoked";


    /*
    |--------------------------------------------------------------------------
    | Lifetime
    |--------------------------------------------------------------------------
    */

    if (isLifetime) {

        expiresInput.value =
            "";

        expiresInput.disabled =
            true;

        renewalDateGroup.style.display =
            "none";

        renewLicenseButton.style.display =
            "none";

    }

    /*
    |--------------------------------------------------------------------------
    | Normal plan
    |--------------------------------------------------------------------------
    */

    else {

        expiresInput.disabled =
            false;

        /*
        |--------------------------------------------------------------------------
        | Do not show renewal controls for revoked license
        |--------------------------------------------------------------------------
        */

        if (isRevoked) {

            renewalDateGroup.style.display =
                "none";

            renewLicenseButton.style.display =
                "none";

        } else {

            renewalDateGroup.style.display =
                "flex";

            renewLicenseButton.style.display =
                "inline-block";

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Final revoked check
    |--------------------------------------------------------------------------
    |
    | This is important because `hidden` should always win.
    |
    |--------------------------------------------------------------------------
    */

    updateLicenseModalActions(
        license?.status
    );
}


/*
|--------------------------------------------------------------------------
| SAVE LICENSE CHANGES
|--------------------------------------------------------------------------
*/

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
                document.getElementById(
                    "detailPlan"
                ).value;

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
                        method: "PATCH",

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
                () => {

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


/*
|--------------------------------------------------------------------------
| COPY FROM MODAL
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| REVOKE LICENSE
|--------------------------------------------------------------------------
*/

async function revokeLicense(
    id
) {

    const license =
        allLicenses.find(
            (item) =>
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
                method: "PATCH"
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
| CUSTOM RENEWAL
|--------------------------------------------------------------------------
*/

renewLicenseButton.addEventListener(
    "click",
    async function () {

        if (!selectedLicenseId) {

            return;

        }

        const newDate =
            renewalExpiresAt.value;

        if (!newDate) {

            licenseModalMessage.textContent =
                "Please select a renewal date.";

            return;

        }

        const selectedDate =
            new Date(
                `${newDate}T23:59:59`
            );

        if (
            selectedDate <=
            new Date()
        ) {

            licenseModalMessage.textContent =
                "Renewal date must be in the future.";

            return;

        }

        const confirmed =
            confirm(
                `Renew this license until ${newDate}?`
            );

        if (!confirmed) {

            return;

        }

        renewLicenseButton.disabled =
            true;

        licenseModalMessage.textContent =
            "Renewing license...";

        try {

            const result =
                await apiRequest(
                    `/api/license/admin/${selectedLicenseId}/update`,
                    {
                        method: "PATCH",

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
                () => {

                    closeLicenseModalWindow();

                },
                700
            );

        } catch (error) {

            licenseModalMessage.textContent =
                error.message;

        } finally {

            renewLicenseButton.disabled =
                false;

        }

    }
);


/*
|--------------------------------------------------------------------------
| RENEW LICENSE UNTIL
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

    renewMonthButton.disabled =
        true;

    renewYearButton.disabled =
        true;

    renewLicenseButton.disabled =
        true;

    licenseModalMessage.textContent =
        "Renewing license...";

    try {

        const result =
            await apiRequest(
                `/api/license/admin/${selectedLicenseId}/update`,
                {
                    method: "PATCH",

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
            () => {

                closeLicenseModalWindow();

            },
            700
        );

    } catch (error) {

        licenseModalMessage.textContent =
            error.message;

    } finally {

        renewMonthButton.disabled =
            false;

        renewYearButton.disabled =
            false;

        renewLicenseButton.disabled =
            false;

    }
}


/*
|--------------------------------------------------------------------------
| RENEW 1 MONTH
|--------------------------------------------------------------------------
*/

renewMonthButton.addEventListener(
    "click",
    function () {

        const license =
            allLicenses.find(
                (item) =>
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
            ) > new Date()
        ) {

            date =
                new Date(
                    license.expiresAt
                );

        } else {

            date =
                new Date();

        }

        date.setMonth(
            date.getMonth() + 1
        );

        renewLicenseUntil(
            formatDateForInput(
                date
            ),
            "1 month"
        );

    }
);


/*
|--------------------------------------------------------------------------
| RENEW 1 YEAR
|--------------------------------------------------------------------------
*/

renewYearButton.addEventListener(
    "click",
    function () {

        const license =
            allLicenses.find(
                (item) =>
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
            ) > new Date()
        ) {

            date =
                new Date(
                    license.expiresAt
                );

        } else {

            date =
                new Date();

        }

        date.setFullYear(
            date.getFullYear() + 1
        );

        renewLicenseUntil(
            formatDateForInput(
                date
            ),
            "1 year"
        );

    }
);


function updateLicenseModalActions(status) {

    const isRevoked =
        String(
            status || ""
        ).toLowerCase() ===
        "revoked";


    if (isRevoked) {

        renewMonthButton.hidden =
            true;

        renewYearButton.hidden =
            true;

        renewLicenseButton.hidden =
            true;

        saveLicenseButton.hidden =
            true;

        renewalDateGroup.hidden =
            true;

        return;
    }


    renewMonthButton.hidden =
        false;

    renewYearButton.hidden =
        false;

    renewLicenseButton.hidden =
        false;

    saveLicenseButton.hidden =
        false;

    renewalDateGroup.hidden =
        false;
}
