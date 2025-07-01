const mongoose = require('mongoose');

const vipSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  store: {
    type: String,
    required: true,
    trim: true
  },

  signupDate: {
    type: Date,
    default: Date.now
  },
  membershipDuration: {
    type: String,
    default: '1m',
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true
  },
  memberId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  registrationFee: {
    type: Number,
    required: true,
    default: 25
  },
  membershipStatus: {
    type: String,
    enum: ['active', 'dormant', 'disabled'],
    default: 'active'
  },
  lastPaymentDate: {
    type: Date
  },
  nextDueDate: {
    type: Date
  },
  unpaidMonths: {
    type: Number,
    default: 0
  },
  monthlyCredit: {
    type: Number,
    default: 100 // $100 monthly credit
  },
  cigarsDiscountCount: {
    type: Number,
    default: 0 // Count of cigars that received 20% discount
  }
});

vipSchema.index({ store: 1, expiryDate: -1 });

const Vip = mongoose.model('Vip', vipSchema);

module.exports = Vip;
