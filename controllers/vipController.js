const Vip = require('../models/Vip');
const Transaction = require('../models/Transaction');

// @desc    Create a new VIP member
// @route   POST /api/vips
// @access  Private/Admin
const createVip = async (req, res) => {
  const { name, store, currency, amountReceivedLRD, amountReceivedUSD, membershipTier } = req.body;

  const USD_TO_LRD_RATE = 170;

  let registrationFeeUSD = 25; // Base fee
  let maxDiscountedCigars;

  switch (membershipTier) {
    case 'silver':
      registrationFeeUSD += 50;
      maxDiscountedCigars = 5;
      break;
    case 'gold':
      registrationFeeUSD += 75;
      maxDiscountedCigars = 7;
      break;
    case 'platinum':
      registrationFeeUSD += 100;
      maxDiscountedCigars = 10;
      break;
    default: // Should default to silver as per model
      registrationFeeUSD += 50;
      maxDiscountedCigars = 5;
      break;
  }

  const registrationFeeLRD = registrationFeeUSD * USD_TO_LRD_RATE;
  const memberId = `VIP-${Date.now()}`;
  const registrationFee = registrationFeeLRD;

  try {
    // Calculate expiry date
    const signupDate = new Date();
    let expiryDate = new Date(signupDate);
    const lastPaymentDate = signupDate;
    let nextDueDate = new Date(signupDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    // Membership is always 1 month
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    // Create a sales transaction for the VIP membership
    const transaction = new Transaction({
      store,
      type: 'sale',
      saleCategory: 'vip_membership',
      customerName: name,
      totalLRD: currency === 'LRD' ? registrationFee : 0,
      totalUSD: currency === 'USD' ? registrationFeeUSD : 0,
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
      signupDate,
      membershipDuration: '1m',
      expiryDate,
      transactionId: savedTransaction._id,
      memberId,
      registrationFee,
      lastPaymentDate,
      nextDueDate,
      membershipStatus: 'active',
      unpaidMonths: 0,
      monthlyCredit: 100,
      cigarsDiscountCount: 0,
      membershipTier,
      maxDiscountedCigars
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


// @desc    Renew a VIP member's membership
// @route   PUT /api/vips/:id/renew
// @access  Private/Admin
const renewVip = async (req, res) => {
  const { id } = req.params;
  const { currency, amountReceivedLRD, amountReceivedUSD, membershipTier } = req.body; // Assuming payment details are sent

  const USD_TO_LRD_RATE = 170;
  let registrationFeeUSD = 25; // Base fee
  let maxDiscountedCigars;
  const tier = membershipTier || vip.membershipTier; // Use new tier if provided, otherwise existing

  switch (tier) {
    case 'silver':
      registrationFeeUSD += 50;
      maxDiscountedCigars = 5;
      break;
    case 'gold':
      registrationFeeUSD += 75;
      maxDiscountedCigars = 7;
      break;
    case 'platinum':
      registrationFeeUSD += 100;
      maxDiscountedCigars = 10;
      break;
    default:
      registrationFeeUSD += 50;
      maxDiscountedCigars = 5;
      break;
  }

  const registrationFeeLRD = registrationFeeUSD * USD_TO_LRD_RATE;
  const registrationFee = registrationFeeLRD;

  try {
    const vip = await Vip.findById(id);

    if (!vip) {
      return res.status(404).json({ error: 'VIP member not found' });
    }

    // Check if the VIP is disabled, if so, they need to re-register
    if (vip.membershipStatus === 'disabled') {
      return res.status(400).json({ error: 'Disabled VIP members must re-register' });
    }

    // Update lastPaymentDate and nextDueDate
    vip.lastPaymentDate = new Date();
    vip.nextDueDate.setMonth(vip.nextDueDate.getMonth() + 1);
    vip.unpaidMonths = 0; // Reset unpaid months on successful renewal
    vip.membershipStatus = 'active'; // Set status to active on successful renewal
    vip.monthlyCredit += 100; // Add $100 to monthly credit with rollover
    vip.cigarsDiscountCount = 0; // Reset discounted cigars count on renewal
    vip.membershipTier = tier;
    vip.maxDiscountedCigars = maxDiscountedCigars;

    // Create a sales transaction for the VIP membership renewal
    const transaction = new Transaction({
      store: vip.store,
      type: 'sale',
      saleCategory: 'vip_membership_renewal',
      customerName: vip.name,
      totalLRD: currency === 'LRD' ? registrationFee : 0,
      totalUSD: currency === 'USD' ? registrationFeeUSD : 0,
      currency,
      amountReceivedLRD,
      amountReceivedUSD,
      productsSold: [] // No physical products for VIP membership renewal
    });

    const savedTransaction = await transaction.save();

    vip.transactionId = savedTransaction._id; // Update transaction ID

    const updatedVip = await vip.save();

    res.json(updatedVip);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


// @desc    Update VIP membership statuses (dormant/disabled)
// @route   PUT /api/vips/update-statuses
// @access  Private/Admin (should be called by a scheduled task)
const updateVipStatuses = async (req, res) => {
  try {
    const vips = await Vip.find({});
    const today = new Date();

    for (const vip of vips) {
      if (vip.membershipStatus === 'disabled') {
        continue; // Disabled members require new registration, no automatic changes
      }

      let unpaidMonths = 0;
      let currentDueDate = new Date(vip.nextDueDate);

      // Calculate unpaid months
      while (currentDueDate < today) {
        unpaidMonths++;
        currentDueDate.setMonth(currentDueDate.getMonth() + 1);
      }

      if (unpaidMonths > 0) {
        vip.unpaidMonths = unpaidMonths;
        if (unpaidMonths >= 6) {
          vip.membershipStatus = 'disabled';
        } else if (unpaidMonths >= 3) {
          vip.membershipStatus = 'dormant';
        }
      } else {
        vip.unpaidMonths = 0;
        vip.membershipStatus = 'active'; // Should be active if no unpaid months
      }
      await vip.save();
    }

    res.status(200).json({ message: 'VIP statuses updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { createVip, getVips, renewVip, updateVipStatuses };
