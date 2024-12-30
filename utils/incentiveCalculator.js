// utils/incentiveCalculator.js

const { ref, get, update } = require("firebase/database");

/**
 * Determine Partner Category based on total paid students
 * @param {number} totalPaidStudents
 * @param {Array} CATEGORY_CONFIG
 * @returns {Object} Category Object
 */
function determineCategory(totalPaidStudents, CATEGORY_CONFIG) {
  for (const cat of CATEGORY_CONFIG) {
    if (totalPaidStudents >= cat.min && totalPaidStudents <= cat.max) {
      return cat;
    } else if (cat.max === Infinity && totalPaidStudents >= cat.min) {
      return cat;
    }
  }
  // Default to Starter if no match (unlikely if config covers all ranges)
  return CATEGORY_CONFIG[0];
}

/**
 * Calculate Engagement Bonus based on practice tests attempted
 * @param {number} practiceTestsAttempted
 * @param {Array} ENGAGEMENT_BONUSES
 * @returns {number} Bonus Amount
 */
function calculateEngagementBonus(practiceTestsAttempted, ENGAGEMENT_BONUSES) {
  for (const level of ENGAGEMENT_BONUSES) {
    if (practiceTestsAttempted >= level.threshold) {
      return level.bonus;
    }
  }
  return 0;
}

/**
 * Calculate Incentives for a Coordinator
 * @param {Object} database - Firebase Database Instance
 * @param {string} userId - Coordinator's User ID
 * @param {Array} CATEGORY_CONFIG - Configuration for Categories
 * @param {Array} ENGAGEMENT_BONUSES - Configuration for Engagement Bonuses
 * @returns {Object} Incentive Data
 */
async function calculateIncentivesForCoordinator(database, userId, CATEGORY_CONFIG, ENGAGEMENT_BONUSES) {
  try {
    // Get coordinator info
    const coordRef = ref(database, `coordinators/${userId}`);
    const coordSnapshot = await get(coordRef);
    if (!coordSnapshot.exists()) {
      throw new Error("Coordinator not found.");
    }
    const coordData = coordSnapshot.val();

    // Fetch students
    const studentsRef = ref(database, "gio-students");
    const studentsSnapshot = await get(studentsRef);
    if (!studentsSnapshot.exists()) {
      // No students found; reset incentives
      await update(coordRef, {
        category: "Starter Partner",
        totalPaidStudents: 0,
        totalIncentives: 0,
        bonusAmount: 0,
        totalEarnings: 0,
        lastIncentiveCalculation: new Date().toISOString(),
      });
      return {
        category: "Starter Partner",
        totalPaidStudents: 0,
        baseIncentive: 0,
        bonusAmount: 0,
        totalEarnings: 0,
      };
    }

    const allStudents = studentsSnapshot.val();
    const studentsByCoordinator = Object.values(allStudents).filter(
      (s) => s.addedBy === userId && s.paymentStatus === "paid_but_not_attempted"
    );

    const totalPaidStudents = studentsByCoordinator.length;

    // Determine category
    const categoryObj = determineCategory(totalPaidStudents, CATEGORY_CONFIG);

    // Calculate engagement bonuses
    let totalEngagementBonus = 0;
    for (const stu of studentsByCoordinator) {
      const practiceTestsAttempted = stu.practiceTestsAttempted || 0;
      const bonus = calculateEngagementBonus(practiceTestsAttempted, ENGAGEMENT_BONUSES);
      totalEngagementBonus += bonus;
    }

    // Per student share is from categoryObj
    const perStudentShare = categoryObj.perStudentShare;
    const baseIncentive = perStudentShare * totalPaidStudents;

    // Calculate incentives and bonuses
    const totalIncentives = baseIncentive;
    const bonusAmount = totalEngagementBonus;

    // Calculate total earnings
    const totalEarnings = totalIncentives + bonusAmount;

    // Update coordinator record with new fields
    await update(coordRef, {
      category: categoryObj.name,
      totalPaidStudents: totalPaidStudents,
      totalIncentives: totalIncentives,
      bonusAmount: bonusAmount,
      totalEarnings: totalEarnings,
      lastIncentiveCalculation: new Date().toISOString(),
    });

    return {
      category: categoryObj.name,
      totalPaidStudents,
      baseIncentive,
      bonusAmount,
      totalEarnings,
    };
  } catch (error) {
    throw error;
  }
}

module.exports = { calculateIncentivesForCoordinator };
