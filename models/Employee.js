const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  payRate: {
    type: Number,
    required: true
  },
  workHistory: [{
    clockInTime: { type: Date, required: true },
    clockOutTime: { type: Date }
  }],
  isClockedIn: {
    type: Boolean,
    default: false
  },
  balance: {
    type: Number,
    default: 0
  },
  store: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

employeeSchema.index({ store: 1, name: 1 });

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;
