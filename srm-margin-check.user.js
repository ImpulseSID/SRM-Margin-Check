// ==UserScript==
// @name         SRM Margin Check (v1.3.0)
// @namespace    https://github.com/ImpulseSID/SRM-Margin-Check
// @version      1.3.0
// @description  Makes academia and student portal more user-friendly. See attendance margin right on the official website.
// @author       ImpulseSID
// @match        https://sp.srmist.edu.in/*
// @match        https://academia.srmist.edu.in/*
// @icon         https://lh3.googleusercontent.com/A-p-k-2-p-E-p-E-A=w128-h128-e365-s0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/ImpulseSID/SRM-Margin-Check/main/srm-margin-check.user.js
// @updateURL    https://raw.githubusercontent.com/ImpulseSID/SRM-Margin-Check/main/srm-margin-check.user.js
// ==/UserScript==

(function() {
    'use strict';

    if (window.self !== window.top) {
        console.log("SRM Margin Check: Stopping execution in iframe.");
        return;
    }

    console.log("SRM Margin Check: Script starting (v1.3.0)...");

    const SUBJECTMAP = {};

    function calculateMargin(totalConducted, absent) {
        totalConducted = Number(totalConducted);
        absent = Number(absent);

        if (isNaN(totalConducted) || isNaN(absent) || totalConducted === 0) {
            return "N/A";
        }

        let margin = 0;
        let present = totalConducted - absent;
        let current = (present / totalConducted) * 100;
        let conducted = totalConducted;

        if (current > 75) {
            while (current >= 75) {
                conducted++;
                margin++;
                current = (present / conducted) * 100;
            }
            margin--;
        } else {
            while (current < 75) {
                conducted++;
                margin--;
                present++;
                current = (present / conducted) * 100;
            }
        }

        return margin;
    }

    async function waitForElement(selector) {
        if (typeof selector !== "string") {
            throw new Error("SRM Margin Check: Selector must be a string.");
        }

        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`SRM Margin Check: Timeout waiting for element: ${selector}`));
            }, 10000);
        });
    }

    async function applyMagicToStudentPortal() {
        console.log("SRM Margin Check: Applying to Student Portal (sp.srmist.edu.in)...");
        try {
            const attendanceTable = await waitForElement(
                "#divMainDetails > div.container.mt-4 > div.card.mb-4 > div.card-body.p-0 > div > table"
            );
            const rows = attendanceTable.querySelectorAll(".card-body table tbody tr");
            const head = attendanceTable.querySelector(
                "#divMainDetails > div.container.mt-4 > div.card.mb-4 > div.card-body.p-0 > div > table > thead > tr"
            );

            let marginExists = Array.from(head.cells).some(cell => cell.textContent.trim() === "Margin");

            if (!marginExists) {
                const headCell = document.createElement("td");
                headCell.innerHTML = "<strong>Margin</strong>";
                head.append(headCell);
            }

            for (const row of rows) {
                if (row.classList.contains("margin-processed")) continue;

                const hoursConductedS = row.cells[2].textContent;
                const absentS = row.cells[4].textContent;
                const margin = calculateMargin(hoursConductedS, absentS);

                const cell = document.createElement("td");
                cell.textContent = `${margin}`;

                if (margin < 0) {
                    cell.style.color = "red";
                }
                row.appendChild(cell);
                row.classList.add("margin-processed");
            }
        } catch (error) {
            console.error("SRM Margin Check: Error applying magic to Student Portal:", error);
        }
    }

    async function applyMagicToAcademiaPortal() {
        console.log("SRM Margin Check: Applying to Academia Portal (academia.srmist.edu.in)...");
        try {
            const currentUrl = window.location.href;

            if (currentUrl.includes("#Page:My_Time_Table_2023_24")) {
                const table = await waitForElement("#zc-viewcontainer_My_Time_Table_2023_24 > div > div.cntdDiv > div > table.course_tbl");
                const rows = table.querySelectorAll("tbody tr:not(:first-child)");

                for (const row of rows) {
                    if (row.cells.length < 8) continue;
                    const facultyNameCell = row.cells[7];
                    if (facultyNameCell.querySelector("a")) continue;

                    const facultyName = facultyNameCell.textContent.trim();
                    const facultyUrl = convertFacultyNameToUrl(facultyName);

                    if (facultyUrl) {
                        const link = document.createElement("a");
                        link.href = facultyUrl;
                        link.textContent = facultyName;
                        link.target = "_blank";
                        facultyNameCell.innerHTML = "";
                        facultyNameCell.appendChild(link);
                    }
                }
            } else if (currentUrl.includes("#Page:My_Attendance")) {
                const attendanceTable = await waitForElement("table[bgcolor='#FAFAD2']");
                const marksTable = document.querySelector("p + table");
                const rows = attendanceTable.querySelectorAll("tbody tr:not(:first-child)");
                const head = attendanceTable.querySelector("tbody tr:first-child");

                if (!head) return;

                // Dynamically find correct column indexes
                let hoursIdx = -1, absentIdx = -1, marginIdx = -1;

                Array.from(head.children).forEach((cell, i) => {
                    const text = cell.textContent.trim().toLowerCase();
                    if (text.includes("hours conducted") || text === "conducted") hoursIdx = i;
                    if (text.includes("hours absent") || text === "absent") absentIdx = i;
                    if (text === "margin") marginIdx = i;
                });

                // Add margin header if it isn't native to the site
                if (marginIdx === -1) {
                    const headCell = document.createElement("td");
                    headCell.id = "margin-head";
                    headCell.innerHTML = "<strong>Margin</strong>";
                    head.appendChild(headCell);
                    marginIdx = head.children.length - 1;
                }

                for (const row of rows) {
                    // Replaced length check with class guard to prevent skipping valid long rows
                    if (row.classList.contains("margin-processed")) continue;

                    const subjectCode = row.cells[0]?.innerHTML.split("<br>")[0].trim() || "";
                    const subjectName = row.cells[1]?.textContent.trim() || "";
                    if (subjectCode) SUBJECTMAP[subjectCode] = subjectName;

                    const hoursConductedS = hoursIdx !== -1 ? row.cells[hoursIdx]?.textContent : "0";
                    const absentS = absentIdx !== -1 ? row.cells[absentIdx]?.textContent : "0";
                    const margin = calculateMargin(hoursConductedS, absentS);

                    let marginCell = row.cells[marginIdx];
                    if (!marginCell) {
                        marginCell = document.createElement("td");
                        row.appendChild(marginCell);
                    }

                    marginCell.textContent = `${margin}`;
                    if (margin < 0) marginCell.style.color = "red";
                    marginCell.style.backgroundColor = "#E6E6FA";

                    row.classList.add("margin-processed");
                }

                // Marks Table Processing
                if (marksTable) {
                    const marksRows = marksTable.querySelectorAll("tbody tr:not(:first-child)");
                    for (const row of marksRows) {
                        const subjectCodeCell = row.cells[0];
                        if (!subjectCodeCell) continue;
                        const subjectCode = subjectCodeCell.textContent.trim();

                        if (SUBJECTMAP[subjectCode] && !subjectCodeCell.textContent.includes(SUBJECTMAP[subjectCode])) {
                            subjectCodeCell.innerHTML += `<br><span style="font-size: 0.8em; color: gray;">${SUBJECTMAP[subjectCode]}</span>`;
                            subjectCodeCell.style.textAlign = "left";
                        }

                        const nestedTable = row.querySelector("table table");
                        if (!nestedTable || nestedTable.querySelector(".margin-check-total")) continue;

                        nestedTable.style.width = "100%";
                        const cells = nestedTable.querySelectorAll('td font[size="1.5"]');
                        if (cells.length === 0) continue;

                        let sum = 0, totalMarks = 0;
                        for (const cell of cells) {
                            const numberStr = cell.innerHTML.substring(cell.innerHTML.lastIndexOf("<br>") + 4);
                            const maxStr = cell.innerHTML.substring(cell.innerHTML.indexOf("/") + 1, cell.innerHTML.indexOf("</strong>"));

                            const number = Number.parseFloat(numberStr);
                            const max = Number.parseFloat(maxStr);

                            if (!Number.isNaN(number)) sum += number;
                            if (!Number.isNaN(max)) totalMarks += max;
                        }

                        const totalCell = document.createElement("td");
                        totalCell.className = "margin-check-total";
                        totalCell.innerHTML = `<strong>${sum.toFixed(2)}</strong> / ${totalMarks.toFixed(2)}`;
                        totalCell.setAttribute("colspan", cells.length);
                        totalCell.style.textAlign = "center";
                        nestedTable.appendChild(totalCell);
                    }
                }
            }
        } catch (error) {
            console.error("SRM Margin Check: Error applying magic to Academia Portal:", error);
        }
    }

    function convertFacultyNameToUrl(facultyName) {
        if (!facultyName) return null;
        const nameWithoutId = facultyName.replace(/\s*\(?\d+\)?.*$/, "").trim();
        const formattedName = nameWithoutId.toLowerCase().replace(/[\s.]+/g, "-").replace(/--+/g, "-").replace(/(^-|-$)/g, "");
        return `https://www.srmist.edu.in/faculty/${formattedName}/`;
    }

    async function main() {
        const hostname = window.location.hostname;

        if (hostname === "academia.srmist.edu.in") {
            await applyMagicToAcademiaPortal();
            let currentUrl = window.location.href;

            window.addEventListener("hashchange", () => {
                const newUrl = window.location.href;
                if (newUrl !== currentUrl) {
                    currentUrl = newUrl;
                    if (currentUrl.includes("#Page:My_Attendance") || currentUrl.includes("#Page:My_Time_Table_2023_24")) {
                        setTimeout(() => applyMagicToAcademiaPortal(), 500);
                    }
                }
            });

        } else if (hostname === "sp.srmist.edu.in") {
            await applyMagicToStudentPortal();
        }
    }

    main();
})();
