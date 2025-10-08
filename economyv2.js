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
    },
    GeneratedGraphs: []
}


/**
 * Class that manages graph resizes for the d3 linecharts.
 */
class Histograph {
    /**
     * Creates and stores properties for the price history graph retrieved by the currency history endpoint.
     * This will NOT append the graph to the parent.
     * @param {Array} data Contains the price history data.
     * @param {Element} container Parent element of the SVG.
     */
    constructor(data, container) {
        /** Fetched history. */
        this.historicalData = data;
        /** DOM parent element. */
        this.parent = container;
        /** Width of SVG frame. */
        this.width = container.offsetWidth;
        /** Height of SVG frame. */
        this.height = container.offsetHeight;
        /** Sensible default for y-axis numbers. */
        const wMargin = 40;
        /** Sensible default for x-axis numbers. */
        const hMargin = 30;
        /** History upperbound. */
        const dayThreshold = 14;
        /** SVG frame for our graph. */
        this.svgFrame = d3.create("svg")
            .attr("width", this.width)
            .attr("height", this.height);
        
        let valueMax = 0;
        let startIndex = data.receiveCurrencyGraphData.length - dayThreshold - 1;
        for (let a = startIndex; a < data.receiveCurrencyGraphData.length; a++) {
            let day = data.receiveCurrencyGraphData[a];
            if (day.value > valueMax) valueMax = day.value;
        }

        /** D3 scale representing how old the price datapoint is. */
        this.timeScale = d3.scaleLinear([dayThreshold, 0],[wMargin, this.width - wMargin]);
        /** Chaos value. */
        this.priceScale = d3.scaleLinear([0, valueMax * 1.05], [this.height - hMargin, hMargin]);
        this.priceFormatter = d3.format("3.2f");

        this.xAxis = this.svgFrame.append("g")
            .attr("class", "graph-x-axis")
            .attr("transform", `translate(0, ${this.height - hMargin})`)
            .call(d3.axisBottom(this.timeScale).ticks(dayThreshold));
        
        this.yAxis = this.svgFrame.append("g")
            .attr("class", "graph-y-axis")
            .attr("transform", `translate(${wMargin}, 0)`)
            .call(d3.axisLeft(this.priceScale).ticks(3));
        
        this.yAxis.selectAll("text")
            .data(this.priceScale.ticks())
            .text(this.priceFormatter);
        
        let historyLineGen = d3.line()
            .x(data => this.timeScale(data.daysAgo))
            .y(data => this.priceScale(data.value));
        
        this.graphLine = this.svgFrame.append("path")
            .attr("fill", "none")
            .attr("stroke", "goldenrod")
            .attr("stroke-width", 3)
            .attr("d", historyLineGen(data.receiveCurrencyGraphData.slice(startIndex)));
    }
    /**
     * Scales the graph to the desired width and height.
     * @param {Number} expectedWidth Desired width of container.
     * @param {Number} expectedHeight Desired height of container.
     */
    resize(expectedWidth, expectedHeight) {
        let widthScaleFactor = expectedWidth / this.width;
        let heightScaleFactor = expectedHeight / this.height;

        this.svgFrame.attr("transform", `scale(${widthScaleFactor}, ${heightScaleFactor})`)
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
            POEN_API.CurrencyIdMap[orb.name] = {
                id: orb.id,
                img: orb.icon
            };
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
        fetchCurrencyHistory(LEAGUE_NAME, POEN_API.CurrencyIdMap[currencyName].id)
            .then((data) => {
                let icon = getChildByTag(element, "IMG");
                let rollingMean = POEN_API.GetRollingAverage(14, data);
                let numform = new Intl.NumberFormat("en-IN", {maximumFractionDigits: 3});
                let caption = document.createElement("figcaption");
                let graph = new Histograph(data, figure);

                icon.setAttribute("src", POEN_API.CurrencyIdMap[currencyName].img);
                caption.textContent = `14-day average: ${numform.format(rollingMean)}`;
                figure.append(caption);
                figure.append(graph.svgFrame.node());
                POEN_API.GeneratedGraphs.push(graph);
            });
        
        index--;
    }
}

// Helper function to cleanly convert number of days into ms for use with Date.now()
function daysToMs(days) {
    return days * 24 * 60 * 60 * 1000;
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

window.addEventListener("resize", (event) => {
    for (let graph of POEN_API.GeneratedGraphs) {
        let rHeight = graph.parent.offsetHeight;
        let rWidth = graph.parent.offsetWidth;
        graph.resize(rWidth, rHeight);
    }
})