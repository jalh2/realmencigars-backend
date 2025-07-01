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
  position: {
    type: String,
    required: true,
    trim: true
  },
  payGrade: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Please fill a valid email address'],
    required: false // Optional
  },
  overtimeRate: {
    type: Number,
    default: 1.5
  },
  overtimeHours: {
    type: Number,
    default: 0
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
