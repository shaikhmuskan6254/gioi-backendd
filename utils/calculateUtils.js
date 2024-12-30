// utils/coordinatorUtils.js

const {
    ref,
    get,
    set,
    update,
  } = require("firebase/database");
  const axios = require("axios");
  const { v4: uuidv4 } = require("uuid");
  
  // Category and Incentive Configurations
  const CATEGORY_CONFIG = [
    { name: "Starter Partner", min: 1, max: 100, perStudentShare: 75 },
    { name: "Bronze Partner", min: 101, max: 200, perStudentShare: 85 },
    { name: "Silver Partner", min: 201, max: 300, perStudentShare: 95 },
    { name: "Gold Partner", min: 301, max: 400, perStudentShare: 110 },
    { name: "Platinum Partner", min: 401, max: Infinity, perStudentShare: 125 },
  ];
  
  const ENGAGEMENT_BONUSES = [
    { threshold: 50, bonus: 20 }, // Exceptional Engagement
    { threshold: 20, bonus: 15 }, // High Engagement
    { threshold: 10, bonus: 10 }, // Moderate Engagement
    { threshold: 5, bonus: 5 },   // Basic Engagement
    { threshold: 0, bonus: 0 },   // Fallback
  ];
  
  /**
   * Determine Partner Category based on total paid students
   */
  const determineCategory = (totalPaidStudents) => {
    for (const category of CATEGORY_CONFIG) {
      if (totalPaidStudents >= category.min && totalPaidStudents <= category.max) {
        return category;
      }
    }
    return CATEGORY_CONFIG[0]; // Default to Starter
  };
  
  /**
   * Calculate Engagement Bonus based on practice tests attempted
   */
  const calculateEngagementBonus = (practiceTestsAttempted) => {
    for (const bonus of ENGAGEMENT_BONUSES) {
      if (practiceTestsAttempted >= bonus.threshold) {
        return bonus.bonus;
      }
    }
    return 0;
  };
  
  /**
   * Fetch and update coordinator incentives
   */
  const calculateIncentivesInternal = async (database, userId) => {
    const coordRef = ref(database, `coordinators/${userId}`);
    const coordSnapshot = await get(coordRef);
    
    if (!coordSnapshot.exists()) {
      throw new Error("Coordinator not found.");
    }
    
    const coordData = coordSnapshot.val();
    
    // Fetch students added by the coordinator with paymentStatus as 'paid'
    const studentsRef = ref(database, "gio-students");
    const studentsSnapshot = await get(studentsRef);
    
    if (!studentsSnapshot.exists()) {
      // Reset incentives if no students
      await update(coordRef, {
        category: "Starter Partner",
        totalRegistrations: 0,
        totalIncentives: 0,
        totalEngagementBonus: 0,
        totalEarnings: 0,
        lastIncentiveCalculation: new Date().toISOString(),
      });
      return {
        category: "Starter Partner",
        totalRegistrations: 0,
        totalIncentives: 0,
        totalEngagementBonus: 0,
        totalEarnings: 0,
      };
    }
    
    const allStudents = studentsSnapshot.val();
    const studentsByCoordinator = Object.values(allStudents).filter(
      (s) => s.addedBy === userId && s.paymentStatus === "paid"
    );
    
    const totalRegistrations = studentsByCoordinator.length;
    const categoryObj = determineCategory(totalRegistrations);
    
    let totalEngagementBonus = 0;
    for (const student of studentsByCoordinator) {
      const practiceTestsAttempted = student.practiceTestsAttempted || 0;
      totalEngagementBonus += calculateEngagementBonus(practiceTestsAttempted);
    }
    
    const registrationIncentives = totalRegistrations * categoryObj.perStudentShare;
    const totalIncentives = registrationIncentives;
    const totalEarnings = totalIncentives + totalEngagementBonus;
    
    await update(coordRef, {
      category: categoryObj.name,
      totalRegistrations,
      totalIncentives,
      totalEngagementBonus,
      totalEarnings,
      lastIncentiveCalculation: new Date().toISOString(),
    });
    
    return {
      category: categoryObj.name,
      totalRegistrations,
      totalIncentives,
      totalEngagementBonus,
      totalEarnings,
    };
  };
  
  /**
   * Validate IFSC Code Format
   */
  const isValidIFSC = (ifsc) => /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc);
  
  /**
   * Validate UPI ID Format
   */
  const isValidUPI = (upiId) => /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId);
  
  /**
   * Fetch Bank Details using IFSC
   */
  const fetchBankDetails = async (ifsc) => {
    try {
      const response = await axios.get(`https://ifsc.razorpay.com/${ifsc}`);
      return response.data;
    } catch (error) {
      throw new Error("Invalid IFSC code or unable to fetch bank details.");
    }
  };
  
  /**
   * Hash Password
   */
  const hashPassword = async (password) => {
    const bcrypt = require("bcrypt");
    return await bcrypt.hash(password, 10);
  };
  
  module.exports = {
    determineCategory,
    calculateEngagementBonus,
    calculateIncentivesInternal,
    isValidIFSC,
    isValidUPI,
    fetchBankDetails,
    hashPassword,
  };
  