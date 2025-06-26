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
  membershipFee: {
    type: Number,
    required: true
  },
  signupDate: {
    type: Date,
    default: Date.now
  },
  membershipDuration: {
    type: String,
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
  }
});

vipSchema.index({ store: 1, expiryDate: -1 });

const Vip = mongoose.model('Vip', vipSchema);

module.exports = Vip;
