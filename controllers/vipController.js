const Vip = require('../models/Vip');
const Transaction = require('../models/Transaction');

// @desc    Create a new VIP member
// @route   POST /api/vips
// @access  Private/Admin
const createVip = async (req, res) => {
  const { name, store, membershipFee, membershipDuration, currency, amountReceivedLRD, amountReceivedUSD } = req.body;

  try {
    // Calculate expiry date
    const signupDate = new Date();
    let expiryDate = new Date(signupDate);
    const duration = parseInt(membershipDuration.slice(0, -1));
    const unit = membershipDuration.slice(-1);

    if (unit === 'm') {
      expiryDate.setMonth(expiryDate.getMonth() + duration);
    } else if (unit === 'y') {
      expiryDate.setFullYear(expiryDate.getFullYear() + duration);
    }

    // Create a sales transaction for the VIP membership
    const transaction = new Transaction({
      store,
      type: 'sale',
      saleCategory: 'vip_membership',
      customerName: name,
      totalLRD: currency === 'LRD' ? membershipFee : 0,
      totalUSD: currency === 'USD' ? membershipFee : 0,
      currency,
      amountReceivedLRD,
      amountReceivedUSD,
      productsSold: [] // No physical products for VIP membership
    });

    const savedTransaction = await transaction.save();

    // Create the new VIP member
    const newVip = new Vip({
      name,
      store,
      membershipFee,
      signupDate,
      membershipDuration,
      expiryDate,
      transactionId: savedTransaction._id
    });

    const savedVip = await newVip.save();

    res.status(201).json(savedVip);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// @desc    Get all VIP members
// @route   GET /api/vips
// @access  Private/Admin
const getVips = async (req, res) => {
  try {
    const vips = await Vip.find({}).sort({ signupDate: -1 });
    res.json(vips);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { createVip, getVips };
