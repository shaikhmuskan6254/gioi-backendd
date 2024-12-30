// utils/ranking.js

const fs = require("fs");
const path = require("path");

/**
 * Function to get rank range and category based on score.
 * @param {number} score - The student's score.
 * @param {Array} jsonData - The ranking data from JSON.
 * @param {number} maxScore - The maximum possible score.
 * @returns {Object} - Contains rankRange and category.
 */
const getRankAndCategory = (score, jsonData, maxScore) => {
  if (score === maxScore) {
    return { rank: 1, category: "Gold" };
  }

  // Find the matching score entry in the JSON data
  const entry = jsonData.find((item) => item.score === score);

  if (!entry) {
    return { rank: "Unranked", category: "Unranked" };
  }

  const [start, end] = entry.rankRange.split(" to ").map(Number);
  const randomRank = Math.floor(Math.random() * (end - start + 1)) + start;

  return { rank: randomRank, category: entry.category };
};

/**
 * Function to get category based on rank.
 * @param {number} rank - The student's rank.
 * @returns {string} - The category corresponding to the rank.
 */
const getCategoryFromRank = (rank) => {
  if (rank >= 1 && rank <= 10) {
    return "Gold";
  } else if (rank >= 11 && rank <= 20) {
    return "Silver";
  } else if (rank >= 21 && rank <= 30) {
    return "Bronze";
  } else {
    return "Participant";
  }
};

module.exports = { getRankAndCategory, getCategoryFromRank };
