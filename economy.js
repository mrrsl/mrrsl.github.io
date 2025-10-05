'use-strict'

const CORS_PROXY = "https://corsproxy.io/?url=";

const LEAGUE_NAME = "Mercenaries";
// Data and interaction functions for the poe.ninja API
var POEN_API = {
    // Maps orb name to the Id for GetCurrencyHistory
    CurrencyIdMap: {},
    /*
     * JSON returned by the currency overview endpoint.
     * Items will be accessed via CurrencyOverviewData.lines[idx]
     * name: currencyTypeName
     * daily change: receiveSparkLine.totalChange
     */
    CurrencyOverviewData: null,
    BaseEndpoint: "https://poe.ninja/api/data/",
    GetOverviewData: function(league) {
        return `${this.BaseEndpoint}currencyoverview?league=${league}&type=Currency`;
    },
    GetCurrencyHistory: function(orbId, league) {
        return `${this.BaseEndpoint}currencyhistory?league=${league}&type=Currency&currencyId=${orbId}`;
    },
    GetRollingAverage(days, data) {
        let arr = data.receiveCurrencyGraphData;
        let acc = 0;
        for (let a = arr.length - 1; a > arr.length - 1 - days; a--) {
            acc += arr[a].value;
        }
        return acc / days;
    }
}
// Fetches poe.ninja's currency overview data and populates POEN_API.CurrencyOverview
async function fetchCurrencyOverivew(league) {
    
    let data = await fetch(CORS_PROXY + POEN_API.GetOverviewData(league));
    data = (data.status == 200)? await data.json(): undefined;

    if (data && !(POEN_API.CurrencyOverviewData)) {

        POEN_API.CurrencyOverviewData = data;
        let orbDetails = data.currencyDetails;

        for (let orb of orbDetails) {
            POEN_API.CurrencyIdMap[orb.name] = orb.id;
        }
        data.lines.sort((a, b) => {
            return a.receiveSparkLine.totalChange - b.receiveSparkLine.totalChange;
        });
    }
    return new Promise((res, bad) => {
        if (data) res(data);
        else bad("Fetch failed");
    });
}
// Fetches price history for a specific currency
async function fetchCurrencyHistory(league, orbId) {
    let data = await fetch(CORS_PROXY + POEN_API.GetCurrencyHistory(orbId, league));
    let dataJson = await data.json();
    return new Promise((good, bad) => {
        if (dataJson) good(dataJson);
        else bad("Fetch failed");
    });
}

// Populates the top movers section with proper headings, text and graphs
function populateCurrencyDisplay() {
    let currencyDisplays = document.querySelectorAll("div.article-item>article");
    let topFive = POEN_API.CurrencyOverviewData.lines.slice(POEN_API.CurrencyOverviewData.lines.length - 4);
    let index = topFive.length - 1;

    for (let element of currencyDisplays) {
        let totalChange = topFive[index].receiveSparkLine.totalChange;
        let currencyName = topFive[index].currencyTypeName;

        let heading = getChildByTag(element, "H4");
        let figure = getChildByTag(element, "FIGURE");
        let changebox = getChildByTag(element, "DIV");
        let change = getChildByTag(changebox, "P");

        heading.textContent = currencyName;
        change.textContent = totalChange + '%';
        if (totalChange > 0.0001) {
            change.className = "positive";
        } else if (totalChange < -0.0001) {
            change.className = "negative";
        }

        // Must generate figcaption here
        fetchCurrencyHistory(LEAGUE_NAME, POEN_API.CurrencyIdMap[topFive[index].currencyTypeName])
            .then( (data) => {
                let rollingMean = POEN_API.GetRollingAverage(14, data);
                let caption = document.createElement("figcaption");
                caption.textContent = `14-day average: ${rollingMean}`;
                figure.append(caption);
                figure.append(generatePriceHistoryGraph(data, figure).node());

            });
        
        index--;
    }
}

// Helper function to cleanly convert number of days into ms for use with Date.now()
function daysToMs(days) {
    return days * 24 * 60 * 60 * 1000;
}

// Generates a d3 svg element for the given price history data
function generatePriceHistoryGraph(data, container) {

    let height = container.offsetHeight;
    let width = container.offsetWidth;

    let svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height);
    const wMargin = 40;
    const hMargin = 30;
    const dayThreshold = 14;

    // Set domain
    let valueMax = 0;
    let startIndex = data.receiveCurrencyGraphData.length - dayThreshold - 1;
    for (let a = startIndex; a < data.receiveCurrencyGraphData.length; a++) {
        let day = data.receiveCurrencyGraphData[a];
        if (day.value > valueMax) valueMax = day.value;
    }

    let dateScale = d3.scaleLinear([dayThreshold, 0],[wMargin, width - wMargin]);
    let priceScale = d3.scaleLinear([0, valueMax * 1.05], [height - hMargin, hMargin]);
    let priceFormatter = d3.format("3.2f");

    let xAxis = svg.append("g")
        .attr("class", "graph-x-axis")
        .attr("transform", `translate(0, ${height - hMargin})`)
        .call(d3.axisBottom(dateScale).ticks(dayThreshold));
    
    let yAxis = svg.append("g")
        .attr("class", "graph-y-axis")
        .attr("transform", `translate(${wMargin}, 0)`)
        .call(d3.axisLeft(priceScale).ticks(4))
        .selectAll("text")
        .data(priceScale.ticks())
        .text(priceFormatter);

    let historyLineGen = d3.line()
        .x(data => dateScale(data.daysAgo))
        .y(data => priceScale(data.value));

    svg.append("path")
        .attr("fill", "none")
        .attr("stroke", "goldenrod")
        .attr("stroke-width", 3)
        .attr("d", historyLineGen(data.receiveCurrencyGraphData.slice(startIndex)));

    return svg;
}

// Helper function to return the first child with a given tag name
function getChildByTag(node, tag) {
    for (let ch of node.children) {
        if (ch.tagName == tag) return ch;
    }
    return undefined;
}

fetchCurrencyOverivew(LEAGUE_NAME).then( data => {
    populateCurrencyDisplay();
});