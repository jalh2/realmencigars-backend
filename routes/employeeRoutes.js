const express = require('express');
const router = express.Router();
const {
  getEmployeesByStore,
  addEmployee,
  clockIn,
  clockOut,
  payEmployee,
  updateEmployee,
  toggleEmployeeActiveState,
  getWorkHistory
} = require('../controllers/employeeController');

// Get all employees for a store
router.get('/:store', getEmployeesByStore);

// Add a new employee
router.post('/', addEmployee);

// Clock in an employee
router.post('/:employeeId/clockin', clockIn);

// Clock out an employee
router.post('/:employeeId/clockout', clockOut);

// Pay an employee
router.post('/:employeeId/pay', payEmployee);

// Update employee details
router.put('/:employeeId', updateEmployee);

// Toggle employee active state
router.patch('/:employeeId/toggle-active', toggleEmployeeActiveState);

// Get work history for an employee
router.get('/:employeeId/history', getWorkHistory);

module.exports = router;
