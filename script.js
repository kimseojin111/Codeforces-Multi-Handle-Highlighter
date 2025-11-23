// ==UserScript==
// @name         CF Multi-ID Solved Highlighter (Contest + Problems)
// @namespace    http://tampermonkey.net/
// @version      9.0
// @match        https://codeforces.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    const handles = ["gs25", "ZmkzOWYyOHcwdWo4cj", "JinyeongAckerman"];

    const TTL_USER = 3600 * 1000;          // 1 hour
    const TTL_CONTEST = 24 * 3600 * 1000;  // 1 day

    function getCache(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data.expire || Date.now() > data.expire) return null;
            return data.value;
        } catch { return null; }
    }

    function setCache(key, value, ttl) {
        localStorage.setItem(key, JSON.stringify({
            value, expire: Date.now() + ttl
        }));
    }

    function httpGet(url) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                onload: res => {
                    try { resolve(JSON.parse(res.responseText)); }
                    catch { resolve(null); }
                }
            });
        });
    }

    async function loadSolved(handle) {
        const key = `cf_user_status_${handle}`;
        const cached = getCache(key);
        if (cached) return cached;

        const data = await httpGet(`https://codeforces.com/api/user.status?handle=${handle}`);
        setCache(key, data, TTL_USER);
        return data;
    }

    async function loadContestProblems(cid) {
        const key = `cf_contest_prob_${cid}`;
        const cached = getCache(key);
        if (cached) return cached;

        const data = await httpGet(
            `https://codeforces.com/api/contest.standings?contestId=${cid}&from=1&count=1`
        );
        setCache(key, data, TTL_CONTEST);
        return data;
    }

    /************************************************************
     * MAIN
     ************************************************************/
    async function run() {
        const userData = await Promise.all(handles.map(loadSolved));

        // solved[contestId] = Set(["A","B","C"...])
        const solved = new Map();
        for (let d of userData) {
            if (!d || d.status !== "OK") continue;
            for (let sub of d.result) {
                if (sub.verdict === "OK") {
                    const cid = sub.problem.contestId;
                    const idx = sub.problem.index;
                    if (!solved.has(cid)) solved.set(cid, new Set());
                    solved.get(cid).add(idx);
                }
            }
        }

        //
        // ① Contest page highlighting (Solved: X out of Y)
        //
        if (location.pathname.startsWith("/contests")
            || location.pathname.startsWith("/contest")) {

            const rows = document.querySelectorAll("tr[data-contestid]");
            const cids = [...new Set([...rows].map(r => Number(r.dataset.contestid)))];
            const problemInfo = await Promise.all(cids.map(loadContestProblems));

            const totalMap = new Map();
            problemInfo.forEach((d, i) => {
                const cid = cids[i];
                if (d && d.status === "OK") totalMap.set(cid, d.result.problems.length);
                else totalMap.set(cid, "?");
            });

            rows.forEach(row => {
                const cid = Number(row.dataset.contestid);
                const td = row.querySelector("td.state");
                if (!td) return;
                const set = solved.get(cid);
                if (!set) return;

                td.style.backgroundColor = "rgb(221, 238, 255)";
                td.querySelectorAll(".notice.small").forEach(x => x.remove());
                td.querySelectorAll(".cf-multi-solved").forEach(x => x.remove());

                const div = document.createElement("div");
                div.className = "notice small cf-multi-solved";
                div.style.marginTop = "0.5em";
                div.textContent = `Solved: ${set.size} out of ${totalMap.get(cid)}`;
                td.appendChild(div);
            });
        }

        //
        // ② Contest problems page highlighting (accepted-problem)
        //
        // Applies to:
        //   https://codeforces.com/contest/{id}
        //
        if (location.pathname.match(/^\/contest\/\d+$/)) {
            const cid = Number(location.pathname.split("/")[2]);
            const set = solved.get(cid);
            if (!set) return;

            const rows = document.querySelectorAll("table.problems > tbody > tr");
            rows.forEach(row => {
                const probTD = row.querySelector("td.id");
                if (!probTD) return;
                const idx = probTD.textContent.trim(); // "A", "B", ...

                if (set.has(idx)) {
                    // CF가 쓰는 accepted style
                    row.classList.add("accepted-problem");
                }
            });
        }
    }

    run();
})();
