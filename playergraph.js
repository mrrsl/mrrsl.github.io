'use-strict'
// CSV Fields: player_name,player_id,season,poss,mp,raptor_offense,raptor_defense,raptor_total,war_total,war_reg_season,war_playoffs,predator_offense,predator_defense,predator_total,pace_impact
const DATA_ENDPOINT = "https://raw.githubusercontent.com/fivethirtyeight/data/refs/heads/master/nba-raptor/modern_RAPTOR_by_player.csv";
// Utility functions for handling data
const DataView = {
    GetMax: function(dataArray, fieldname) {
        let max = dataArray[0][fieldname];
        for (let row of dataArray) {
            let num = row[fieldname];
            if (num > max) max = num;
        }
        return max;
    },
    GetMin: function(dataArray, fieldname) {
        let min = dataArray[0][fieldname];
        for (let row of dataArray) {
            let num = row[fieldname];
            if (num< min) min = num;
        }
        return min;
    },
    GetMean: function(dataArray, field) {
        let total = 0;
        let count = 0;

        for (let row of dataArray) {
            total += parseInt(row[field]);
            count++;
        }
        return total/count;
    }
}
// SVG graph margin
const MARGIN = 30;
// Top N RAPTOR ratings to show
const RAPTOR_TOP_CUT = 20;
// Minimum number of games to qualify for top ratins
const MIN_GP = 50;
// Handle of the parsed CSV data
let dataHandle;
// SVG display on the HTML document
let displayFrame = document.querySelector("#comp-graph");
// Handle for the randomly selected player
var pDataHandle;

// Generate graph axes (no labels), return axis scales
function generateAxes(frame, width, wmargin, height, hmargin, seasons) {

    let startYear = seasons[0]["season"];
    let endYear = seasons[seasons.length - 1]["season"];
    let ratingMax = DataView.GetMax(seasons, "raptor_total");
    let ratingMin = DataView.GetMin(seasons, "raptor_total");
    // Give some padding from the axes
    startYear.setFullYear(startYear.getFullYear() - 1);
    endYear.setFullYear(endYear.getFullYear() + 1);
    let xTickCount = endYear.getFullYear() - startYear.getFullYear();

    let dateScale = d3.scaleUtc([startYear, endYear], [wmargin, width - wmargin]);
    let xaxis = frame.append("g")
        .attr("transform", `translate(0, ${height - hmargin})`)
        .call(d3.axisBottom(dateScale).ticks(xTickCount + 1));

    let ratingScale = d3.scaleLinear([ratingMax, ratingMin], [hmargin, height - hmargin])
    let yaxis = frame.append("g")
        .attr("transform", `translate(${wmargin},0)`)
        .call(d3.axisLeft(ratingScale).ticks(5))
        // Add lines from y-axis
        .call(g => g.selectAll(".tick line").clone()
            .attr("x2", width - wmargin - wmargin)
            .attr("stroke-opacity", 0.1)
        );
    
    frame.append("path")
        .attr("id", "y-origin")
        .attr("fill", "none")
        .attr("stroke", "#777")
        .attr("stroke-width", 1)
        .attr("d", `M ${wmargin},${ratingScale(0)} l ${width - (2 * wmargin)},0`);

    return {season: dateScale, rating: ratingScale, x: xaxis, y: yaxis};
    
}
// Construct the entire graph
function constructDataPanel(playerSeasons) {

    let graphFrame = d3.create("svg")
        .attr("width", displayFrame.offsetWidth)
        .attr("height", displayFrame.offseightHeight);
    let axes = generateAxes(
            graphFrame,
            displayFrame.offsetWidth,
            MARGIN + 5,
            displayFrame.offsetHeight,
            MARGIN,
            playerSeasons
    );
    // Generate histogram if number of seasons < 3, line chart otherwise
    if (playerSeasons.length < 3) {
        // Set positive seasons to blue and negative seasons to red
        graphFrame.append("g")
            .attr("fill", "blue")
            .selectAll()
            .data(playerSeasons)
            .join("rect")
            .attr("x", d => axes.season(d["season"]))
            .attr("y", d => axes.rating(0))
            .attr("height", (d) => axes.rating(d["raptor_total"]) - axes.rating(0))
            .attr("width", 30);
        graphFrame.append("g")
            .attr("fill", "red")
            .selectAll()
            .data(playerSeasons)
            .join("rect")
            .attr("x", d => axes.season(d["season"]))
            .attr("y", d => axes.rating(0))
            .attr("height", (d) => axes.rating(d["raptor_total"]) - axes.rating(0))
            .attr("width", 30);
    } else {
        
        let totalRaptorLineGen = d3.line()
            .x(data => axes.season(data["season"]))
            .y(data => axes.rating(data["raptor_total"]));
        graphFrame.append("path")
            .attr("fill", "none")
            .attr("stroke", "red")
            .attr("stroke-width", 2)
            .attr("d", totalRaptorLineGen(playerSeasons));

    }   
    displayFrame.append(graphFrame.node());
}

function getAllSeasons(data, index) {
    let seasons = [data[index]];
    const NAME_KEY = "player_name"
    for (let a = index - 1; a >= 0; a--) {
        if (data[a][NAME_KEY] == seasons[0][NAME_KEY]) seasons.unshift(data[a]);
        else break;
    }
    for (let a = index + 1; a < data.length; a++) {
        if (data[a][NAME_KEY] == seasons[0][NAME_KEY]) seasons.push(data[a]);
        else break;
    }
    for (let a of seasons) {
        a["raptor_total"] = parseFloat(a["raptor_total"]);
        a["season"] = new Date(a["season"]);
    }
    return seasons;
}

// Handle the the reception of parsed csv
function processData(d3parse) {
    dataHandle = d3parse;
    // Select random player
    let selectedPlayerIndex = Math.floor(Math.random() * d3parse.length);
    let playerSeasons = getAllSeasons(d3parse, selectedPlayerIndex);
    // while (playerSeasons.length < 3) playerSeasons = getAllSeasons(d3parse, selectedPlayerIndex);
    pDataHandle = playerSeasons;
    constructDataPanel(playerSeasons);
    populateTextData();
}

// Populate the Top Performers and Honorable Mentions section
function populateTextData() {
    let randomPlayerSpan = document.querySelector("#player-name");
    let topPlayersTable = document.querySelector("#mvp-table-body");
    let honorsElement = document.querySelectorAll("ul li");
    let ratingFormatter = new Intl.NumberFormat("en-US", {maximumFractionDigits: 4});

    dataHandle.sort((a, b) => b["raptor_total"] - a["raptor_total"]);

    let topPlayers = dataHandle.slice(0, RAPTOR_TOP_CUT);
    // Populate name of random player's graph
    randomPlayerSpan.textContent = pDataHandle[0]["player_name"];
    // Populate the top players element
    for (let a = 0; a < RAPTOR_TOP_CUT; a++) {
        let row = document.createElement("tr");
        let position = document.createElement("td");
        let playerName = document.createElement("td");
        let playerSeason = document.createElement("td");
        let playerRating = document.createElement("td");

        position.textContent = a + 1;
        playerName.textContent = topPlayers[a].player_name;
        playerSeason.textContent = topPlayers[a].season;
        playerRating.textContent = ratingFormatter.format(topPlayers[a].raptor_total);
        
        row.append(position, playerName, playerSeason, playerRating);
        topPlayersTable.append(row);
    }
    // Populate honorsElement
    for (let element of honorsElement) {
        let field = element.getAttribute("id");
        let honoredOne = d3.maxIndex(dataHandle, d => parseFloat(d[field]));
        honoredOne = dataHandle[honoredOne];
        element.innerHTML = `<b>${honoredOne.player_name}</b> with the highest <span id="monofont">${field}</span> at <span>${honoredOne[field]}</span>`;
    }
}

d3.csv(DATA_ENDPOINT).then(processData).catch(e => console.log(e));

